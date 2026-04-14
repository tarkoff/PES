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
import { Readable } from 'stream';
import { firstValueFrom } from 'rxjs';

@Processor('import-queue')
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(private prisma: PrismaService, private httpService: HttpService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, datasetUrl, format, structConfig, datasetId } = job.data;

    this.logger.log(`Starting import job ${jobId} from ${datasetUrl} (format: ${format})`);

    try {
      new URL(datasetUrl);
    } catch {
      throw new Error(`Invalid URL: ${datasetUrl}`);
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

      // 2. Скачуємо файл з retry логікою
      const { stream, headers } = await this.downloadWithRetry(datasetUrl, jobId);

      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' },
      });

      // 3. Визначаємо, чи є це ZIP-архів:
      const contentType: string = headers['content-type'] || '';
      const isZip =
        contentType.includes('zip') ||
        datasetUrl.toLowerCase().split('?')[0].endsWith('.zip');

      if (isZip) {
        this.logger.log(`Detected ZIP archive for job ${jobId}, extracting...`);
        await this.processZipStream(stream, jobId, datasetId, format, structConfig);
      } else {
        await this.parseStream(stream, jobId, datasetId, format, structConfig);
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
   * Завантажує файл з retry логікою для transient помилок
   */
  private async downloadWithRetry(url: string, jobId: string, maxRetries = 3): Promise<{ stream: Readable; headers: Record<string, any> }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Download attempt ${attempt}/${maxRetries} for job ${jobId}`);
        return await this.downloadFile(url);
      } catch (err: any) {
        lastError = err;
        const isTransient =
          err.message?.includes('aborted') ||
          err.message?.includes('ECONNRESET') ||
          err.message?.includes('ETIMEDOUT') ||
          err.message?.includes('socket hang up') ||
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT';

        if (isTransient && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          this.logger.warn(`Download failed (attempt ${attempt}): ${err.message}. Retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        } else if (!isTransient) {
          throw err;
        }
      }
    }

    throw lastError || new Error('Download failed after retries');
  }

  /**
   * Завантажує файл через axios
   */
  private async downloadFile(url: string): Promise<{ stream: Readable; headers: Record<string, any> }> {
    const response$ = this.httpService.get(url, {
      responseType: 'stream',
      timeout: 300_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      decompress: true,
      headers: {
        'User-Agent': 'DataGovUA-Importer/1.0',
      },
    });

    const response = await firstValueFrom(response$);
    const stream: Readable = response.data;

    // Перевіряємо, чи відповід дійсно успішний
    const status = response.status;
    if (status >= 400) {
      stream.destroy();
      throw new Error(`HTTP ${status}: ${response.statusText || 'Error'}`);
    }

    return {
      stream,
      headers: response.headers,
    };
  }

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
          const detectedFormat = matchedExt;

          this.logger.log(`Extracting file from ZIP: ${entry.path} (format: ${detectedFormat})`);

          try {
            await this.parseStream(entry, jobId, datasetId, detectedFormat, structConfig);
            resolve();
          } catch (err) {
            reject(err);
          }
        } else {
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
    
    // Handle JSON with JSONL variant
    if (fmt === 'json') {
      // Check if structConfig specifies JSON Lines format
      const isJsonLines = structConfig?.json_lines || structConfig?.jsonLines;
      const formatForParser = isJsonLines ? 'jsonl' : 'json';
      await this.routeToParser(stream, jobId, datasetId, formatForParser, structConfig);
    } else if (fmt === 'jsonl' || fmt === 'ndjson') {
      // Explicit JSON Lines format
      await this.routeToParser(stream, jobId, datasetId, 'jsonl', structConfig);
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

  /**
   * Routes to the appropriate parser based on format string.
   */
  private async routeToParser(
    stream: any,
    jobId: string,
    datasetId: string,
    format: string,
    structConfig: any,
  ): Promise<void> {
    const fmt = format.toLowerCase();
    
    if (fmt === 'json' || fmt === 'jsonl') {
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
