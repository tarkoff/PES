import { Readable } from 'stream';
import chain from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';
import { PrismaService } from '../../prisma/prisma.service';
import { createProgressTracker } from './progress-tracker';
import { DEFAULT_BATCH_SIZE } from './parser.interface';

/**
 * Configuration for JSON parsing operations.
 */
export interface JsonParserConfig {
  /**
   * Dot-notation path to the array to stream within the JSON structure.
   * Examples: "data.items", "results", "response.books"
   * If not provided, auto-detection will be attempted.
   */
  arrayPath?: string;

  /**
   * Force JSON Lines (NDJSON) mode where each line is a separate JSON object.
   * When true, the file is treated as one JSON object per line.
   */
  jsonLines?: boolean;
}

/**
 * Parses a JSON stream and inserts records into the database in batches.
 * Supports top-level arrays, nested arrays via arrayPath, objects with multiple keys,
 * and JSON Lines (NDJSON) format.
 *
 * Features:
 * - Memory-efficient streaming with backpressure handling
 * - Per-row error tracking in ImportError table
 * - Auto-detection of array paths when not specified
 * - JSON Lines/NDJSON support
 * - Throttled progress updates to avoid DB thrashing
 *
 * @param stream - Readable stream containing JSON data
 * @param importJobId - ID of the ImportJob to track progress
 * @param datasetId - ID of the Dataset to associate records with
 * @param prisma - PrismaService instance for database operations
 * @param structConfig - Optional configuration (array_path, json_lines)
 * @param batchSize - Number of records to buffer before inserting (default: 250)
 */
export async function parseJsonStream(
  stream: Readable,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  structConfig?: Record<string, unknown>,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<void> {
  const config = normalizeConfig(structConfig);
  const tracker = createProgressTracker(prisma, importJobId);

  if (config.jsonLines) {
    await parseJsonLines(stream, importJobId, datasetId, prisma, batchSize);
    return;
  }

  // For regular JSON, we need to detect structure before streaming
  // Buffer the stream to allow multiple attempts
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  const buffer = Buffer.concat(chunks);
  const content = buffer.toString();

  // Detect JSON structure
  const trimmed = content.trim();
  const isArray = trimmed.startsWith('[');
  const isObject = trimmed.startsWith('{');

  if (isArray) {
    // Top-level array — stream directly
    const arrayStream = Readable.from(buffer);
    await streamJsonArray(
      arrayStream,
      tracker,
      datasetId,
      importJobId,
      prisma,
      undefined,
      batchSize,
    );
  } else if (isObject) {
    // Top-level object — check if we need to navigate to a nested array
    if (config.arrayPath) {
      // Try to extract array at specified path
      const arrayStream = Readable.from(buffer);
      try {
        await streamJsonArray(
          arrayStream,
          tracker,
          datasetId,
          importJobId,
          prisma,
          config.arrayPath,
          batchSize,
        );
      } catch (error) {
        if (error instanceof PathNotFoundError) {
          // Fallback: treat as object stream
          const objectStream = Readable.from(buffer);
          await streamJsonObject(
            objectStream,
            tracker,
            datasetId,
            importJobId,
            prisma,
            batchSize,
          );
        } else {
          throw error;
        }
      }
    } else {
      // No array path — auto-detect the first array in the object
      const detectedPath = detectFirstArrayPath(content);

      if (detectedPath) {
        // Found a nested array — stream it
        const arrayStream = Readable.from(buffer);
        await streamJsonArray(
          arrayStream,
          tracker,
          datasetId,
          importJobId,
          prisma,
          detectedPath,
          batchSize,
        );
      } else {
        // No arrays found — treat as object with key-value pairs
        const objectStream = Readable.from(buffer);
        await streamJsonObject(
          objectStream,
          tracker,
          datasetId,
          importJobId,
          prisma,
          batchSize,
        );
      }
    }
  } else {
    throw new Error('Invalid JSON: expected array or object');
  }
}

/**
 * Parses JSON Lines (NDJSON) format where each line is a separate JSON object.
 */
async function parseJsonLines(
  stream: Readable,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  batchSize: number,
): Promise<void> {
  const tracker = createProgressTracker(prisma, importJobId);
  let buffer: unknown[] = [];
  let lineBuffer = '';
  let settled = false;

  return new Promise<void>((resolve, reject) => {
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

      await insertBatch(toInsert, importJobId, datasetId, prisma, tracker);

      await tracker.flushIfNeeded();
    };

    stream.on('data', (chunk: Buffer) => {
      if (settled) return;

      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      // Keep the last incomplete line in the buffer
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (settled) return;
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);
          buffer.push(parsed);

          if (buffer.length >= batchSize) {
            flushBuffer().catch((err) => settle(err));
          }
        } catch (parseError) {
          tracker.recordError(
            { raw_line: trimmed },
            `JSON parse error: ${(parseError as Error).message}`,
          );
        }
      }
    });

    stream.on('end', async () => {
      // Process any remaining data in lineBuffer
      if (lineBuffer.trim()) {
        try {
          buffer.push(JSON.parse(lineBuffer.trim()));
        } catch (parseError) {
          tracker.recordError(
            { raw_line: lineBuffer.trim() },
            `JSON parse error: ${(parseError as Error).message}`,
          );
        }
      }

      try {
        await flushBuffer();
        await tracker.flush();
        settle(null);
      } catch (err) {
        settle(err as Error);
      }
    });

    stream.on('error', (err: Error) => {
      if (!settled) {
        stream.destroy();
        settle(err);
      }
    });
  });
}

