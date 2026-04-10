import { Stream } from 'stream';
import * as sax from 'sax';
import { PrismaService } from '../../prisma/prisma.service';

export async function parseXmlStream(
  stream: Stream,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  structConfig?: any,
  batchSize = 250,
) {
  return new Promise<void>((resolve, reject) => {
    const saxStream = sax.createStream(true, { trim: true });
    
    // Користувач може задати xml_root ("RECORD", "ITEM", тощо) у struct_config. За замовчуванням 'record'
    const targetTag = (structConfig?.xml_root || 'record').toLowerCase();
    
    let currentTag = '';
    let currentObject: any = null;
    let textBuffer = '';
    
    let buffer: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    saxStream.on('opentag', (node) => {
      const nodeName = node.name.toLowerCase();
      if (nodeName === targetTag) {
        currentObject = {}; // Починаємо новий запис
      } else if (currentObject) {
        currentTag = node.name;
        textBuffer = '';
      }
    });

    saxStream.on('text', (text) => {
      if (currentObject && currentTag) {
        textBuffer += text;
      }
    });

    saxStream.on('closetag', async (tagName) => {
      const nodeName = tagName.toLowerCase();
      if (nodeName === targetTag && currentObject) {
        buffer.push(currentObject);
        currentObject = null;
        
        if (buffer.length >= batchSize) {
          (stream as any).pause();
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
            successCount += toInsert.length;
          } catch(e) {
            errorCount += toInsert.length;
          }

          // Оновлюємо статистику
          await prisma.importJob.update({
            where: { id: importJobId },
            data: { success_rows: successCount, error_rows: errorCount, total_rows: successCount + errorCount },
          });

          (stream as any).resume();
        }
      } else if (currentObject && nodeName === currentTag.toLowerCase()) {
        currentObject[currentTag] = textBuffer;
        currentTag = '';
        textBuffer = '';
      }
    });

    saxStream.on('end', async () => {
      if (buffer.length > 0) {
        try {
          await prisma.datasetRecord.createMany({
            data: buffer.map((item) => ({ import_job_id: importJobId, dataset_id: datasetId, data: item })),
          });
          successCount += buffer.length;
        } catch(e) {
          errorCount += buffer.length;
        }
      }
      
      await prisma.importJob.update({
        where: { id: importJobId },
        data: { success_rows: successCount, error_rows: errorCount, total_rows: successCount + errorCount },
      });
      resolve();
    });

    saxStream.on('error', (err) => reject(err));
    stream.pipe(saxStream);
  });
}
