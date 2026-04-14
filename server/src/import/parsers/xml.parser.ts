import { Readable } from 'stream';
import * as sax from 'sax';
import { PrismaService } from '../../prisma/prisma.service';
import { createProgressTracker } from './progress-tracker';
import { DEFAULT_BATCH_SIZE } from './parser.interface';

/**
 * Configuration for XML parsing operations.
 */
export interface XmlParserConfig {
  /**
   * The XML tag name that represents a record/item.
   * All elements with this tag will be extracted as individual records.
   * Case-insensitive comparison.
   * @default 'record'
   */
  xmlRoot?: string;

  /**
   * Whether to extract XML attributes as fields.
   * When true, element attributes are included in the output object
   * with prefix "attr_" (e.g., attr_id, attr_name).
   * @default false
   */
  extractAttributes?: boolean;

  /**
   * Whether to trim whitespace from text content.
   * @default true
   */
  trimValues?: boolean;

  /**
   * Whether to include empty elements in the output.
   * When false, elements with empty text content are excluded.
   * @default true
   */
  includeEmpty?: boolean;

  /**
   * Namespace URI to use for qualified names.
   * Useful for XML documents with namespaces.
   * When provided, namespace prefixes are stripped from keys.
   */
  namespace?: string;
}

/**
 * Represents an XML element being parsed.
 */
interface XmlElement {
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  children: XmlElement[];
}

/**
 * Parses an XML stream and inserts records into the database in batches.
 * Supports configurable record tags, attribute extraction, and namespace handling.
 *
 * Features:
 * - Memory-efficient streaming with backpressure handling
 * - Per-row error tracking in ImportError table
 * - Configurable record tag detection (xmlRoot)
 * - Optional XML attribute extraction
 * - Whitespace trimming and empty element filtering
 * - Namespace prefix handling
 * - Throttled progress updates to avoid DB thrashing
 *
 * @param stream - Readable stream containing XML data
 * @param importJobId - ID of the ImportJob to track progress
 * @param datasetId - ID of the Dataset to associate records with
 * @param prisma - PrismaService instance for database operations
 * @param structConfig - Optional configuration (xml_root, extract_attributes, etc.)
 * @param batchSize - Number of records to buffer before inserting (default: 250)
 */
export async function parseXmlStream(
  stream: Readable,
  importJobId: string,
  datasetId: string,
  prisma: PrismaService,
  structConfig?: Record<string, unknown>,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<void> {
  const config = normalizeConfig(structConfig);
  const tracker = createProgressTracker(prisma, importJobId);

  // Create SAX parser in strict mode with trimming
  const saxStream = sax.createStream(true, { trim: config.trimValues !== false });

  // Target tag for record extraction (case-insensitive)
  const targetTag = config.xmlRoot?.toLowerCase() || 'record';

  // Parser state
  let currentObject: Record<string, unknown> | null = null;
  let currentTag = '';
  let textBuffer = '';
  let currentAttributes: Record<string, string> = {};

  return new Promise<void>((resolve, reject) => {
    let buffer: Record<string, unknown>[] = [];
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

    // Handle opening tags
    saxStream.on('opentag', (node: { name: string; attributes: Record<string, string> }) => {
      const nodeName = node.name.toLowerCase();

      if (nodeName === targetTag) {
        // Start new record
        currentObject = {};
        currentAttributes = config.extractAttributes ? { ...node.attributes } : {};
      } else if (currentObject !== null) {
        // Inside a record — track child element
        currentTag = stripNamespace(node.name);
        textBuffer = '';
      }
    });

    // Handle text content
    saxStream.on('text', (text: string) => {
      if (currentObject !== null && currentTag) {
        textBuffer += text;
      }
    });

    // Handle CDATA sections
    saxStream.on('cdata', (text: string) => {
      if (currentObject !== null && currentTag) {
        textBuffer += text;
      }
    });

    // Handle closing tags
    saxStream.on('closetag', async (tagName: string) => {
      const nodeName = tagName.toLowerCase();

      if (nodeName === targetTag && currentObject !== null) {
        // Add attributes if configured
        if (config.extractAttributes && Object.keys(currentAttributes).length > 0) {
          Object.entries(currentAttributes).forEach(([key, value]) => {
            currentObject![`attr_${key}`] = value;
          });
        }

        // Add record to buffer
        buffer.push(currentObject);
        currentObject = null;
        currentTag = '';
        textBuffer = '';
        currentAttributes = {};

        // Flush if batch is full
        if (buffer.length >= batchSize) {
          (stream as any).pause();
          flushBuffer()
            .then(() => {
              if (!settled) (stream as any).resume();
            })
            .catch((err) => settle(err));
        }
      } else if (currentObject !== null && nodeName === currentTag.toLowerCase()) {
        // Finish child element
        let value = textBuffer;

        // Include empty elements if configured
        if (config.includeEmpty !== false || value.trim() !== '') {
          if (config.trimValues !== false) {
            value = value.trim();
          }
          currentObject[currentTag] = value;
        }

        currentTag = '';
        textBuffer = '';
      }
    });

    // Handle end of stream
    saxStream.on('end', async () => {
      try {
        await flushBuffer();
        await tracker.flush();
        settle(null);
      } catch (err) {
        settle(err as Error);
      }
    });

    // Handle errors
    saxStream.on('error', (err: Error) => {
      if (!settled) {
        stream.destroy();
        settle(err);
      }
    });

    stream.on('error', (err: Error) => {
      if (!settled) {
        stream.destroy();
        settle(err);
      }
    });

    // Pipe stream to SAX parser
    stream.pipe(saxStream);
  });
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
 * Strips namespace prefix from a tag name.
 * Example: "ns:record" -> "record"
 */
function stripNamespace(tagName: string): string {
  const colonIndex = tagName.indexOf(':');
  if (colonIndex > 0 && colonIndex < tagName.length - 1) {
    return tagName.substring(colonIndex + 1);
  }
  return tagName;
}

/**
 * Normalizes structConfig into a typed XmlParserConfig object.
 */
function normalizeConfig(structConfig?: Record<string, unknown>): XmlParserConfig {
  if (!structConfig) {
    return {};
  }

  return {
    xmlRoot: typeof structConfig.xml_root === 'string'
      ? structConfig.xml_root
      : typeof structConfig.xmlRoot === 'string'
        ? structConfig.xmlRoot
        : 'record',
    extractAttributes: Boolean(structConfig.extract_attributes || structConfig.extractAttributes),
    trimValues: typeof structConfig.trim_values === 'boolean'
      ? structConfig.trim_values
      : typeof structConfig.trimValues === 'boolean'
        ? structConfig.trimValues
        : true,
    includeEmpty: typeof structConfig.include_empty === 'boolean'
      ? structConfig.include_empty
      : typeof structConfig.includeEmpty === 'boolean'
        ? structConfig.includeEmpty
        : true,
    namespace: typeof structConfig.namespace === 'string'
      ? structConfig.namespace
      : undefined,
  };
}
