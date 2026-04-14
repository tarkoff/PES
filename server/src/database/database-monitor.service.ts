import { PrismaService } from '../prisma/prisma.service';

/**
 * Database performance monitoring utilities for PostgreSQL JSONB tables.
 * Provides queries to monitor index usage, table bloat, query performance,
 * and vacuum status.
 */
export class DatabaseMonitor {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get table size statistics for DatasetRecord and related tables.
   * Returns total size, table size, index size, and TOAST size.
   */
  async getTableSizes(): Promise<Record<string, {
    totalSize: string;
    tableSize: string;
    indexSize: string;
    toastSize: string;
  }>> {
    const tables = ['DatasetRecord', 'ImportJob', 'Dataset', 'ImportError'];
    const results: Record<string, any> = {};

    for (const table of tables) {
      const sizeResult = await this.prisma.$queryRaw`
        SELECT 
          pg_size_pretty(pg_total_relation_size(${table}::regclass)) as total_size,
          pg_size_pretty(pg_relation_size(${table}::regclass)) as table_size,
          pg_size_pretty(pg_indexes_size(${table}::regclass)) as index_size,
          COALESCE(
            pg_size_pretty(pg_relation_size(
              (SELECT reltoastrelid FROM pg_class WHERE oid = ${table}::regclass)
            )),
            '0 bytes'
          ) as toast_size
      ` as any[];
      
      const row = sizeResult[0];
      results[table] = {
        totalSize: row?.total_size || '0 bytes',
        tableSize: row?.table_size || '0 bytes',
        indexSize: row?.index_size || '0 bytes',
        toastSize: row?.toast_size || '0 bytes',
      };
    }

    return results;
  }

  /**
   * Get index usage statistics for monitored tables.
   * Shows which indexes are being used and their sizes.
   */
  async getIndexUsage(): Promise<Array<{
    tableName: string;
    indexName: string;
    scans: number;
    tuplesRead: number;
    tuplesFetched: number;
    indexSize: string;
  }>> {
    const tables = ['DatasetRecord', 'ImportJob', 'Dataset', 'ImportError'];

    const results = await this.prisma.$queryRaw`
      SELECT 
        relname as table_name,
        indexrelname as index_name,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes
      WHERE relname = ANY(${tables})
      ORDER BY relname, idx_scan DESC
    `;

    return (results as any[]).map(row => ({
      tableName: row.relname,
      indexName: row.index_name,
      scans: Number(row.idx_scan),
      tuplesRead: Number(row.idx_tup_read),
      tuplesFetched: Number(row.idx_tup_fetch),
      indexSize: row.index_size,
    }));
  }

  /**
   * Get dead tuple ratio (bloat indicator) for monitored tables.
   * High dead tuple ratio indicates need for VACUUM.
   */
  async getDeadTupleStats(): Promise<Array<{
    tableName: string;
    liveTuples: number;
    deadTuples: number;
    deadTuplePct: number;
    lastAutovacuum: Date | null;
    lastAutoanalyze: Date | null;
  }>> {
    const tables = ['DatasetRecord', 'ImportJob', 'Dataset', 'ImportError'];

    const results = await this.prisma.$queryRaw`
      SELECT 
        relname as table_name,
        n_live_tup,
        n_dead_tup,
        ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct,
        last_autovacuum,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE relname = ANY(${tables})
      ORDER BY n_dead_tup DESC
    `;

    return (results as any[]).map(row => ({
      tableName: row.table_name,
      liveTuples: Number(row.n_live_tup),
      deadTuples: Number(row.n_dead_tup),
      deadTuplePct: parseFloat(row.dead_pct || '0'),
      lastAutovacuum: row.last_autovacuum ? new Date(row.last_autovacuum) : null,
      lastAutoanalyze: row.last_autoanalyze ? new Date(row.last_autoanalyze) : null,
    }));
  }

