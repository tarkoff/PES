import { PrismaService } from '../../prisma/prisma.service';
import { RowError, ProgressConfig, DEFAULT_PROGRESS_CONFIG } from './parser.interface';

/**
 * Manages throttled progress updates for import jobs.
 * Prevents excessive database writes by batching updates within a time window.
 */
export class ProgressTracker {
  private successCount = 0;
  private errorCount = 0;
  private rowIndex = 0;
  private lastUpdateAt = 0;
  private pendingErrors: RowError[] = [];
  private readonly config: ProgressConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly importJobId: string,
    config?: Partial<ProgressConfig>,
  ) {
    this.config = { ...DEFAULT_PROGRESS_CONFIG, ...config };
  }

  /**
   * Record a successful row import.
   */
  recordSuccess(): void {
    this.successCount++;
    this.rowIndex++;
  }

  /**
   * Record a failed row with error details.
   */
  recordError(rawData: unknown, errorMessage: string): void {
    this.errorCount++;
    this.pendingErrors.push({
      rowIndex: this.rowIndex,
      rawData,
      errorMessage,
    });
    this.rowIndex++;
  }

  /**
   * Flush progress to database if throttle window has elapsed.
   * Returns true if update was performed.
   */
  async flushIfNeeded(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastUpdateAt < this.config.minUpdateIntervalMs) {
      return false;
    }

    await this.flush();
    this.lastUpdateAt = now;
    return true;
  }

  /**
   * Force flush all progress and pending errors to database.
   * Should be called at the end of parsing.
   */
  async flush(): Promise<void> {
    await Promise.all([
      this.updateJobProgress(),
      this.persistErrors(),
    ]);
  }

  /**
   * Get current counts without flushing.
   */
  getCounts(): { successCount: number; errorCount: number; rowIndex: number } {
    return {
      successCount: this.successCount,
      errorCount: this.errorCount,
      rowIndex: this.rowIndex,
    };
  }

  private async updateJobProgress(): Promise<void> {
    try {
      await this.prisma.importJob.update({
        where: { id: this.importJobId },
        data: {
          success_rows: this.successCount,
          error_rows: this.errorCount,
          total_rows: this.successCount + this.errorCount,
        },
      });
    } catch (error) {
      // Silently ignore — progress is non-critical
      console.warn(`Failed to update progress for job ${this.importJobId}:`, error);
    }
  }

  private async persistErrors(): Promise<void> {
    if (this.pendingErrors.length === 0) {
      return;
    }

    const errorsToPersist = [...this.pendingErrors];
    this.pendingErrors = [];

    try {
      await this.prisma.importError.createMany({
        data: errorsToPersist.map((err) => ({
          import_job_id: this.importJobId,
          row_index: err.rowIndex,
          raw_data: err.rawData as any,
          error_message: err.errorMessage,
        })),
      });
    } catch (error) {
      // Silently ignore — errors are logged but non-critical
      console.warn(`Failed to persist errors for job ${this.importJobId}:`, error);
    }
  }
}

/**
 * Creates and returns a configured ProgressTracker.
 */
export function createProgressTracker(
  prisma: PrismaService,
  importJobId: string,
  config?: Partial<ProgressConfig>,
): ProgressTracker {
  return new ProgressTracker(prisma, importJobId, config);
}
