import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { EmailService } from '../email/email.service';

@Injectable()
export class ScrapperService implements OnModuleInit {
  private scraperApiClient: any;
  private readonly url: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService, // Inject EmailService
  ) {
    this.url = this.configService.get<string>('MERCHANT_URL') || '';
  }

  onModuleInit() {
    this.scraperApiClient = require('scraperapi-sdk')(
      this.configService.get<string>('SCRAPER_API_KEY'),
    );
  }

  private formatPrice(price: string): string {
    const currencySymbol = price.slice(-1);
    const numericPrice = parseInt(price.trim(), 10) / 100;
    return `${numericPrice.toFixed(2)} ${currencySymbol}`;
  }

  public async scrapePage(): Promise<any[]> {
    try {
      console.log(`Scraping page: ${this.url}`);
      const apiResult = await this.scraperApiClient.get(this.url);
      console.log(`Scraping status: ${apiResult.statusCode}`);

      const $ = cheerio.load(apiResult.body);

      let totalCount = 0;
      const links: string[] = [];
      $('.c-product-card').each((_, element) => {
        totalCount++;
        const link = $(element)
          .find('.c-product-card__title')
          .find('a')
          .attr('href');

        if (link) {
          links.push(link);
        }
      });

      const products: any[] = [];
      for (const link of links) {
        try {
          const itemResult = await this.scraperApiClient.get(link);
          const itemPage = cheerio.load(itemResult.body);

          const productName = itemPage('.c-product__name')
            .text()
            .replace('\\n', '')
            .trim();

          const productPriceElement = itemPage(
            '.c-price.h-price--xx-large.h-price--new',
          );

          let productPrice = productPriceElement
            .text()
            .replace(/\s/g, '')
            .trim();

          if (!productPrice) {
            productPrice = itemPage('.c-price.h-price--xx-large.h-price')
              .text()
              .replace(/\s/g, '')
              .trim();
          }

          const merchantLink = itemPage('.c-product__seller-info')
            .find('a')
            .attr('href');

          if (merchantLink !== this.url) {
            products.push({
              name: productName,
              price: this.formatPrice(productPrice),
              link,
            });
          }
        } catch (error) {
          console.error(`Failed to fetch item details`, error);
        }
      }

      console.log(`Total items: ${totalCount}`);

      if (products.length !== 0) {
        // Use EmailService to send the results
        await this.emailService.sendScrapingResults(
          'germanmy98@gmail.com', // Recipient email
          'Scraping Results', // Subject
          products, // Products to include
        );
        console.log('Email sent successfully.');
      }

      return products;
    } catch (error) {
      console.error(`Error scraping page ${this.url}:`, error);
      return [];
    }
  }
}
