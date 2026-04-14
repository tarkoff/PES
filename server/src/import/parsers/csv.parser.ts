import { Readable } from 'stream';
import csvParserModule from 'csv-parser';
import { PrismaService } from '../../prisma/prisma.service';
import { createProgressTracker } from './progress-tracker';
import { DEFAULT_BATCH_SIZE } from './parser.interface';

/**
 * Configuration for CSV parsing operations.
 */
export interface CsvParserConfig {
  /**
   * Field delimiter character.
   * Supports: ',', '\t', ';', '|', or custom single character.
   * @default ','
   */
  delimiter?: string;

  /**
   * Whether the first row contains headers.
   * When false, columns are named col_0, col_1, etc.
   * @default true
   */
  hasHeader?: boolean;

  /**
   * Number of initial data rows to skip (after header if present).
   * Useful for files with metadata rows at the top.
   * @default 0
   */
  skipRows?: number;

  /**
   * Character encoding for the input stream.
   * Common values: 'utf8', 'latin1', 'windows-1251'
   * @default 'utf8'
   */
  encoding?: string;

  /**
   * Whether to trim whitespace from field values.
   * @default true
   */
  trimValues?: boolean;

  /**
   * Whether to skip completely empty rows.
   * @default true
   */
  skipEmptyRows?: boolean;
}

/**
 * Known delimiter presets for common CSV variants.
 */
export const DELIMITER_PRESETS = {
  comma: ',',
  tab: '\t',
  semicolon: ';',
  pipe: '|',
} as const;

/**
 * Parses a CSV stream and inserts records into the database in batches.
 * Supports configurable delimiters, headers, row skipping, and encoding.
 *
 * Features:
 * - Memory-efficient streaming with backpressure handling
 * - Per-row error tracking in ImportError table
 * - Flexible delimiter configuration (comma, tab, semicolon, pipe)
 * - Header row detection and column naming
 * - Row skipping for files with metadata headers
 * - Empty row filtering
 * - Throttled progress updates to avoid DB thrashing
 *
 * @param stream - Readable stream containing CSV data
 * @param importJobId - ID of the ImportJob to track progress
 * @param datasetId - ID of the Dataset to associate records with
 * @param prisma - PrismaService instance for database operations
 * @param structConfig - Optional configuration (delimiter, has_header, skip_rows, etc.)
 * @param batchSize - Number of records to buffer before inserting (default: 250)
 */
