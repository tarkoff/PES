import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImportService {
  constructor(
    @InjectQueue('import-queue') private readonly importQueue: Queue,
    private prisma: PrismaService,
  ) {}

  async triggerImport(datasetId: string) {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    const job = await this.prisma.importJob.create({
      data: {
        dataset_id: dataset.id,
        status: 'PENDING',
      },
    });

    await this.importQueue.add('process-dataset', {
      jobId: job.id,
      datasetUrl: dataset.resource_url,
      format: dataset.format,
      structConfig: dataset.struct_config,
      datasetId: dataset.id,
    });

    return job;
  }
}
