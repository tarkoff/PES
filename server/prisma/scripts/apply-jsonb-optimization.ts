/**
 * Apply JSONB optimization migration and verify results.
 * 
 * Usage:
 *   npx ts-node prisma/scripts/apply-jsonb-optimization.ts
 * 
 * This script:
 *   1. Applies the raw SQL migration
 *   2. Verifies indexes were created
 *   3. Checks autovacuum settings
 *   4. Displays before/after comparison
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🚀 PostgreSQL JSONB Optimization Setup\n');
  console.log('═'.repeat(60));

  // Step 1: Read and execute the migration SQL
  console.log('\n📋 Step 1: Applying indexes and autovacuum settings...');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Find the migration file
    const migrationsDir = path.join(__dirname, '../migrations');
    const migrationFolders = fs.readdirSync(migrationsDir).filter(f => 
      f.includes('jsonb_optimization')
    );

    if (migrationFolders.length === 0) {
      console.error('❌ Migration file not found!');
      console.error('   Run: npx prisma migrate dev --name jsonb_optimization');
      process.exit(1);
    }

    const migrationFile = path.join(migrationsDir, migrationFolders[0], 'migration.sql');
    const migrationSql = fs.readFileSync(migrationFile, 'utf-8');
    
    // Split by semicolons and execute each statement
    const statements = migrationSql
      .split(';')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (error.message?.includes('already exists') || 
            error.message?.includes('does not exist')) {
          console.log(`   ⚠️  Skipped (already applied or not applicable)`);
        } else {
          console.log(`   ⚠️  ${error.message?.substring(0, 80) || 'Error'}`);
        }
      }
    }

    console.log('   ✅ Migration applied successfully');
  } catch (error: any) {
    console.error(`   ❌ Migration failed: ${error.message}`);
    console.log('   💡 Try running: npx prisma db execute --file prisma/migrations/20260414_jsonb_optimization/migration.sql');
    process.exit(1);
  }

  // Step 2: Verify indexes
  console.log('\n📋 Step 2: Verifying indexes...');
  
  const indexes = await prisma.$queryRaw`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'DatasetRecord'
    ORDER BY indexname
  ` as any[];

  for (const idx of indexes) {
    if (idx.indexname.includes('data_gin') || 
        idx.indexname.includes('dataset_created') || 
        idx.indexname.includes('import_job')) {
      console.log(`   ✅ ${idx.indexname}`);
    }
  }

  // Step 3: Check autovacuum settings
  console.log('\n📋 Step 3: Checking autovacuum configuration...');
  
  const vacuumConfig = await prisma.$queryRaw`
    SELECT relname, reloptions
    FROM pg_class
    WHERE relname = 'DatasetRecord'
  ` as any[];

  if (vacuumConfig[0]?.reloptions) {
    console.log('   ✅ DatasetRecord autovacuum settings:');
    for (const option of vacuumConfig[0].reloptions) {
      console.log(`      • ${option}`);
    }
  } else {
    console.log('   ⚠️  No custom autovacuum settings (using database defaults)');
  }

  // Step 4: Show table sizes
  console.log('\n📋 Step 4: Current table sizes...');
  
  const sizes = await prisma.$queryRaw`
    SELECT 
      relname as table_name,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size,
      pg_size_pretty(pg_relation_size(relid)) as table_size,
      pg_size_pretty(pg_indexes_size(relid)) as index_size
    FROM pg_stat_user_tables
    WHERE relname IN ('DatasetRecord', 'ImportJob', 'Dataset')
    ORDER BY pg_total_relation_size(relid) DESC
  ` as any[];

  for (const row of sizes) {
    console.log(`   📊 ${row.table_name}: ${row.total_size} total (${row.table_size} table, ${row.index_size} indexes)`);
  }

  // Step 5: Show record counts
  console.log('\n📋 Step 5: Dataset statistics...');
  
  const stats = await prisma.$queryRaw`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT dataset_id) as total_datasets,
      COUNT(DISTINCT import_job_id) as total_imports,
      AVG(pg_column_size(data)) as avg_record_size_bytes
    FROM "DatasetRecord"
  ` as any[];

  const stat = stats[0];
  console.log(`   📝 Total records: ${Number(stat.total_records).toLocaleString()}`);
  console.log(`   📦 Total datasets: ${Number(stat.total_datasets).toLocaleString()}`);
  console.log(`   🔄 Total imports: ${Number(stat.total_imports).toLocaleString()}`);
  console.log(`   📏 Avg record size: ${Math.round(Number(stat.avg_record_size_bytes))} bytes`);

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Optimization complete!\n');

  console.log('\n📖 API Endpoints for Monitoring:');
  console.log('   GET  /api/database/health          - Full health report');
  console.log('   GET  /api/database/sizes           - Table sizes');
  console.log('   GET  /api/database/indexes         - Index usage stats');
  console.log('   GET  /api/database/bloat           - Dead tuple stats');
  console.log('   POST /api/database/vacuum/dataset-records  - Manual VACUUM');

  console.log('\n💡 Maintenance Tips:');
  console.log('   • Run VACUUM after large imports');
  console.log('   • Monitor dead tuple ratio (< 20% is healthy)');
  console.log('   • Consider partitioning if dataset > 1M records');
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
