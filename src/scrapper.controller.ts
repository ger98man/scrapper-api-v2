/* eslint-disable */
import { Controller, Get, Logger, Post, Req } from '@nestjs/common';
import { ScrapperService } from './scrapper/scrapper.service';

@Controller('scrapper')
export class ScrapperController {
  private readonly logger = new Logger(ScrapperController.name);

  constructor(private readonly scrapperService: ScrapperService) {}

  @Get('220lv')
  async scrape220LV() {
    this.logger.log('Starting scrape for 220LV');
    return await this.scrapperService.scrapePage220LV();
  }

  @Post('mercado')
  async scrapeMercado(@Req() req: any): Promise<any[]> {
    this.logger.log('Starting scrape for Mercado');
    return await this.scrapperService.scrapePageMercado(
      req.body.category,
      req.body.limit,
    );
  }
}
