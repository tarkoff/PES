import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { DatasetService } from './dataset.service';
import { DataGovService } from '../data-gov/data-gov.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('datasets')
@Controller('datasets')
export class DatasetController {
  constructor(
    private readonly datasetService: DatasetService,
    private readonly dataGovService: DataGovService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all datasets' })
  @ApiResponse({ status: 200, description: 'List of all datasets' })
  async findAll() {
    return this.datasetService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get dataset statistics' })
  @ApiResponse({ status: 200, description: 'Dataset statistics' })
  async getStats() {
    return this.datasetService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single dataset by ID' })
  @ApiParam({ name: 'id', description: 'Dataset ID' })
  @ApiResponse({ status: 200, description: 'Dataset found' })
  @ApiResponse({ status: 404, description: 'Dataset not found' })
  async findOne(@Param('id') id: string) {
    return this.datasetService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dataset' })
  @ApiParam({ name: 'id', description: 'Dataset ID' })
  @ApiResponse({ status: 200, description: 'Dataset updated' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.datasetService.update(id, body);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new dataset' })
  @ApiResponse({ status: 201, description: 'Dataset created' })
  async create(@Body() body: any) {
    return this.datasetService.create(body);
  }

  @Post(':id/import')
  @ApiOperation({ summary: 'Trigger dataset data import' })
  @ApiParam({ name: 'id', description: 'Dataset ID' })
  @ApiResponse({ status: 201, description: 'Import job started' })
  async triggerImport(@Param('id') id: string) {
    return this.datasetService.triggerImport(id);
  }

  @Get(':id/records')
  @ApiOperation({ summary: 'Get dataset records with pagination' })
  @ApiParam({ name: 'id', description: 'Dataset ID' })
  @ApiQuery({ name: 'page', required: false, default: 1 })
  @ApiQuery({ name: 'limit', required: false, default: 50 })
  @ApiResponse({ status: 200, description: 'Paginated dataset records' })
  async getRecords(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.datasetService.getRecords(id, parseInt(page), parseInt(limit));
  }

  @Get('search')
  @ApiOperation({ summary: 'Search CKAN for datasets' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Search results from CKAN' })
  async searchCkan(@Query('q') q: string) {
    return this.dataGovService.searchDataset(q);
  }
}
