import { Stream } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';

export async function parseCsvStream(
  stream: Stream,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  structConfig?: any,
  batchSize = 250,
) {
  return new Promise<void>(async (resolve, reject) => {
    let successCount = 0;
    let errorCount = 0;

    try {
      const delimiter = structConfig?.delimiter || ',';
      const hasHeader = structConfig?.has_header ?? true;
      const skipRows = structConfig?.skip_rows || 0;

      let buffer: any[] = [];
      let headerRow: string[] = [];
      let isFirstRow = true;
      let rowsSkipped = 0;

      const rows: any[] = [];

      const processRow = async (row: any) => {
        if (isFirstRow && hasHeader) {
          headerRow = Object.keys(row).map((key, i) => key || `col_${i}`);
          isFirstRow = false;
          return;
        }

        if (rowsSkipped < skipRows) {
          rowsSkipped++;
          return;
        }

        const hasData = Object.values(row).some(v => v !== null && v !== undefined && v !== '');
        if (hasData) {
          let rowObject: any;
          if (headerRow.length > 0) {
            rowObject = {};
            const values = Object.values(row);
            headerRow.forEach((colName, index) => {
              rowObject[colName] = values[index];
            });
          } else {
            rowObject = row;
          }
          buffer.push(rowObject);
        }

        if (buffer.length >= batchSize) {
          const toInsert = [...buffer];
          buffer = [];
          try {
            await prisma.datasetRecord.createMany({
              data: toInsert.map((item) => ({ import_job_id: importJobId, dataset_id: datasetId, data: item })),
            });
            successCount += toInsert.length;
          } catch (e) {
            errorCount += toInsert.length;
          }

          await prisma.importJob.update({
            where: { id: importJobId },
            data: { success_rows: successCount, error_rows: errorCount, total_rows: successCount + errorCount },
          });
        }
      };

      const csvParser = await import('csv-parser');
      const parse = csvParser.default || csvParser;
      const csvStream = stream.pipe(parse({
        separator: delimiter,
        strict: false,
      }));

      csvStream.on('data', async (row) => {
        await processRow(row);
      });

      csvStream.on('end', async () => {
        if (buffer.length > 0) {
          try {
            await prisma.datasetRecord.createMany({
              data: buffer.map((item) => ({ import_job_id: importJobId, dataset_id: datasetId, data: item })),
            });
            successCount += buffer.length;
          } catch (e) {
            errorCount += buffer.length;
          }
        }

        await prisma.importJob.update({
          where: { id: importJobId },
          data: { success_rows: successCount, error_rows: errorCount, total_rows: successCount + errorCount },
        });

        resolve();
      });

      csvStream.on('error', reject);

    } catch (e) {
      reject(e);
    }
  });
}
