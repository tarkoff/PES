import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataGovService } from './data-gov.service';

@Module({
  imports: [HttpModule],
  providers: [DataGovService],
  exports: [DataGovService],
})
export class DataGovModule {}
