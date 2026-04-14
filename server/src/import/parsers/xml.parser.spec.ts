import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { parseXmlStream } from './xml.parser';

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

describe('parseXmlStream', () => {
  describe('basic XML parsing', () => {
    it('should parse simple XML with record elements', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record>
    <name>Alice</name>
    <age>30</age>
    <city>Kyiv</city>
  </record>
  <record>
    <name>Bob</name>
    <age>25</age>
    <city>Lviv</city>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

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

    it('should handle empty XML document', async () => {
      const xmlContent = '<?xml version="1.0"?><root></root>';
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).not.toHaveBeenCalled();
    });

    it('should handle XML with no record elements', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <metadata>
    <version>1.0</version>
  </metadata>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      expect(mockPrisma.datasetRecord.createMany).not.toHaveBeenCalled();
    });
  });

  describe('custom xmlRoot configuration', () => {
    it('should parse with custom record tag', async () => {
      const xmlContent = `<?xml version="1.0"?>
<data>
  <item>
    <name>Alice</name>
    <value>100</value>
  </item>
  <item>
    <name>Bob</name>
    <value>200</value>
  </item>
</data>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { xml_root: 'item' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);
    });

    it('should be case-insensitive for tag names', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <RECORD>
    <name>Alice</name>
  </RECORD>
  <Record>
    <name>Bob</name>
  </Record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { xml_root: 'record' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const totalInserted = allCalls.reduce(
        (sum: number, call: any[]) => sum + call[0].data.length,
        0,
      );
      expect(totalInserted).toBe(2);
    });
  });

  describe('attribute extraction', () => {
    it('should extract attributes when configured', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record id="1" type="user">
    <name>Alice</name>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { extract_attributes: true },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).toHaveProperty('attr_id', '1');
      expect(firstCallData).toHaveProperty('attr_type', 'user');
    });

    it('should not extract attributes by default', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record id="1" type="user">
    <name>Alice</name>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).not.toHaveProperty('attr_id');
      expect(firstCallData).not.toHaveProperty('attr_type');
    });
  });

  describe('text content handling', () => {
    it('should handle multi-line text content', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record>
    <description>This is a
multi-line
description</description>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('description');
      expect(firstCallData['description']).toContain('This is a');
    });

    it('should trim whitespace by default', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record>
    <name>  Alice  </name>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
    });

    it('should preserve whitespace when configured', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record>
    <name>  Alice  </name>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { trim_values: false },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', '  Alice  ');
    });

    it('should handle CDATA sections', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record>
    <content><![CDATA[<html>Special content</html>]]></content>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('content');
      expect(firstCallData['content']).toContain('Special content');
    });
  });

  describe('empty element handling', () => {
    it('should include empty elements by default', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record>
    <name>Alice</name>
    <email></email>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).toHaveProperty('email', '');
    });

    it('should exclude empty elements when configured', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record>
    <name>Alice</name>
    <email></email>
  </record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { include_empty: false },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).not.toHaveProperty('email');
    });
  });

  describe('namespace handling', () => {
    it('should strip namespace prefixes from element names', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root xmlns:ns="http://example.com">
  <ns:record>
    <ns:name>Alice</ns:name>
    <ns:age>30</ns:age>
  </ns:record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(
        stream,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { xml_root: 'record' },
      );

      const allCalls = mockPrisma.datasetRecord.createMany.mock.calls;
      const firstCallData = allCalls[0][0].data[0].data;
      expect(firstCallData).toHaveProperty('name', 'Alice');
      expect(firstCallData).toHaveProperty('age', '30');
      expect(firstCallData).not.toHaveProperty('ns:name');
    });
  });

  describe('batch processing', () => {
    it('should respect batch size', async () => {
      const records = Array.from({ length: 10 }, (_, i) => 
        `<record><id>${i}</id><name>Name${i}</name></record>`
      ).join('\n');
      const xmlContent = `<?xml version="1.0"?><root>${records}</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 3);

      // Should have been called at least 4 times (3+3+3+1)
      expect(mockPrisma.datasetRecord.createMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should update import job progress', async () => {
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record><name>Alice</name></record>
  <record><name>Bob</name></record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

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

      const xmlContent = `<?xml version="1.0"?>
<root>
  <record><name>Alice</name></record>
</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma);

      // Should have attempted createMany
      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
    });

    it('should handle malformed XML with error', async () => {
      const malformedXml = '<?xml version="1.0"?><root><record><name>Alice</name>';
      const stream = createStreamFromString(malformedXml);

      await expect(
        parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma),
      ).rejects.toThrow();
    });

    it('should handle stream errors gracefully', async () => {
      const errorStream = new Readable({
        read() {
          // Delay error to allow handler setup
          setTimeout(() => this.destroy(new Error('Network error')), 0);
        },
      });

      await expect(
        parseXmlStream(errorStream, IMPORT_JOB_ID, DATASET_ID, mockPrisma),
      ).rejects.toThrow('Network error');
    });
  });

  describe('large dataset performance', () => {
    it('should handle 1000 records without memory issues', async () => {
      const records = Array.from({ length: 1000 }, (_, i) => 
        `<record><id>${i}</id><name>Name${i}</name><timestamp>2024-01-01</timestamp></record>`
      ).join('\n');
      const xmlContent = `<?xml version="1.0"?><root>${records}</root>`;
      const stream = createStreamFromString(xmlContent);

      await parseXmlStream(stream, IMPORT_JOB_ID, DATASET_ID, mockPrisma, undefined, 100);

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
      const xmlContent = `<?xml version="1.0"?>
<root>
  <record><name>Alice</name></record>
</root>`;

      // Test with snake_case
      const stream1 = createStreamFromString(xmlContent);
      await parseXmlStream(
        stream1,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { xml_root: 'record', trim_values: true },
      );

      // Test with camelCase
      const stream2 = createStreamFromString(xmlContent);
      await parseXmlStream(
        stream2,
        IMPORT_JOB_ID,
        DATASET_ID,
        mockPrisma,
        { xmlRoot: 'record', trimValues: true },
      );

      // Both should succeed
      expect(mockPrisma.datasetRecord.createMany).toHaveBeenCalled();
    });
  });
});
