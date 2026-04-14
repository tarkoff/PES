import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { createProgressTracker } from './progress-tracker';
import { DEFAULT_BATCH_SIZE } from './parser.interface';

/**
 * Configuration for XLSX parsing operations.
 */
export interface XlsxParserConfig {
  /**
   * Row number (1-based) that contains column headers.
   * All rows before this are skipped.
   * Set to 0 or null if no header row exists.
   * @default 1
   */
  headerRow?: number;

  /**
   * Sheet name or index to parse.
   * When provided, only the specified sheet is processed.
   * Can be a string (sheet name) or number (0-based index).
   * When not provided, all sheets are processed.
   */
  sheet?: string | number;

  /**
   * Whether to preserve cell types (dates, numbers, formulas).
   * When true, cell values are converted to appropriate JS types.
   * When false, all values are kept as strings.
   * @default true
   */
  preserveTypes?: boolean;

  /**
   * Whether to skip completely empty rows.
   * @default true
   */
  skipEmptyRows?: boolean;

  /**
   * Maximum number of rows to process.
   * Useful for testing with large files.
   * When not provided, all rows are processed.
   */
  maxRows?: number;
}

/**
 * Parses an XLSX stream and inserts records into the database in batches.
 * Supports multi-sheet workbooks, configurable header rows, and cell type preservation.
 *
 * Features:
 * - Memory-efficient streaming with ExcelJS WorkbookReader
 * - Per-row error tracking in ImportError table
 * - Multi-sheet support with sheet selection
 * - Configurable header row detection
 * - Cell type preservation (dates, numbers, booleans)
 * - Empty row filtering
 * - Row limit for testing with large files
 * - Throttled progress updates to avoid DB thrashing
 *
 * @param stream - Readable stream containing XLSX data
 * @param importJobId - ID of the ImportJob to track progress
 * @param datasetId - ID of the Dataset to associate records with
 * @param prisma - PrismaService instance for database operations
 * @param structConfig - Optional configuration (header_row, sheet, preserve_types, etc.)
 * @param batchSize - Number of records to buffer before inserting (default: 250)
 */
export async function parseXlsxStream(
  stream: Readable,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  structConfig?: Record<string, unknown>,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<void> {
  const config = normalizeConfig(structConfig);
  const tracker = createProgressTracker(prisma, importJobId);
  let totalRowsProcessed = 0;

  // Create streaming workbook reader
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream as any, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    worksheets: 'emit',
  });

  // Process worksheets
  for await (const worksheet of workbookReader) {
    // Skip worksheets that don't match the configured sheet
    if (config.sheet !== undefined && !matchesSheet(worksheet as any, config.sheet)) {
      continue;
    }

    let buffer: Record<string, unknown>[] = [];
    let headerRow: string[] = [];
    let foundHeaderRow = config.headerRow === 0 || config.headerRow === null || config.headerRow === undefined;

    // Process rows
    for await (const row of worksheet) {
      // Check row limit
      if (config.maxRows !== undefined && totalRowsProcessed >= config.maxRows) {
        break;
      }

      try {
        // Extract values (ExcelJS uses 1-based indexing, values[0] is undefined)
        const values = extractRowValues(row, config.preserveTypes !== false);

        // Detect header row
        if (!foundHeaderRow && row.number === (config.headerRow || 1)) {
          headerRow = values.map((v, i) => {
            const str = v?.toString().trim();
            return str || `col_${i}`;
          });
          foundHeaderRow = true;
          continue;
        }

        // Skip rows before header
        if (!foundHeaderRow) {
          continue;
        }

        // Build record object
        const record = buildRecord(values, headerRow, config);

        // Skip empty rows if configured
        if (config.skipEmptyRows !== false && isEmptyRecord(record)) {
          continue;
        }

        buffer.push(record);
        totalRowsProcessed++;

        // Flush if batch is full
        if (buffer.length >= batchSize) {
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
        }
      } catch (error) {
        const rowValues = extractRowValues(row, config.preserveTypes !== false);
        tracker.recordError(
          { row_number: row.number, values: rowValues },
          `Row processing error: ${(error as Error).message}`,
        );
      }
    }

    // Flush remaining buffer for this worksheet
    if (buffer.length > 0) {
      await insertBatch(
        buffer,
        importJobId,
        datasetId,
        prisma,
        tracker,
      );
    }

    // Check if we've reached the row limit
    if (config.maxRows !== undefined && totalRowsProcessed >= config.maxRows) {
      break;
    }
  }

  // Final progress flush
  await tracker.flush();
}

