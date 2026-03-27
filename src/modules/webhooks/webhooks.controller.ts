import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {}

  @Post('pay2s/ipn')
  @HttpCode(HttpStatus.OK)
  async handlePay2sIPNCallback(
    @Req() req: Request,
    @Headers('x-signature') signature: string,
  ) {
    const data = req.body || {};
    const {
      amount,
      extraData = '',
      message,
      orderId,
      orderInfo,
      orderType,
      partnerCode,
      payType,
      requestId,
      responseTime,
      resultCode,
      transId,
      signature: payloadSignature,
      m2signature,
    } = data;

    const pay2sConfig = this.configService.get('pay2s');
    if (
      !pay2sConfig ||
      !pay2sConfig.partnerCode ||
      !pay2sConfig.apiKey ||
      !pay2sConfig.apiSecret
    ) {
      throw new UnauthorizedException('Pay2S configuration error');
    }

    const expectedPartnerCode = pay2sConfig.partnerCode;
    if (partnerCode !== expectedPartnerCode) {
      throw new UnauthorizedException('Invalid partner code');
    }

    // Log webhook for debugging
    await this.webhooksService.logWebhook('pay2s', requestId, data, 'received');

    try {
      const result = await this.webhooksService.processPay2sIPN(
        req,
        payloadSignature || m2signature || signature,
      );

      await this.webhooksService.logWebhook(
        'pay2s',
        requestId,
        data,
        result.success ? 'processed' : 'failed',
      );

      return result;
    } catch (error) {
      await this.webhooksService.logWebhook('pay2s', requestId, data, 'error');
      throw error;
    }
  }
}
