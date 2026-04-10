import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportService } from '../import/import.service';

@Injectable()
export class DatasetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importService: ImportService,
  ) {}

  async findAll() {
    return this.prisma.dataset.findMany({
      include: {
        import_jobs: {
          orderBy: { started_at: 'desc' },
          take: 1,
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.dataset.findUnique({
      where: { id },
      include: {
        import_jobs: {
          orderBy: { started_at: 'desc' },
          take: 1,
        },
      },
    });
  }

  async update(
    id: string,
    data: { name?: string; field_config?: Record<string, any> },
  ) {
    return this.prisma.dataset.update({
      where: { id },
      data,
    });
  }

  async create(data: {
    name: string;
    resource_url: string;
    format: string;
    struct_config?: any;
    auto_sync?: boolean;
  }) {
    return this.prisma.dataset.create({ data });
  }

  async triggerImport(id: string) {
    return this.importService.triggerImport(id);
  }

  async getRecords(id: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const records = await this.prisma.datasetRecord.findMany({
      where: { dataset_id: id },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    });
    const total = await this.prisma.datasetRecord.count({
      where: { dataset_id: id },
    });
    return { data: records.map((r) => r.data), total, page, limit };
  }

  async getStats() {
    const datasets = await this.prisma.importJob.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { success_rows: true, error_rows: true },
    });

    let active = 0;
    let successRecords = 0;
    let errorCount = 0;
    const datasetsCount = (
      await this.prisma.dataset.aggregate({ _count: { id: true } })
    )._count.id;

    datasets.forEach((ds) => {
      if (['PROCESSING', 'DOWNLOADING'].includes(ds.status)) {
        active += ds._count.id;
      } else if (ds.status === 'COMPLETED') {
        successRecords += ds._sum.success_rows || 0;
        errorCount += ds._sum.error_rows || 0;
      }
    });

    return {
      active,
      datasets: datasetsCount,
      success: successRecords,
      errors: errorCount,
    };
  }
}
