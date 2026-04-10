import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { parseJsonStream } from './parsers/json.parser';
import { parseXmlStream } from './parsers/xml.parser';
import { parseXlsxStream } from './parsers/xlsx.parser';
import { parseCsvStream } from './parsers/csv.parser';
import * as unzipper from 'unzipper';
import { Readable, PassThrough } from 'stream';

@Processor('import-queue')
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(private prisma: PrismaService, private httpService: HttpService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, datasetUrl, format, structConfig, datasetId } = job.data;
    
    this.logger.log(`Starting import job ${jobId} from ${datasetUrl} (format: ${format})`);
    
    // Validate URL
    try {
      new URL(datasetUrl);
    } catch {
      throw new Error(`Invalid URL: ${datasetUrl}. Please provide a valid full URL starting with http:// or https://`);
    }
    
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'DOWNLOADING' },
    });

    try {
      // 1. Видаляємо всі попередні записи цього датасету (перезапис)
      await this.prisma.datasetRecord.deleteMany({
        where: { dataset_id: datasetId },
      });

      // 2. Скачуємо файл потоком
      const response = await this.httpService.axiosRef({
        method: 'GET',
        url: datasetUrl,
        responseType: 'stream',
      });

      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' },
      });

      const rawStream: Readable = response.data;

      // 3. Визначаємо, чи є це ZIP-архів:
      // Перевіряємо Content-Type або суфікс URL:
      const contentType: string = response.headers['content-type'] || '';
      const isZip =
        contentType.includes('zip') ||
        datasetUrl.toLowerCase().split('?')[0].endsWith('.zip');

      if (isZip) {
        this.logger.log(`Detected ZIP archive for job ${jobId}, extracting...`);
        await this.processZipStream(rawStream, jobId, datasetId, format, structConfig);
      } else {
        await this.parseStream(rawStream, jobId, datasetId, format, structConfig);
      }

      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', completed_at: new Date() },
      });

      this.logger.log(`Job ${jobId} finished successfully`);
    } catch (error: any) {
      this.logger.error(`Import failed for job ${jobId}`, error.stack);
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', completed_at: new Date() },
      });
      throw error;
    }
  }

  /**
   * Витягує першый XML або JSON файл із ZIP-архіву і передає його потоково у парсер.
   */
  private async processZipStream(
    zipStream: Readable,
    jobId: string,
    datasetId: string,
    format: string,
    structConfig: any,
  ): Promise<void> {
    const targetExts = [format.toLowerCase(), 'xml', 'json', 'xlsx', 'xls', 'csv'];

    return new Promise((resolve, reject) => {
      const zip = zipStream.pipe(unzipper.Parse({ forceStream: true }));

      let handled = false;

      zip.on('entry', async (entry: any) => {
        const fileName: string = (entry.path || '').toLowerCase();
        const matchedExt = targetExts.find((ext) => fileName.endsWith(`.${ext}`));

        if (!handled && matchedExt) {
          handled = true;
          const detectedFormat = matchedExt === 'xlsx' || matchedExt === 'xls' ? matchedExt : matchedExt;

          this.logger.log(`Extracting file from ZIP: ${entry.path} (format: ${detectedFormat})`);

          try {
            await this.parseStream(entry, jobId, datasetId, detectedFormat, structConfig);
            resolve();
          } catch (err) {
            reject(err);
          }
        } else {
          // Пропускаємо непотрібні записи
          entry.autodrain();
        }
      });

      zip.on('error', reject);
      zip.on('finish', () => {
        if (!handled) {
          reject(new Error(`No supported file (${targetExts.join(', ')}) found inside ZIP archive`));
        }
      });
    });
  }

  private async parseStream(
    stream: any,
    jobId: string,
    datasetId: string,
    format: string,
    structConfig: any,
  ): Promise<void> {
    const fmt = format.toLowerCase();
    if (fmt === 'json') {
      await parseJsonStream(stream, jobId, datasetId, this.prisma, structConfig);
    } else if (fmt === 'xml') {
      await parseXmlStream(stream, jobId, datasetId, this.prisma, structConfig);
    } else if (['xls', 'xlsx'].includes(fmt)) {
      await parseXlsxStream(stream, jobId, datasetId, this.prisma, structConfig);
    } else if (fmt === 'csv') {
      await parseCsvStream(stream, jobId, datasetId, this.prisma, structConfig);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  }
}
