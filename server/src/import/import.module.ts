import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { ImportProcessor } from './import.processor';
import { ImportService } from './import.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    BullModule.registerQueue({
      name: 'import-queue',
    }),
  ],
  providers: [ImportProcessor, ImportService],
  exports: [ImportService],
})
export class ImportModule {}