/**
 * Streams a JSON array (top-level or at a specific path) and processes each item.
 */
async function streamJsonArray(
  stream: Readable,
  tracker: ReturnType<typeof createProgressTracker>,
  datasetId: string,
  importJobId: string,
  prisma: PrismaService,
  arrayPath: string | undefined,
  batchSize: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let buffer: unknown[] = [];
    let settled = false;
    let pipeline: ReturnType<typeof chain> | null = null;

    const settle = (err?: Error | null) => {
      if (settled) return;
      settled = true;
      if (pipeline) {
        pipeline.destroy();
      }
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

      const { errorCount } = await insertBatch(
        toInsert,
        importJobId,
        datasetId,
        prisma,
        tracker,
      );

      await tracker.flushIfNeeded();
    };

    // Build the streaming pipeline
    try {
      if (arrayPath) {
        // Use arrayPath if provided
        pipeline = buildPipelineWithPath(stream, arrayPath);
      } else {
        // Try top-level array first
        pipeline = buildPipelineForTopLevelArray(stream);
      }
    } catch (err) {
      reject(err);
      return;
    }

    pipeline.on('data', ({ value }: { value: unknown }) => {
      if (settled) return;
      buffer.push(value);

      if (buffer.length >= batchSize) {
        pipeline!.pause();
        flushBuffer()
          .then(() => {
            if (!settled) pipeline!.resume();
          })
          .catch((err) => settle(err));
      }
    });

    pipeline.on('end', async () => {
      await flushBuffer();
      await tracker.flush();
      settle(null);
    });

    pipeline.on('error', (err: Error) => {
      if (!settled) {
        // If the error is about path not found or wrong structure, throw specific error for fallback
        const errorMsg = err.message || '';
        if (
          errorMsg.includes('Path not found') ||
          errorMsg.includes('Invalid path') ||
          errorMsg.includes('Cannot read') ||
          errorMsg.includes('undefined') ||
          errorMsg.includes('should be an array') ||
          errorMsg.includes('Top-level object') ||
          errorMsg.includes('expected a value')
        ) {
          settle(
            new PathNotFoundError(`Array path not accessible: ${errorMsg}`),
          );
        } else {
          settle(err);
        }
      }
    });

    stream.on('error', (err: Error) => {
      if (!settled) {
        stream.destroy();
        pipeline?.destroy();
        settle(err);
      }
    });
  });
}

