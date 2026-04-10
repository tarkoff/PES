import { Stream } from 'stream';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';

export async function parseXlsxStream(
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
      const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream as any, {
        sharedStrings: 'cache',
        hyperlinks: 'ignore',
        worksheets: 'emit',
      });

      let buffer: any[] = [];
      let headerRow: string[] = [];
      
      // Користувач може вказати в config рядок з заголовками (наприклад 1 або 2)
      const headerRowIndex = structConfig?.header_row ?? 1;

      for await (const worksheetReader of workbookReader) {
        for await (const row of worksheetReader) {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];

          if (row.number === headerRowIndex) {
            headerRow = values.map((v, i) => (v ? v.toString().trim() : `col_${i}`));
            continue;
          }

          if (row.number > headerRowIndex && headerRow.length > 0) {
            const rowObject: any = {};
            headerRow.forEach((colName, index) => {
              rowObject[colName] = values[index];
            });
            
            // Перевіряємо, чи є в рядку хоча б одне непусте значення
            const hasData = Object.values(rowObject).some(v => v !== null && v !== undefined && v !== '');
            if (hasData) {
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
          }
        }
      }

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
    } catch (e) {
      reject(e);
    }
  });
}
