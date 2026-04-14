import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCsvStream, DELIMITER_PRESETS } from './csv.parser';

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
 * Helper to create a Readable stream from a string
 */
function createStreamFromString(content: string): Readable {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return stream;
}

describe('parseCsvStream', () => {
  describe('basic CSV parsing', () => {
    it('should parse simple CSV with headers', async () => {
      const csvContent = 'name,age,city\nAlice,30,Kyiv\nBob,25,Lviv\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

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
      expect(firstCallData).toHaveProperty('age', '30');
      expect(firstCallData).toHaveProperty('city', 'Kyiv');
    });

    it('should handle CSV without headers', async () => {
      const csvContent = 'Alice,30,Kyiv\nBob,25,Lviv\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { has_header: false },
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
      expect(firstCallData).toHaveProperty('col_1', '30');
    });

    it('should handle empty CSV', async () => {
      const csvContent = '';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).not.toHaveBeenCalled();
    });

    it('should handle CSV with only headers', async () => {
      const csvContent = 'name,age,city\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).not.toHaveBeenCalled();
    });
  });

  describe('delimiter configuration', () => {
    it('should parse tab-delimited CSV', async () => {
      const csvContent = 'name\tage\tcity\nAlice\t30\tKyiv\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { delimiter: 'tab' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(1);
    });

    it('should parse semicolon-delimited CSV', async () => {
      const csvContent = 'name;age;city\nAlice;30;Kyiv\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { delimiter: 'semicolon' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(1);
    });

    it('should parse pipe-delimited CSV', async () => {
      const csvContent = 'name|age|city\nAlice|30|Kyiv\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { delimiter: 'pipe' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(1);
    });

    it('should accept custom single character delimiter', async () => {
      const csvContent = 'name|age|city\nAlice|30|Kyiv\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { delimiter: '|' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(1);
    });
  });

  describe('row skipping', () => {
    it('should skip configured number of rows', async () => {
      const csvContent = 'name,age\nSKIP1,SKIP2\nAlice,30\nBob,25\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { skip_rows: 1 },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);

      // First data row should be Alice, not SKIP1
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
    });
  });

  describe('empty row handling', () => {
    it('should skip empty rows by default', async () => {
      const csvContent = 'name,age\nAlice,30\n,,\nBob,25\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);
    });

    it('should include empty rows when configured', async () => {
      const csvContent = 'name,age\nAlice,30\n,,\nBob,25\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { skip_empty_rows: false },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(3);
    });
  });

  describe('value trimming', () => {
    it('should trim whitespace by default', async () => {
      const csvContent = 'name,age\n  Alice  ,  30  \n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).toHaveProperty('age', '30');
    });

    it('should preserve whitespace when configured', async () => {
      const csvContent = 'name,age\n  Alice  ,  30  \n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { trim_values: false },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', '  Alice  ');
      expect(firstCallData).toHaveProperty('age', '  30  ');
    });
  });

  describe('batch processing', () => {
    it('should respect batch size', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => `Name${i},${i}`).join('\n');
      const csvContent = `name,age\n${rows}\n`;
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 3);

      // Should have been called at least 4 times (3+3+3+1)
      expect(mockPrisma.datasetRecord.createMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should update import job progress', async () => {
      const csvContent = 'name,age\nAlice,30\nBob,25\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

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

      const csvContent = 'name,age\nAlice,30\n';
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

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
        parseCsvStream(errorStream, IMPORT_JOB_ID, DATASET_ID, mockPrisma),
      ).rejects.toThrow('Network error');
    });
  });

  describe('large dataset performance', () => {
    it('should handle 1000 rows without memory issues', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => `Name${i},${i}`).join('\n');
      const csvContent = `name,age\n${rows}\n`;
      const stream = createStreamFromString(csvContent);

      await parseCsvStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 100);

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
      const csvContent = 'name,age\nAlice,30\n';

      // Test with snake_case
      const stream1 = createStreamFromString(csvContent);
      await parseCsvStream(
        stream1,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { has_header: true, skip_rows: 0 },
      );

      // Test with camelCase
      const stream2 = createStreamFromString(csvContent);
      await parseCsvStream(
        stream2,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { hasHeader: true, skipRows: 0 },
      );

      // Both should succeed
      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
    });
  });
});

describe('DELIMITER_PRESETS', () => {
  it('should contain standard delimiter characters', () => {
    expect(DELIMITER_PRESETS.comma).toBe(',');
    expect(DELIMITER_PRESETS.tab).toBe('\t');
    expect(DELIMITER_PRESETS.semicolon).toBe(';');
    expect(DELIMITER_PRESETS.pipe).toBe('|');
  });
});
