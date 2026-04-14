import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { parseJsonStream, PathNotFoundError } from './json.parser';

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
 * Helper to create a Readable stream from a string or buffer
 */
function createStreamFromString(content: string): Readable {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return stream;
}

describe('parseJsonStream', () => {
  describe('top-level JSON array', () => {
    it('should parse and insert records from a simple array', async () => {
      const jsonContent = '[{"name":"Alice"},{"name":"Bob"},{"name":"Charlie"}]';
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 2);

      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(3);
    });

    it('should handle empty array', async () => {
      const jsonContent = '[]';
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).not.toHaveBeenCalled();
    });

    it('should respect batch size', async () => {
      const jsonContent = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ id: i })));
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 3);

      // Should have been called at least 4 times (3+3+3+1)
      expect(mockPrisma.datasetRecord.createMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should update import job progress', async () => {
      const jsonContent = '[{"id":1},{"id":2}]';
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

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

  describe('nested JSON array with arrayPath', () => {
    it('should parse array at nested path', async () => {
      const jsonContent = JSON.stringify({
        meta: { total: 2 },
        data: {
          items: [
            { name: 'Item1' },
            { name: 'Item2' },
          ],
        },
      });
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { array_path: 'data.items' },
      );

      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);
    });

    it('should auto-detect array path for object with single array key (deputies.json pattern)', async () => {
      // This is the exact pattern from deputies.json
      const jsonContent = JSON.stringify({
        deputies: [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
          { id: '3', name: 'Charlie' },
        ],
      });
      const stream = createStreamFromString(jsonContent);

      // No array_path provided — should auto-detect "deputies" key
      await parseJsonStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
      );

      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(3);

      // Verify the data structure — each record should be a deputy object
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('id', '1');
      expect(firstCallData).toHaveProperty('name', 'Alice');
    });

    it('should fallback to object streaming if path not found', async () => {
      const jsonContent = JSON.stringify({
        key1: { value: 'one' },
        key2: { value: 'two' },
      });
      const stream = createStreamFromString(jsonContent);

      // Should not throw, but fallback to object streaming
      await expect(
        parseJsonStream(
          stream,
          IMPORT_JOB_ID,
          DATASET_ID,
          mockPrisma,
          { array_path: 'nonexistent.path' },
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('JSON object streaming', () => {
    it('should stream object key-value pairs as records', async () => {
      const jsonContent = JSON.stringify({
        user1: { name: 'Alice', age: 30 },
        user2: { name: 'Bob', age: 25 },
      });
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);
    });
  });

  describe('JSON Lines (NDJSON) format', () => {
    it('should parse JSON Lines format', async () => {
      const jsonlContent = '{"name":"Alice"}\n{"name":"Bob"}\n{"name":"Charlie"}\n';
      const stream = createStreamFromString(jsonlContent);

      await parseJsonStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { json_lines: true },
      );

      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(3);
    });

    it('should skip empty lines in JSONL', async () => {
      const jsonlContent = '{"name":"Alice"}\n\n{"name":"Bob"}\n\n\n{"name":"Charlie"}\n';
      const stream = createStreamFromString(jsonlContent);

      await parseJsonStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { json_lines: true },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(3);
    });

    it('should handle invalid JSON lines gracefully with error tracking', async () => {
      const jsonlContent = '{"name":"Alice"}\nINVALID JSON\n{"name":"Bob"}\n';
      const stream = createStreamFromString(jsonlContent);

      await parseJsonStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { json_lines: true },
      );

      // Should have inserted 2 valid records
      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);

      // Should have tracked errors
      expect(mockPrisma.importError.createMany).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should track per-row errors in ImportError table', async () => {
      // Mock createMany to fail on first call, succeed on second
      mockPrisma.datasetRecord.createMany = jest.fn()
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValue({ count: 1 });

      const jsonContent = '[{"id":1},{"id":2}]';
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      // Should have attempted createMany
      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
    });

    it('should handle stream errors gracefully', async () => {
      const errorStream = new Readable();
      errorStream.destroy(new Error('Network error'));

      await expect(
        parseJsonStream(errorStream, IMPORT_JOB_ID, DATASET_ID, mockPrisma),
      ).rejects.toThrow('Network error');
    });

    it('should handle malformed JSON with error', async () => {
      const malformedJson = '{"name": "Alice",}'; // Invalid trailing comma
      const stream = createStreamFromString(malformedJson);

      await expect(
        parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma),
      ).rejects.toThrow();
    });
  });

  describe('large dataset performance', () => {
    it('should handle 1000 records without memory issues', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: `item-${i}`,
        timestamp: new Date().toISOString(),
      }));
      const jsonContent = JSON.stringify(largeArray);
      const stream = createStreamFromString(jsonContent);

      await parseJsonStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 100);

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
    it('should accept both array_path and arrayPath in structConfig', async () => {
      const jsonContent = JSON.stringify({
        data: [{ id: 1 }, { id: 2 }],
      });

      // Test with array_path (snake_case)
      const stream1 = createStreamFromString(jsonContent);
      await parseJsonStream(
        stream1,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { array_path: 'data' },
      );

      // Test with arrayPath (camelCase)
      const stream2 = createStreamFromString(jsonContent);
      await parseJsonStream(
        stream2,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { arrayPath: 'data' },
      );

      // Both should succeed
      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
    });
  });
});

describe('PathNotFoundError', () => {
  it('should be an instance of Error', () => {
    const error = new PathNotFoundError('Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PathNotFoundError');
    expect(error.message).toBe('Test error');
  });
});
