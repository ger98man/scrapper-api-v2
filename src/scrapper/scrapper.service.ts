/* eslint-disable */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import * as cheerio from 'cheerio';

@Injectable()
export class ScrapperService implements OnModuleInit {
  private scraperApiClient: any;
  private readonly logger = new Logger(ScrapperService.name);
  private readonly emailRecipient: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.emailRecipient =
      this.configService.get<string>('SCRAPER_EMAIL_RECIPIENT') || '';
  }

  onModuleInit() {
    this.scraperApiClient = require('scraperapi-sdk')(
      this.configService.get<string>('SCRAPER_API_KEY'),
    );
  }

  private formatPrice(price: string): string {
    const match = price.match(/(\d+[,.]?\d*)\s*(\D*)$/);
    if (!match) return 'N/A';
    const numericPrice = parseFloat(match[1].replace(',', '.'));
    return `${numericPrice.toFixed(2)} ${match[2]}`.trim();
  }

  public async scrapePage220LV(): Promise<any[]> {
    const url = this.configService.get<string>('MERCHANT_URL') || '';

    try {
      this.logger.log(`Scraping page: ${url}`);
      const apiResult = await this.scraperApiClient.get(url);
      if (!apiResult || apiResult.statusCode !== 200) {
        this.logger.error(
          `Failed to fetch main page, status: ${apiResult?.statusCode}`,
        );
        return [];
      }

      const $ = cheerio.load(apiResult.body);
      const links: string[] = $('.c-product-card .c-product-card__title a')
        .map((_, element) => $(element).attr('href'))
        .get()
        .filter(Boolean);

      const productPromises = links.map(async (link) => {
        try {
          const itemResult = await this.scraperApiClient.get(link);
          if (!itemResult || itemResult.statusCode !== 200) {
            this.logger.warn(`Skipping item due to fetch failure: ${link}`);
            return null;
          }
          const itemPage = cheerio.load(itemResult.body);

          const productName = itemPage('.c-product__name').text().trim();
          const productPrice =
            itemPage('.c-price.h-price--xx-large.h-price--new').text().trim() ||
            itemPage('.c-price.h-price--xx-large.h-price').text().trim();

          const merchantLink = itemPage('.c-product__seller-info a').attr(
            'href',
          );

          if (merchantLink !== url) {
            return {
              name: productName,
              price: this.formatPrice(productPrice),
              link,
            };
          }
        } catch (error) {
          this.logger.error(`Failed to fetch item details for ${link}`, error);
          return null;
        }
      });

      const products: any = (await Promise.all(productPromises)).filter(
        Boolean,
      );
      this.logger.log(`Total products found: ${products.length}`);

      if (products.length && this.emailRecipient) {
        await this.emailService.sendScrapingResults(
          this.emailRecipient,
          'Scraping Results',
          products,
        );
        this.logger.log('Email sent successfully.');
      }

      return products;
    } catch (error) {
      this.logger.error(`Error scraping page ${url}:`, error);
      return [];
    }
  }

  public async scrapePageMercado(): Promise<any[]> {
    const searchUrl = 'https://lista.mercadolivre.com.br';

    try {
      this.logger.log(`Scraping Mercado page: ${searchUrl}`);
      const apiResult = await this.scraperApiClient.get(searchUrl);
      if (!apiResult || apiResult.statusCode !== 200) {
        this.logger.error(
          `Failed to fetch Mercado page, status: ${apiResult?.statusCode}`,
        );
        return [];
      }

      const $ = cheerio.load(apiResult.body);

      let totalCount = 0;
      const scrapedResult: any[] = [];
      $('.ui-search-layout__item').each((_, element) => {
        totalCount++;
        const seller = $(element).find('.poly-component__seller').text().trim();
        if (seller) {
          const title = $(element).find('.poly-component__title').text().trim();
          const price = $(element).find('.poly-price__current').text().trim();
          const link = $(element).find('a').attr('href');

          scrapedResult.push({ title, price, seller, link });
        }
      });
      const uniqueSellers = scrapedResult.filter(
        (item, index, self) =>
          index === self.findIndex((obj) => obj.seller === item.seller),
      );

      this.logger.log(
        `Scrapping result:\nTotal items: ${totalCount}\nTotal with seller: ${scrapedResult.length}\nUnique seller: ${uniqueSellers.length}`,
      );
      return scrapedResult;
    } catch (error) {
      this.logger.error(`Error scraping Mercado page ${searchUrl}:`, error);
      return [];
    }
  }
}
