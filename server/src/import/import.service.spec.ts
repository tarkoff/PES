import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';

describe('ImportService', () => {
  let service: ImportService;
  let prisma: PrismaService;
  let importQueue: Queue;

  const mockDataset = {
    id: 'dataset-1',
    name: 'Test Dataset',
    resource_url: 'http://example.com/data.csv',
    format: 'CSV',
    struct_config: {},
    field_config: null,
    auto_sync: false,
    cron_schedule: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockImportJob = {
    id: 'job-1',
    dataset_id: 'dataset-1',
    status: 'PENDING',
    total_rows: 0,
    success_rows: 0,
    error_rows: 0,
    started_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockPrismaService = {
    dataset: {
      findUnique: jest.fn(),
    },
    importJob: {
      create: jest.fn(),
    },
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'bull-job-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'BullQueue_import-queue', useValue: mockQueue },
      ],
    })
      .overrideProvider('BullQueue_import-queue')
      .useValue(mockQueue)
      .compile();

    service = module.get<ImportService>(ImportService);
    prisma = module.get<PrismaService>(PrismaService);
    importQueue = module.get<Queue>('BullQueue_import-queue');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('triggerImport', () => {
    it('should create an import job and add to queue', async () => {
      mockPrismaService.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaService.importJob.create.mockResolvedValue(mockImportJob);

      const result = await service.triggerImport('dataset-1');

      expect(prisma.dataset.findUnique).toHaveBeenCalledWith({
        where: { id: 'dataset-1' },
      });
      expect(prisma.importJob.create).toHaveBeenCalledWith({
        data: {
          dataset_id: mockDataset.id,
          status: 'PENDING',
        },
      });
      expect(importQueue.add).toHaveBeenCalledWith('process-dataset', {
        jobId: mockImportJob.id,
        datasetUrl: mockDataset.resource_url,
        format: mockDataset.format,
        structConfig: mockDataset.struct_config,
        datasetId: mockDataset.id,
      });
      expect(result).toEqual(mockImportJob);
    });

    it('should throw error if dataset not found', async () => {
      mockPrismaService.dataset.findUnique.mockResolvedValue(null);

      await expect(service.triggerImport('nonexistent')).rejects.toThrow(
        'Dataset not found',
      );
    });
  });
});
