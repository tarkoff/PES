import { Module } from '@nestjs/common';
import { DatasetService } from './dataset.service';
import { DatasetController } from './dataset.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ImportModule } from '../import/import.module';
import { DataGovModule } from '../data-gov/data-gov.module';

@Module({
  imports: [PrismaModule, ImportModule, DataGovModule],
  providers: [DatasetService],
  controllers: [DatasetController]
})
export class DatasetModule {}
