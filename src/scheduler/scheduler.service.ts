/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as schedule from 'node-schedule';
import { ScrapperService } from 'src/scrapper/scrapper.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly scrapperService: ScrapperService, // Inject ScrapperService
  ) {}

  onModuleInit() {
    if (this.configService.get<string>('isJobEnabled') === 'true') {
      const cronTime = this.configService.get<string>('CRON_TIME');
      this.initializeJobScheduler(cronTime);
      console.log(`Job scheduler initialized with schedule: "${cronTime}"`);
    }
  }

  private initializeJobScheduler(cronTime?: string) {
    if (!cronTime) {
      throw new Error(
        'Job schedule is not defined in the environment variables.',
      );
    }

    schedule.scheduleJob(cronTime, async () => {
      console.log('Job executed at:', new Date());
      try {
        const products = await this.scrapperService.scrapePage220LV();
        console.log('Products sent via email:', products);
      } catch (error) {
        console.error('Error executing scrapping job:', error);
      }
    });
  }
}
