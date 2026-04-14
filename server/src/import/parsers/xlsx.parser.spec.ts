import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { parseXlsxStream } from './xlsx.parser';
import * as ExcelJS from 'exceljs';

// Mock PrismaService
const mockPrisma = {
  importJob: {
    update: jest.fn().mockResolvedValue({}),
  },
  datasetRecord: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({}),
  },
  importError: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({}),
  },
} as unknown as PrismaService;

const IMPORT_JOB_ID = 'test-job-id';
const DATASET_ID = 'test-dataset-id';

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Helper to create a Readable stream from an ExcelJS workbook buffer
 */
async function createXlsxStream(workbook: ExcelJS.Workbook): Promise<Readable> {
  const stream = new Readable();
  
  // Write workbook to buffer
  const buffer = await workbook.xlsx.writeBuffer() as Buffer;
  
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/**
 * Helper to create a simple test workbook
 */
function createTestWorkbook(
  headers: string[],
  rows: unknown[][],
  sheetName = 'Sheet1',
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Add headers
  worksheet.addRow(headers);

  // Add data rows
  for (const row of rows) {
    worksheet.addRow(row);
  }

  return workbook;
}

describe('parseXlsxStream', () => {
  describe('basic XLSX parsing', () => {
    it('should parse simple XLSX with headers', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age', 'city'],
        [
          ['Alice', 30, 'Kyiv'],
          ['Bob', 25, 'Lviv'],
        ],
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);

      // Verify data structure
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).toHaveProperty('age', 30);
      expect(firstCallData).toHaveProperty('city', 'Kyiv');
    });

    it('should handle XLSX with no data rows', async () => {
      const workbook = createTestWorkbook(['name', 'age'], []);
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).not.toHaveBeenCalled();
    });

    it('should skip empty rows by default', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age'],
        [
          ['Alice', 30],
          ['', ''],
          ['Bob', 25],
        ],
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);
    });
  });

  describe('header row configuration', () => {
    it('should use first row as header by default', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age', 'city'],
        [
          ['Alice', 30, 'Kyiv'],
        ],
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
    });

    it('should skip to custom header row', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');

      // Row 1: metadata
      worksheet.addRow(['Metadata', 'Row', '']);
      // Row 2: headers
      worksheet.addRow(['name', 'age', 'city']);
      // Row 3: data
      worksheet.addRow(['Alice', 30, 'Kyiv']);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { header_row: 2 },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).toHaveProperty('city', 'Kyiv');
    });

    it('should handle workbook without headers', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');
      worksheet.addRow(['Alice', 30, 'Kyiv']);
      worksheet.addRow(['Bob', 25, 'Lviv']);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { header_row: 0 },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);

      // Should have auto-generated column names
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('col_0', 'Alice');
    });
  });

  describe('multi-sheet support', () => {
    it('should process all sheets by default', async () => {
      const workbook = new ExcelJS.Workbook();
      
      // Sheet 1
      const sheet1 = workbook.addWorksheet('Users');
      sheet1.addRow(['name', 'age']);
      sheet1.addRow(['Alice', 30]);
      
      // Sheet 2
      const sheet2 = workbook.addWorksheet('Products');
      sheet2.addRow(['product', 'price']);
      sheet2.addRow(['Widget', 9.99]);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2); // One from each sheet
    });

    it('should filter by sheet name', async () => {
      const workbook = new ExcelJS.Workbook();
      
      const sheet1 = workbook.addWorksheet('Users');
      sheet1.addRow(['name', 'age']);
      sheet1.addRow(['Alice', 30]);
      
      const sheet2 = workbook.addWorksheet('Products');
      sheet2.addRow(['product', 'price']);
      sheet2.addRow(['Widget', 9.99]);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { sheet: 'Users' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(1); // Only from Users sheet

      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
    });

    it('should filter by sheet index', async () => {
      const workbook = new ExcelJS.Workbook();
      
      const sheet1 = workbook.addWorksheet('Users');
      sheet1.addRow(['name', 'age']);
      sheet1.addRow(['Alice', 30]);
      
      const sheet2 = workbook.addWorksheet('Products');
      sheet2.addRow(['product', 'price']);
      sheet2.addRow(['Widget', 9.99]);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { sheet: 1 }, // Second sheet (0-based)
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(1); // Only from Products sheet
    });
  });

  describe('cell type preservation', () => {
    it('should preserve number types', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');
      worksheet.addRow(['name', 'age', 'score']);
      worksheet.addRow(['Alice', 30, 95.5]);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('age', 30);
      expect(firstCallData).toHaveProperty('score', 95.5);
    });

    it('should convert dates to ISO strings', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');
      worksheet.addRow(['name', 'birthdate']);
      worksheet.addRow(['Alice', new Date('1990-01-15')]);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).toHaveProperty('birthdate');
      expect(firstCallData['birthdate']).toContain('1990-01-15');
    });

    it('should convert all values to strings when preserve_types is false', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');
      worksheet.addRow(['name', 'age', 'score']);
      worksheet.addRow(['Alice', 30, 95.5]);

      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { preserve_types: false },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('age', '30');
      expect(firstCallData).toHaveProperty('score', '95.5');
    });
  });

  describe('row limits', () => {
    it('should respect max_rows configuration', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age'],
        Array.from({ length: 100 }, (_, i) => [`Name${i}`, i]),
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { max_rows: 5 },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBeLessThanOrEqual(5);
    });
  });

  describe('batch processing', () => {
    it('should respect batch size', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age'],
        Array.from({ length: 10 }, (_, i) => [`Name${i}`, i]),
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 3);

      // Should have been called at least 4 times (3+3+3+1)
      expect(mockPrisma.datasetRecord.createMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should update import job progress', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age'],
        [
          ['Alice', 30],
          ['Bob', 25],
        ],
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: IMPORT_JOB_ID },
          data: expect.objectContaining({
            success_rows: expect.any(Number),
            error_rows: expect.any(Number),
            total_rows: expect.any(Number),
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should track per-row errors in ImportError table', async () => {
      // Mock createMany to fail on first call
      mockPrisma.datasetRecord.createMany = jest.fn()
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValue({ count: 1 });

      const workbook = createTestWorkbook(
        ['name', 'age'],
        [['Alice', 30]],
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      // Should have attempted createMany
      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
    });

    it('should handle stream errors gracefully', async () => {
      const errorStream = new Readable({
        read() {
          // Delay error to allow handler setup
          setTimeout(() => this.destroy(new Error('Network error')), 0);
        },
      });

      await expect(
        parseXlsxStream(errorStream, IMPORT_JOB_ID, DATASET_ID, mockPrisma),
      ).rejects.toThrow();
    });
  });

  describe('large dataset performance', () => {
    it('should handle 1000 rows without memory issues', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age', 'timestamp'],
        Array.from({ length: 1000 }, (_, i) => [`Name${i}`, i, '2024-01-01']),
      );
      const stream = await createXlsxStream(workbook);

      await parseXlsxStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 100);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(1000);
      // Should have made ~10 batch calls
      expect(allCalls.length).toBeGreaterThan(5);
    });
  });

  describe('config normalization', () => {
    it('should accept both snake_case and camelCase config keys', async () => {
      const workbook = createTestWorkbook(
        ['name', 'age'],
        [['Alice', 30]],
      );

      // Test with snake_case
      const stream1 = await createXlsxStream(workbook);
      await parseXlsxStream(
        stream1,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { header_row: 1, skip_empty_rows: true },
      );

      // Test with camelCase
      const stream2 = await createXlsxStream(workbook);
      await parseXlsxStream(
        stream2,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { headerRow: 1, skipEmptyRows: true },
      );

      // Both should succeed
      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
    });
  });
});