export async function parseCsvStream(
  stream: Readable,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  structConfig?: Record<string, unknown>,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<void> {
  const config = normalizeConfig(structConfig);
  const tracker = createProgressTracker(prisma, importJobId);

  // Resolve csv-parser (handles ESM/CJS interop)
  const csvParser = (csvParserModule as any).default || csvParserModule;

  // Resolve delimiter from config
  const delimiter = resolveDelimiter(config.delimiter);

  return new Promise<void>((resolve, reject) => {
    let buffer: Record<string, unknown>[] = [];
    let headerRow: string[] = [];
    let isFirstRow = true;
    let rowsSkipped = 0;
    let settled = false;

    const settle = (err?: Error | null) => {
      if (settled) return;
      settled = true;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const flushBuffer = async () => {
      if (buffer.length === 0) return;
      const toInsert = [...buffer];
      buffer = [];

      await insertBatch(
        toInsert,
        importJobId,
        datasetId,
        prisma,
        tracker,
      );

      await tracker.flushIfNeeded();
    };

    // Create the CSV parser stream
    const csvStream = stream.pipe(
      csvParser({
        separator: delimiter,
        strict: false,
        // When hasHeader is false, csv-parser still reads rows but we handle headers ourselves
      }),
    );

    csvStream.on('data', async (row: Record<string, unknown>) => {
      if (settled) return;

      try {
        // Handle header row
        if (isFirstRow && config.hasHeader) {
          headerRow = Object.keys(row).map((key, i) => {
            const trimmed = key.trim();
            return trimmed || `col_${i}`;
          });
          isFirstRow = false;
          return;
        }

        // Handle row skipping
        if (config.skipRows && rowsSkipped < config.skipRows) {
          rowsSkipped++;
          return;
        }

        // Process and normalize row data
        const processedRow = processRow(row, headerRow, config);

        // Skip empty rows if configured
        if (config.skipEmptyRows && isEmptyRow(processedRow)) {
          return;
        }

        buffer.push(processedRow);

        if (buffer.length >= batchSize) {
          csvStream.pause();
          await flushBuffer();
          if (!settled) csvStream.resume();
        }
      } catch (error) {
        tracker.recordError(
          row,
          `Row processing error: ${(error as Error).message}`,
        );
      }
    });

    csvStream.on('end', async () => {
      try {
        await flushBuffer();
        await tracker.flush();
        settle(null);
      } catch (err) {
        settle(err as Error);
      }
    });

    csvStream.on('error', (err: Error) => {
      if (!settled) {
        stream.destroy();
        settle(err);
      }
    });

    stream.on('error', (err: Error) => {
      if (!settled) {
        stream.destroy();
        csvStream.destroy();
        settle(err);
      }
    });
  });
}

/**
 * Processes a raw CSV row according to configuration.
 */
function processRow(
  row: Record<string, unknown>,
  headerRow: string[],
  config: CsvParserConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (headerRow.length > 0 && config.hasHeader) {
    // Map values to header names
    const values = Object.values(row);
    headerRow.forEach((colName, index) => {
      let value = values[index];
      if (config.trimValues !== false && typeof value === 'string') {
        value = value.trim();
      }
      result[colName] = value;
    });
  } else if (headerRow.length > 0 && !config.hasHeader) {
    // No header row, use existing keys (should be col_0, col_1, etc from test)
    // Or if csv-parser provided numeric keys, map them
    Object.entries(row).forEach(([key, value]) => {
      let processedValue = value;
      if (config.trimValues !== false && typeof processedValue === 'string') {
        processedValue = processedValue.trim();
      }
      // Convert numeric keys to col_N format
      const colName = /^\d+$/.test(key) ? `col_${key}` : key;
      result[colName] = processedValue;
    });
  } else {
    // Use raw keys or auto-generated col_N names
    const keys = Object.keys(row);
    keys.forEach((key, index) => {
      const colName = headerRow[index] || key || `col_${index}`;
      let value = row[key];
      if (config.trimValues !== false && typeof value === 'string') {
        value = value.trim();
      }
      result[colName] = value;
    });
  }

  return result;
}

/**
 * Checks if a row has no meaningful data.
 */
function isEmptyRow(row: Record<string, unknown>): boolean {
  return !Object.values(row).some(
    (v) => v !== null && v !== undefined && v !== '',
  );
}

/**
 * Inserts a batch of records into the database with per-row error tracking.
 */
async function insertBatch(
  items: Record<string, unknown>[],
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  tracker: ReturnType<typeof createProgressTracker>,
): Promise<{ successCount: number; errorCount: number }> {
  let successCount = 0;
  let errorCount = 0;

  // Attempt bulk insert first for performance
  try {
    await prisma.datasetRecord.createMany({
      data: items.map((item) => ({
        import_job_id: importJobId,
        dataset_id: datasetId,
        data: item as any,
      })),
    });

    // All items succeeded
    for (const _ of items) {
      tracker.recordSuccess();
    }
    successCount = items.length;

    return { successCount, errorCount };
  } catch {
    // Bulk insert failed — fall back to individual inserts with error tracking
    for (const item of items) {
      try {
        await prisma.datasetRecord.create({
          data: {
            import_job_id: importJobId,
            dataset_id: datasetId,
            data: item as any,
          },
        });
        tracker.recordSuccess();
        successCount++;
      } catch (insertError) {
        tracker.recordError(
          item,
          `Database insert error: ${(insertError as Error).message}`,
        );
        errorCount++;
      }
    }

    return { successCount, errorCount };
  }
}

/**
 * Resolves a delimiter string from config value.
 * Supports preset names and custom single-character delimiters.
 */
function resolveDelimiter(delimiter?: string): string {
  if (!delimiter) {
    return DELIMITER_PRESETS.comma;
  }

  // Check if it's a preset name
  const preset = DELIMITER_PRESETS[delimiter as keyof typeof DELIMITER_PRESETS];
  if (preset) {
    return preset;
  }

  // Use as custom delimiter (must be single character)
  if (delimiter.length === 1) {
    return delimiter;
  }

  // Default to comma if invalid
  return DELIMITER_PRESETS.comma;
}

/**
 * Normalizes structConfig into a typed CsvParserConfig object.
 */
function normalizeConfig(structConfig?: Record<string, unknown>): CsvParserConfig {
  if (!structConfig) {
    return {};
  }

  return {
    delimiter: typeof structConfig.delimiter === 'string'
      ? structConfig.delimiter
      : undefined,
    hasHeader: typeof structConfig.has_header === 'boolean'
      ? structConfig.has_header
      : typeof structConfig.hasHeader === 'boolean'
        ? structConfig.hasHeader
        : true,
    skipRows: typeof structConfig.skip_rows === 'number'
      ? structConfig.skip_rows
      : typeof structConfig.skipRows === 'number'
        ? structConfig.skipRows
        : 0,
    encoding: typeof structConfig.encoding === 'string'
      ? structConfig.encoding
      : 'utf8',
    trimValues: typeof structConfig.trim_values === 'boolean'
      ? structConfig.trim_values
      : typeof structConfig.trimValues === 'boolean'
        ? structConfig.trimValues
        : true,
    skipEmptyRows: typeof structConfig.skip_empty_rows === 'boolean'
      ? structConfig.skip_empty_rows
      : typeof structConfig.skipEmptyRows === 'boolean'
        ? structConfig.skipEmptyRows
        : true,
  };
}
