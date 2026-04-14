import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseMonitor } from './database-monitor.service';

@ApiTags('Database Performance')
@Controller('database')
export class DatabaseController {
  private monitor: DatabaseMonitor;

  constructor(private prisma: PrismaService) {
    this.monitor = new DatabaseMonitor(prisma);
  }

  @Get('health')
  @ApiOperation({ summary: 'Get database health report' })
  @ApiResponse({ status: 200, description: 'Database health report' })
  async getHealthReport() {
    return this.monitor.getHealthReport();
  }

  @Get('sizes')
  @ApiOperation({ summary: 'Get table size statistics' })
  @ApiResponse({ status: 200, description: 'Table sizes in human-readable format' })
  async getTableSizes() {
    return this.monitor.getTableSizes();
  }

  @Get('indexes')
  @ApiOperation({ summary: 'Get index usage statistics' })
  @ApiResponse({ status: 200, description: 'Index usage stats' })
  async getIndexUsage() {
    return this.monitor.getIndexUsage();
  }

  @Get('bloat')
  @ApiOperation({ summary: 'Get dead tuple statistics (bloat indicator)' })
  @ApiResponse({ status: 200, description: 'Dead tuple stats' })
  async getDeadTupleStats() {
    return this.monitor.getDeadTupleStats();
  }

  @Get('vacuum-config')
  @ApiOperation({ summary: 'Get autovacuum configuration for monitored tables' })
  @ApiResponse({ status: 200, description: 'Vacuum config' })
  async getVacuumConfig() {
    return this.monitor.getVacuumConfig();
  }

  @Get('records-per-dataset')
  @ApiOperation({ summary: 'Get record count per dataset' })
  @ApiResponse({ status: 200, description: 'Records per dataset' })
  async getRecordsPerDataset() {
    return this.monitor.getRecordsPerDataset();
  }

  @Post('vacuum/dataset-records')
  @ApiOperation({ summary: 'Run manual VACUUM ANALYZE on DatasetRecord table' })
  @ApiResponse({ status: 200, description: 'Vacuum completed' })
  async vacuumDatasetRecords() {
    await this.monitor.vacuumAnalyzeDatasetRecord();
    return { success: true, message: 'VACUUM ANALYZE completed on DatasetRecord' };
  }

  @Post('vacuum/import-jobs')
  @ApiOperation({ summary: 'Run manual VACUUM ANALYZE on ImportJob table' })
  @ApiResponse({ status: 200, description: 'Vacuum completed' })
  async vacuumImportJobs() {
    await this.monitor.vacuumAnalyzeImportJob();
    return { success: true, message: 'VACUUM ANALYZE completed on ImportJob' };
  }
}
