import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DataGovService {
  private readonly logger = new Logger(DataGovService.name);

  constructor(private readonly httpService: HttpService) {}

  async searchDataset(query: string) {
    const url = `https://data.gov.ua/api/3/action/package_search?q=${encodeURIComponent(query)}`;
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data.result.results;
    } catch (error) {
      this.logger.error('Помилка при пошуку набору даних', error);
      throw error;
    }
  }

  async getDatasetDetails(id: string) {
    const url = `https://data.gov.ua/api/3/action/package_show?id=${id}`;
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data.result;
    } catch (error) {
      this.logger.error('Помилка при отриманні деталей набору', error);
      throw error;
    }
  }
}
