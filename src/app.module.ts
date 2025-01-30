import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { ConfigModule } from '@nestjs/config';
import { ScrapperService } from './scrapper/scrapper.service';
import { EmailService } from './email/email.service';
import { ScrapperController } from './scrapper.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, ScrapperController],
  providers: [AppService, SchedulerService, ScrapperService, EmailService],
})
export class AppModule {}
