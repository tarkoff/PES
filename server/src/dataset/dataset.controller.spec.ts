import { Test, TestingModule } from '@nestjs/testing';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';
import { DataGovService } from '../data-gov/data-gov.service';

describe('DatasetController', () => {
  let controller: DatasetController;

  const mockDatasetService = {
    findAll: jest.fn().mockResolvedValue([]),
    getStats: jest.fn().mockResolvedValue({ totalDatasets: 0, totalRecords: 0 }),
    findOne: jest.fn().mockResolvedValue({ id: '1', name: 'Test Dataset' }),
    update: jest.fn().mockResolvedValue({ id: '1', name: 'Updated Dataset' }),
    create: jest.fn().mockResolvedValue({ id: '1', name: 'New Dataset' }),
    triggerImport: jest.fn().mockResolvedValue({ jobId: 'job-1', status: 'PENDING' }),
    getRecords: jest.fn().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
  };

  const mockDataGovService = {
    searchDataset: jest.fn().mockResolvedValue({ results: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatasetController],
      providers: [
        { provide: DatasetService, useValue: mockDatasetService },
        { provide: DataGovService, useValue: mockDataGovService },
      ],
    }).compile();

    controller = module.get<DatasetController>(DatasetController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all datasets', async () => {
      const result = await controller.findAll();
      expect(result).toEqual([]);
      expect(mockDatasetService.findAll).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return dataset statistics', async () => {
      const result = await controller.getStats();
      expect(result).toEqual({ totalDatasets: 0, totalRecords: 0 });
      expect(mockDatasetService.getStats).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single dataset by id', async () => {
      const result = await controller.findOne('1');
      expect(result).toEqual({ id: '1', name: 'Test Dataset' });
      expect(mockDatasetService.findOne).toHaveBeenCalledWith('1');
    });
  });

  describe('update', () => {
    it('should update a dataset', async () => {
      const body = { name: 'Updated Dataset' };
      const result = await controller.update('1', body);
      expect(result).toEqual({ id: '1', name: 'Updated Dataset' });
      expect(mockDatasetService.update).toHaveBeenCalledWith('1', body);
    });
  });

  describe('create', () => {
    it('should create a new dataset', async () => {
      const body = { name: 'New Dataset', resource_url: 'http://example.com/data.csv', format: 'CSV' };
      const result = await controller.create(body);
      expect(result).toEqual({ id: '1', name: 'New Dataset' });
      expect(mockDatasetService.create).toHaveBeenCalledWith(body);
    });
  });

  describe('triggerImport', () => {
    it('should trigger an import for a dataset', async () => {
      const result = await controller.triggerImport('1');
      expect(result).toEqual({ jobId: 'job-1', status: 'PENDING' });
      expect(mockDatasetService.triggerImport).toHaveBeenCalledWith('1');
    });
  });

  describe('getRecords', () => {
    it('should return paginated records with default page/limit', async () => {
      const result = await controller.getRecords('1', '1', '50');
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50 });
      expect(mockDatasetService.getRecords).toHaveBeenCalledWith('1', 1, 50);
    });

    it('should return paginated records with custom page/limit', async () => {
      const result = await controller.getRecords('1', '2', '25');
      expect(mockDatasetService.getRecords).toHaveBeenCalledWith('1', 2, 25);
    });
  });

  describe('searchCkan', () => {
    it('should search CKAN for datasets', async () => {
      const result = await controller.searchCkan('test query');
      expect(result).toEqual({ results: [] });
      expect(mockDataGovService.searchDataset).toHaveBeenCalledWith('test query');
    });
  });
});
