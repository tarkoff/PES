import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Standard interface for all format parsers (JSON, CSV, XML, XLSX).
 * Implementations must stream data, batch insert records, and track progress/errors.
 */
export interface DatasetParser {
  /**
   * Parse a stream of data and insert records in batches.
   *
   * @param stream - Input stream containing the file to parse
   * @param importJobId - ID of the ImportJob to update progress
   * @param datasetId - ID of the Dataset to associate records with
   * @param prisma - PrismaService instance for database operations
   * @param structConfig - Format-specific configuration (e.g., array_path for JSON)
   * @param batchSize - Number of rows to buffer before inserting (default: 250)
   */
  parse(
    stream: Readable,
    importJobId: string,
    datasetId: string,
    prisma: PrismaService,
    structConfig?: Record<string, unknown>,
    batchSize?: number,
  ): Promise<void>;

  /**
   * Supported format identifiers for this parser.
   * Examples: ['json'], ['csv'], ['xml'], ['xls', 'xlsx']
   */
  readonly supportedFormats: readonly string[];
}

/**
 * Result of a batch flush operation.
 */
export interface FlushResult {
  successCount: number;
  errorCount: number;
  errors: RowError[];
}

/**
 * Represents a single row parsing error.
 */
export interface RowError {
  rowIndex: number;
  rawData: unknown;
  errorMessage: string;
}

/**
 * Configuration for batch progress updates.
 */
export interface ProgressConfig {
  /** Minimum milliseconds between progress updates to avoid DB thrashing */
  minUpdateIntervalMs: number;
}

export const DEFAULT_BATCH_SIZE = 250;
export const DEFAULT_PROGRESS_CONFIG: ProgressConfig = {
  minUpdateIntervalMs: 1000,
};
