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
    this.initializeJobScheduler();
  }

  private calculateInterval(minutesArray: number[]): number {
    if (minutesArray.length < 2) return 60; // If only one value exists, fallback
    const sorted = [...minutesArray].sort((a, b) => a - b);
    const differences = sorted.map((val, idx) =>
      idx === sorted.length - 1 ? 60 - val + sorted[0] : sorted[idx + 1] - val,
    );
    return Math.min(...differences);
  }

  private convertCronToMinutes(cron: string): number {
    const [minute, hour, day, month, dayOfWeek] = cron.split(' ');

    // Handle basic minute-based patterns
    if (minute === '*') return 1; // Runs every minute
    if (minute.includes('/')) return parseInt(minute.split('/')[1], 10); // "*/5" -> every 5 minutes

    // Complex cases or static values
    const minutesArray = minute.split(',').map(Number); // For "0,15,30,45"
    const interval = this.calculateInterval(minutesArray);

    return interval || 60; // Default fallback is 60 minutes
  }

  private initializeJobScheduler() {
    const cronTime = this.configService.get<string>('CRON_TIME');
    if (!cronTime) {
      throw new Error(
        'Job schedule is not defined in the environment variables.',
      );
    }

    schedule.scheduleJob(cronTime, async () => {
      console.log('Job executed at:', new Date());
      try {
        const products = await this.scrapperService.scrapePage();
        console.log('Products sent via email:', products);
      } catch (error) {
        console.error('Error executing scrapping job:', error);
      }
    });

    console.log(
      `Job scheduler initialized with schedule: "${cronTime}" (~every ${this.convertCronToMinutes(
        cronTime,
      )} minutes)`,
    );
  }
}