/**
 * Extracts cell values from a row with optional type preservation.
 */
function extractRowValues(
  row: ExcelJS.Row,
  preserveTypes: boolean,
): unknown[] {
  const values = Array.isArray(row.values) ? row.values.slice(1) : [];

  if (!preserveTypes) {
    // Convert all values to strings
    return values.map((v) => v?.toString() ?? '');
  }

  // Preserve types: convert Excel dates/numbers appropriately
  return values.map((cell) => {
    if (cell === null || cell === undefined) {
      return '';
    }

    // Handle Excel date values (stored as serial numbers)
    if (cell instanceof Date) {
      return cell.toISOString();
    }

    // Handle cells with type information
    if (typeof cell === 'object' && 'value' in cell) {
      const cellValue = (cell as any).value;

      // Rich text
      if (cellValue?.richText) {
        return cellValue.richText.map((rt: any) => rt.text).join('');
      }

      // Formula result
      if (cellValue?.result !== undefined) {
        return cellValue.result;
      }

      // Hyperlink
      if (cellValue?.hyperlink) {
        return cellValue.hyperlink;
      }

      return cellValue ?? '';
    }

    return cell;
  });
}

/**
 * Builds a record object from row values and header names.
 */
function buildRecord(
  values: unknown[],
  headerRow: string[],
  config: XlsxParserConfig,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  if (headerRow.length > 0) {
    // Map values to header names
    headerRow.forEach((colName, index) => {
      record[colName] = values[index] ?? '';
    });
  } else {
    // Auto-generate column names
    values.forEach((value, index) => {
      record[`col_${index}`] = value ?? '';
    });
  }

  return record;
}

/**
 * Checks if a record has no meaningful data.
 */
function isEmptyRecord(record: Record<string, unknown>): boolean {
  return !Object.values(record).some(
    (v) => v !== null && v !== undefined && v !== '',
  );
}

/**
 * Checks if a worksheet matches the configured sheet selector.
 */
function matchesSheet(
  worksheet: { name: string; id: number },
  sheet: string | number,
): boolean {
  if (typeof sheet === 'string') {
    return worksheet.name.toLowerCase() === sheet.toLowerCase();
  }
  // 0-based index, worksheet.id is 1-based
  return worksheet.id === sheet + 1;
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
 * Normalizes structConfig into a typed XlsxParserConfig object.
 */
function normalizeConfig(structConfig?: Record<string, unknown>): XlsxParserConfig {
  if (!structConfig) {
    return {};
  }

  return {
    headerRow: typeof structConfig.header_row === 'number'
      ? structConfig.header_row
      : typeof structConfig.headerRow === 'number'
        ? structConfig.headerRow
        : 1,
    sheet: typeof structConfig.sheet === 'string' || typeof structConfig.sheet === 'number'
      ? structConfig.sheet
      : undefined,
    preserveTypes: typeof structConfig.preserve_types === 'boolean'
      ? structConfig.preserve_types
      : typeof structConfig.preserveTypes === 'boolean'
        ? structConfig.preserveTypes
        : true,
    skipEmptyRows: typeof structConfig.skip_empty_rows === 'boolean'
      ? structConfig.skip_empty_rows
      : typeof structConfig.skipEmptyRows === 'boolean'
        ? structConfig.skipEmptyRows
        : true,
    maxRows: typeof structConfig.max_rows === 'number'
      ? structConfig.max_rows
      : typeof structConfig.maxRows === 'number'
        ? structConfig.maxRows
        : undefined,
  };
}
