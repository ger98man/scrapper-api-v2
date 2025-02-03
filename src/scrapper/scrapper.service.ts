/* eslint-disable */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

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

  public async scrapePageMercado(
    category: string,
    limit: number,
  ): Promise<any[]> {
    const baseUrl = `https://lista.mercadolivre.com.br/${category}`;
    let nextPageUrl = baseUrl;
    const scrapedResult: any[] = [];

    try {
      while (nextPageUrl) {
        this.logger.log(`Scraping Mercado page: ${nextPageUrl}`);
        const apiResult = await this.scraperApiClient.get(nextPageUrl);

        if (!apiResult || apiResult.statusCode !== 200) {
          this.logger.error(
            `Failed to fetch Mercado page, status: ${apiResult?.statusCode}`,
          );
          break;
        }

        const $ = cheerio.load(apiResult.body);

        // Scrape the current page
        $('.ui-search-layout__item').each((_, element) => {
          const seller = $(element)
            .find('.poly-component__seller')
            .text()
            .trim();
          if (seller) {
            const title = $(element)
              .find('.poly-component__title')
              .text()
              .trim();
            const price = $(element).find('.poly-price__current').text().trim();
            const link = $(element).find('a').attr('href');

            scrapedResult.push({ title, price, seller, link });
          }
        });

        // Filter unique sellers
        const uniqueSellers = scrapedResult.filter(
          (item, index, self) =>
            index === self.findIndex((obj) => obj.seller === item.seller),
        );

        // Stop scraping if unique seller count reaches limit
        if (uniqueSellers.length >= limit) {
          this.logger.log(
            `Unique seller count reached ${limit}. Stopping scraping.`,
          );
          break;
        }

        // Check if there is a next page
        const nextPageLink = $(
          'a.andes-pagination__link:contains("Seguinte")',
        ).attr('href');
        if (nextPageLink) {
          nextPageUrl = nextPageLink; // Update the URL for the next page
        } else {
          nextPageUrl = ''; // No more pages, exit the loop
        }
      }

      // Final unique sellers
      const uniqueSellers = scrapedResult.filter(
        (item, index, self) =>
          index === self.findIndex((obj) => obj.seller === item.seller),
      );

      this.logger.log(
        `Scraping result:\nTotal items: ${scrapedResult.length}\nUnique sellers: ${uniqueSellers.length}`,
      );

      // Create CSV file
      this.createCSV(uniqueSellers);

      return uniqueSellers;
    } catch (error) {
      this.logger.error(`Error scraping Mercado page:`, error);
      return [];
    }
  }

  private createCSV(data: any[]): void {
    const csvHeaders = ['Title', 'Price', 'Seller', 'Link'];
    const csvRows = data.map((item) => [
      item.title,
      item.price,
      item.seller,
      item.link,
    ]);

    // Convert to CSV format
    const csvContent = [
      csvHeaders.join(','), // Header row
      ...csvRows.map((row) => row.join(',')), // Data rows
    ].join('\n');

    // Define file path
    const filePath = path.join(__dirname, '..', 'scraped_results.csv');

    // Write to file
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    this.logger.log(`CSV file created at: ${filePath}`);
  }
}
