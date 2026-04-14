import { PrismaService } from '../../prisma/prisma.service';
import { ProgressTracker, createProgressTracker } from './progress-tracker';

// Mock PrismaService
const mockPrisma = {
  importJob: {
    update: jest.fn().mockResolvedValue({}),
  },
  importError: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
} as unknown as PrismaService;

const IMPORT_JOB_ID = 'test-job-id';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ProgressTracker', () => {
  describe('recording successes and errors', () => {
    it('should track success count', () => {
      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID);

      tracker.recordSuccess();
      tracker.recordSuccess();
      tracker.recordSuccess();

      const counts = tracker.getCounts();
      expect(counts.successCount).toBe(3);
      expect(counts.errorCount).toBe(0);
      expect(counts.rowIndex).toBe(3);
    });

    it('should track error count with details', () => {
      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID);

      tracker.recordSuccess();
      tracker.recordError({ id: 1 }, 'Validation failed');
      tracker.recordSuccess();

      const counts = tracker.getCounts();
      expect(counts.successCount).toBe(2);
      expect(counts.errorCount).toBe(1);
      expect(counts.rowIndex).toBe(3);
    });
  });

  describe('throttled progress updates', () => {
    it('should not update before throttle window', async () => {
      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID, {
        minUpdateIntervalMs: 1000,
      });

      tracker.recordSuccess();
      const flushed = await tracker.flushIfNeeded();

      // First call should update (lastUpdateAt starts at 0)
      expect(flushed).toBe(true);
      expect(mockPrisma.importJob.update).toHaveBeenCalledTimes(1);

      // Second call within throttle window should not update
      tracker.recordSuccess();
      const flushed2 = await tracker.flushIfNeeded();
      expect(flushed2).toBe(false);
      expect(mockPrisma.importJob.update).toHaveBeenCalledTimes(1);
    });

    it('should update after throttle window expires', async () => {
      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID, {
        minUpdateIntervalMs: 1000,
      });

      tracker.recordSuccess();
      await tracker.flushIfNeeded();

      // Advance time past throttle window
      jest.advanceTimersByTime(1500);

      tracker.recordSuccess();
      const flushed = await tracker.flushIfNeeded();
      expect(flushed).toBe(true);
      expect(mockPrisma.importJob.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('flush', () => {
    it('should persist job progress', async () => {
      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID);

      tracker.recordSuccess();
      tracker.recordSuccess();
      tracker.recordError({ id: 1 }, 'Error');

      await tracker.flush();

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: expect.objectContaining({
          success_rows: 2,
          error_rows: 1,
          total_rows: 3,
        }),
      });
    });

    it('should persist errors to ImportError table', async () => {
      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID);

      tracker.recordError({ id: 1, name: 'Invalid' }, 'Validation error');
      tracker.recordError({ id: 2 }, 'Missing field');

      await tracker.flush();

      expect(mockPrisma.importError.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            import_job_id: IMPORT_JOB_ID,
            row_index: 0,
            error_message: 'Validation error',
          }),
          expect.objectContaining({
            import_job_id: IMPORT_JOB_ID,
            row_index: 1,
            error_message: 'Missing field',
          }),
        ]),
      });
    });

    it('should clear pending errors after flush', async () => {
      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID);

      tracker.recordError({ id: 1 }, 'Error 1');
      await tracker.flush();

      expect(mockPrisma.importError.createMany).toHaveBeenCalledTimes(1);

      // Second flush should not call createMany (no pending errors)
      await tracker.flush();
      expect(mockPrisma.importError.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('error resilience', () => {
    it('should silently ignore database update failures', async () => {
      mockPrisma.importJob.update = jest.fn().mockRejectedValue(new Error('DB error'));

      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID);
      tracker.recordSuccess();

      // Should not throw
      await expect(tracker.flush()).resolves.not.toThrow();
    });

    it('should silently ignore error persistence failures', async () => {
      mockPrisma.importError.createMany = jest.fn().mockRejectedValue(new Error('DB error'));

      const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID);
      tracker.recordError({ id: 1 }, 'Error');

      // Should not throw
      await expect(tracker.flush()).resolves.not.toThrow();
    });
  });
});

describe('createProgressTracker', () => {
  it('should return a configured ProgressTracker', () => {
    const tracker = createProgressTracker(mockPrisma, IMPORT_JOB_ID, {
      minUpdateIntervalMs: 500,
    });

    expect(tracker).toBeInstanceOf(ProgressTracker);
  });
});