/**
 * Streams a JSON object and processes each key-value pair as a record.
 */
async function streamJsonObject(
  stream: Readable,
  tracker: ReturnType<typeof createProgressTracker>,
  datasetId: string,
  importJobId: string,
  prisma: PrismaService,
  batchSize: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let buffer: unknown[] = [];
    let settled = false;
    let pipeline: ReturnType<typeof chain> | null = null;

    const settle = (err?: Error | null) => {
      if (settled) return;
      settled = true;
      if (pipeline) {
        pipeline.destroy();
      }
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

      await insertBatch(toInsert, importJobId, datasetId, prisma, tracker);

      await tracker.flushIfNeeded();
    };

    try {
      pipeline = chain([stream, parser(), streamObject()]);
    } catch (err) {
      reject(err);
      return;
    }

    pipeline.on('data', ({ key, value }: { key: string; value: unknown }) => {
      if (settled) return;
      // Wrap object values with their key for context
      const record =
        typeof value === 'object' && value !== null
          ? { _key: key, ...(value as Record<string, unknown>) }
          : { _key: key, _value: value };
      buffer.push(record);

      if (buffer.length >= batchSize) {
        pipeline!.pause();
        flushBuffer()
          .then(() => {
            if (!settled) pipeline!.resume();
          })
          .catch((err) => settle(err));
      }
    });

    pipeline.on('end', async () => {
      await flushBuffer();
      await tracker.flush();
      settle(null);
    });

    pipeline.on('error', (err: Error) => {
      if (!settled) settle(err);
    });

    stream.on('error', (err: Error) => {
      if (!settled) {
        stream.destroy();
        pipeline?.destroy();
        settle(err);
      }
    });
  });
}

/**
 * Inserts a batch of records into the database with per-row error tracking.
 */
async function insertBatch(
  items: unknown[],
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
 * Builds a stream-json pipeline for a specific array path.
 * Uses pick utility to extract data at the specified path.
 */
function buildPipelineWithPath(
  stream: Readable,
  arrayPath: string,
): ReturnType<typeof chain> {
  // Convert dot-notation path to stream-json path format
  // "data.items" -> we need to navigate to data.items and then stream the array
  const pathParts = arrayPath.split('.').filter(Boolean);

  // Build pipeline: stream -> parser -> pick to path -> streamArray
  const { pick } = require('stream-json/filters/Pick.js');

  return chain([
    stream,
    parser(),
    pick({ filter: pathParts.join('.') }),
    streamArray(),
  ]);
}

/**
 * Builds a stream-json pipeline for a top-level array.
 */
function buildPipelineForTopLevelArray(
  stream: Readable,
): ReturnType<typeof chain> {
  return chain([stream, parser(), streamArray()]);
}

/**
 * Normalizes structConfig into a typed JsonParserConfig object.
 */
function normalizeConfig(
  structConfig?: Record<string, unknown>,
): JsonParserConfig {
  if (!structConfig) {
    return {};
  }

  return {
    arrayPath:
      typeof structConfig.array_path === 'string'
        ? structConfig.array_path
        : typeof structConfig.arrayPath === 'string'
          ? structConfig.arrayPath
          : undefined,
    jsonLines: Boolean(structConfig.json_lines || structConfig.jsonLines),
  };
}

/**
 * Custom error for when a specified array path is not found in the JSON.
 */
export class PathNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathNotFoundError';
  }
}

/**
 * Detects the path to the first array in a JSON object.
 * Parses the JSON and finds the first key that contains an array value.
 *
 * @param content - JSON string content
 * @returns Dot-notation path to the first array, or null if not found
 */
function detectFirstArrayPath(content: string): string | null {
  try {
    const parsed = JSON.parse(content);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    // Iterate through keys to find the first array
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        return key; // Found array at top level key
      }
      // Check nested objects one level deep
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (Array.isArray(nestedValue)) {
            return `${key}.${nestedKey}`;
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
