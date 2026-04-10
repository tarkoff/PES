import { Readable } from 'stream';
const JSONStream = require('JSONStream');
import { PrismaService } from '../../prisma/prisma.service';

export async function parseJsonStream(
  stream: Readable,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  structConfig?: any,
  batchSize = 250,
) {
  return new Promise<void>((resolve, reject) => {
    let path = '.*'; // Default for top-level array
    if (structConfig?.array_path) {
      path = structConfig.array_path + '.*';
    }
    const jsonStream = stream.pipe(JSONStream.parse(path));
    let buffer: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    jsonStream.on('data', async (data: any) => {
      buffer.push(data);
     successCount = data.length;
      if (buffer.length >= batchSize) {
        jsonStream.pause(); // Призупинити потік, щоб не переповнити пам'ять
        const toInsert = [...buffer];
        buffer = [];
        try {
          await prisma.datasetRecord.createMany({
            data: toInsert.map((item) => ({
              import_job_id: importJobId,
              dataset_id: datasetId,
              data: item,
            })),
          });
          //successCount += toInsert.length;
        } catch (err: any) {
          errorCount += toInsert.length;
        }
        console.log(data.length, successCount, errorCount); 
        await updateProgress(prisma, importJobId, data.length, errorCount);
        jsonStream.resume();
      }
    });

    jsonStream.on('end', async () => {
      if (buffer.length > 0) {
        try {
          await prisma.datasetRecord.createMany({
            data: buffer.map((item) => ({
              import_job_id: importJobId,
              dataset_id: datasetId,
              data: item,
            })),
          });
          //successCount += buffer.length;
        } catch (err: any) {
          errorCount += buffer.length;
        }
      }

      await updateProgress(prisma, importJobId, successCount, errorCount);
      resolve();
    });

    jsonStream.on('error', (err: any) => reject(err));
  });
}

async function updateProgress(prisma: PrismaService, importJobId: string, successCount: number, errorCount: number) {
  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      success_rows: successCount,
      error_rows: errorCount,
      total_rows: successCount + errorCount,
    },
  });
}
