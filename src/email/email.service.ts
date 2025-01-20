import { Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  private readonly transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: this.configService.get<string>('EMAIL_USER'),
      pass: this.configService.get<string>('EMAIL_PWD'),
    },
  });

  public async sendScrapingResults(
    to: string,
    subject: string,
    products: { name: string; price: string; link: string }[],
  ): Promise<void> {
    const productTable = `
      <table border="1" style="border-collapse: collapse; width: 100%; text-align: left;">
        <thead>
          <tr>
            <th style="padding: 8px; border: 1px solid #ddd;">Product</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map(
              (product) => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">
                <a href="${product.link}" target="_blank" style="text-decoration: none; color: #007bff;">
                  ${product.name}
                </a>
              </td>
              <td style="padding: 8px; border: 1px solid #ddd;">${product.price}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html: `
        <p>Scraping results:</p>
        <p>Total items: ${products.length}</p>
        ${productTable}
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }
}