  /**
   * Get autovacuum configuration for monitored tables.
   * Shows current vacuum settings.
   */
  async getVacuumConfig(): Promise<Record<string, string[] | null>> {
    const tables = ['DatasetRecord', 'ImportJob', 'Dataset', 'ImportError'];

    const results = await this.prisma.$queryRaw`
      SELECT relname, reloptions
      FROM pg_class
      WHERE relname = ANY(${tables})
    `;

    const config: Record<string, string[] | null> = {};
    for (const row of results as any[]) {
      config[row.relname] = row.reloptions || null;
    }

    return config;
  }

  /**
   * Get record count per dataset for capacity planning.
   */
  async getRecordsPerDataset(): Promise<Array<{
    datasetId: string;
    recordCount: number;
    dataSizeBytes: number;
    avgRecordSizeBytes: number;
  }>> {
    const results = await this.prisma.$queryRaw`
      SELECT 
        dataset_id,
        COUNT(*) as record_count,
        pg_column_sum(data) as data_size_bytes,
        AVG(pg_column_size(data)) as avg_record_size_bytes
      FROM "DatasetRecord"
      GROUP BY dataset_id
      ORDER BY record_count DESC
    `;

    return (results as any[]).map(row => ({
      datasetId: row.dataset_id,
      recordCount: Number(row.record_count),
      dataSizeBytes: Number(row.data_size_bytes),
      avgRecordSizeBytes: parseFloat(row.avg_record_size_bytes),
    }));
  }

  /**
   * Run a manual VACUUM ANALYZE on DatasetRecord table.
   * Use this after large imports to update statistics.
   */
  async vacuumAnalyzeDatasetRecord(): Promise<void> {
    await this.prisma.$executeRawUnsafe('VACUUM (ANALYZE, VERBOSE) "DatasetRecord"');
  }

  /**
   * Run a manual VACUUM ANALYZE on ImportJob table.
   */
  async vacuumAnalyzeImportJob(): Promise<void> {
    await this.prisma.$executeRawUnsafe('VACUUM (ANALYZE, VERBOSE) "ImportJob"');
  }

  /**
   * Get comprehensive health report.
   * Returns a summary of database health for monitoring dashboards.
   */
  async getHealthReport(): Promise<{
    tableSizes: Awaited<ReturnType<typeof this.getTableSizes>>;
    indexUsage: Awaited<ReturnType<typeof this.getIndexUsage>>;
    deadTupleStats: Awaited<ReturnType<typeof this.getDeadTupleStats>>;
    vacuumConfig: Awaited<ReturnType<typeof this.getVacuumConfig>>;
    totalRecords: number;
    totalDatasets: number;
    warnings: string[];
  }> {
    const [
      tableSizes,
      indexUsage,
      deadTupleStats,
      vacuumConfig,
      recordCounts,
      datasetCount,
    ] = await Promise.all([
      this.getTableSizes(),
      this.getIndexUsage(),
      this.getDeadTupleStats(),
      this.getVacuumConfig(),
      this.getRecordsPerDataset(),
      this.prisma.dataset.count(),
    ]);

    const warnings: string[] = [];

    // Check for high dead tuple ratios
    for (const stat of deadTupleStats) {
      if (stat.deadTuplePct > 20) {
        warnings.push(
          `${stat.tableName}: ${stat.deadTuplePct}% dead tuples - consider running VACUUM`
        );
      }
    }

    // Check for unused indexes
    for (const idx of indexUsage) {
      if (idx.scans === 0) {
        warnings.push(
          `${idx.indexName} on ${idx.tableName}: never used - consider dropping`
        );
      }
    }

    // Check for very large datasets
    for (const ds of recordCounts) {
      if (ds.recordCount > 1_000_000) {
        warnings.push(
          `Dataset ${ds.datasetId}: ${ds.recordCount.toLocaleString()} records - consider partitioning`
        );
      }
    }

    return {
      tableSizes,
      indexUsage,
      deadTupleStats,
      vacuumConfig,
      totalRecords: recordCounts.reduce((sum, ds) => sum + ds.recordCount, 0),
      totalDatasets: Number(datasetCount),
      warnings,
    };
  }
}
