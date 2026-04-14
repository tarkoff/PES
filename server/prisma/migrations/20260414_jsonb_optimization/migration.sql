-- PostgreSQL JSONB Optimization for DatasetRecord Table
-- This migration adds performance indexes and tunes autovacuum settings
-- for optimal JSONB query performance on large datasets.
--
-- Run with: npx prisma db execute --file prisma/migrations/YYYYMMDDHHMMSS_jsonb_optimization/migration.sql
-- Or execute directly: psql -f prisma/migrations/YYYYMMDDHHMMSS_jsonb_optimization/migration.sql

-- ============================================================
-- 1. GIN Index for JSONB Containment Queries
-- ============================================================
-- Enables fast @> (containment) queries like:
--   SELECT * FROM "DatasetRecord" WHERE data @> '{"status": "active"}';
--   SELECT * FROM "DatasetRecord" WHERE data @> '{"tags": ["important"]}';
--
-- jsonb_path_ops is more efficient for containment queries but doesn't
-- support ? (key exists) or ?& (all keys exist) operators.
-- For full operator support, use the default GIN index (without jsonb_path_ops).
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dataset_record_data_gin"
  ON "DatasetRecord"
  USING GIN (data jsonb_path_ops);

-- ============================================================
-- 2. Composite Index for Dataset + JSONB Queries
-- ============================================================
-- Most common query pattern: filter by dataset_id, then paginate
-- This index supports:
--   SELECT * FROM "DatasetRecord" WHERE dataset_id = '...' ORDER BY created_at DESC LIMIT 50;
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dataset_record_dataset_created"
  ON "DatasetRecord" (dataset_id, created_at DESC);

-- ============================================================
-- 3. Index for Import Job Queries
-- ============================================================
-- Speeds up queries that filter by import job
--   SELECT * FROM "DatasetRecord" WHERE import_job_id = '...';
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dataset_record_import_job"
  ON "DatasetRecord" (import_job_id);

-- ============================================================
-- 4. Partial Index for Records with Common Keys
-- ============================================================
-- If datasets commonly have a "name" or "status" field, create
-- partial indexes for fast filtering. These only index rows
-- that actually have the key, saving space.
--
-- Uncomment and adjust based on your actual data patterns:
-- ============================================================

-- Partial index for records with 'name' key
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dataset_record_data_name"
--   ON "DatasetRecord" ((data->>'name') text_pattern_ops)
--   WHERE data ? 'name';

-- Partial index for records with 'status' key
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dataset_record_data_status"
--   ON "DatasetRecord" ((data->>'status'))
--   WHERE data ? 'status';

-- ============================================================
-- 5. Autovacuum Tuning for DatasetRecord Table
-- ============================================================
-- JSONB tables with frequent inserts benefit from more aggressive
-- autovacuum settings to prevent table bloat and keep statistics fresh.
--
-- These settings override the database defaults for this table only.
-- ============================================================

ALTER TABLE "DatasetRecord" SET (
  -- Vacuum when 10% of rows are dead tuples (default: 20%)
  autovacuum_vacuum_scale_factor = 0.1,

  -- Analyze when 5% of rows have changed (default: 10%)
  -- More frequent ANALYZE keeps planner statistics accurate
  autovacuum_analyze_scale_factor = 0.05,

  -- Minimum threshold before scale factor kicks in
  -- Prevents vacuum on small tables, but triggers on large ones
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_threshold = 500
);

-- ============================================================
-- 6. Autovacuum Tuning for ImportJob Table
-- ============================================================
-- Import jobs are updated frequently during import, causing many dead tuples

ALTER TABLE "ImportJob" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 100,
  autovacuum_analyze_threshold = 50
);

-- ============================================================
-- 7. Verify Indexes Were Created
-- ============================================================
-- Run this to confirm indexes exist:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'DatasetRecord';
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'ImportJob';

-- ============================================================
-- 8. Verify Autovacuum Settings
-- ============================================================
-- Run this to confirm settings:
-- SELECT relname, 
--        reloptions 
-- FROM pg_class 
-- WHERE relname IN ('DatasetRecord', 'ImportJob');

-- ============================================================
-- 9. Monitor Index Usage (After Deployment)
-- ============================================================
-- Check which indexes are actually being used:
-- SELECT 
--   schemaname,
--   relname as table_name,
--   indexrelname as index_name,
--   idx_scan,
--   idx_tup_read,
--   idx_tup_fetch,
--   pg_size_pretty(pg_relation_size(indexrelid)) as index_size
-- FROM pg_stat_user_indexes
-- WHERE relname IN ('DatasetRecord', 'ImportJob')
-- ORDER BY idx_scan DESC;

-- ============================================================
-- 10. Monitor Table Bloat
-- ============================================================
-- Check dead tuple ratio:
-- SELECT 
--   relname,
--   n_live_tup,
--   n_dead_tup,
--   ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct,
--   last_autovacuum,
--   last_autoanalyze
-- FROM pg_stat_user_tables
-- WHERE relname = 'DatasetRecord';

-- ============================================================
-- Rollback Instructions (if needed)
-- ============================================================
-- To remove indexes:
-- DROP INDEX CONCURRENTLY IF EXISTS "idx_dataset_record_data_gin";
-- DROP INDEX CONCURRENTLY IF EXISTS "idx_dataset_record_dataset_created";
-- DROP INDEX CONCURRENTLY IF EXISTS "idx_dataset_record_import_job";
--
-- To reset autovacuum settings:
-- ALTER TABLE "DatasetRecord" RESET (autovacuum_vacuum_scale_factor);
-- ALTER TABLE "DatasetRecord" RESET (autovacuum_analyze_scale_factor);
-- ALTER TABLE "DatasetRecord" RESET (autovacuum_vacuum_threshold);
-- ALTER TABLE "DatasetRecord" RESET (autovacuum_analyze_threshold);
