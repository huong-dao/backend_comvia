import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CollectionRequestsService } from '../collection-requests/collection-requests.service';
import { verifyPay2sSignature } from '../../integrations/pay2s/pay2s.util';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly collectionRequestsService: CollectionRequestsService,
  ) {}

  async processPay2sIPN(req: Request, signature: string) {
    const data = req.body || {};

    // Handle payment
    const {
      transId,
      orderId: collectionRequestCode,
      amount,
      resultCode,
    } = data;

    this.logger.log(
      `Processing Pay2S IPN for collection request ${collectionRequestCode}, amount: ${amount}, resultCode: ${resultCode}`,
    );

    const resultCodeNum = Number(resultCode);
    if (resultCodeNum !== 0 && resultCodeNum !== 2) {
      this.logger.log(
        `Payment not successful for collection request ${collectionRequestCode}, resultCode: ${resultCode}`,
      );
      return { success: false };
    }

    // Verify signature in production
    if (process.env.NODE_ENV !== 'development') {
      const pay2sConfig = this.configService.get('pay2s');
      if (!pay2sConfig || !pay2sConfig.apiSecret) {
        throw new UnauthorizedException('Pay2S configuration error');
      }

      const params: Record<string, string> = {
        accessKey: data.accessKey,
        amount: data.amount,
        extraData: data.extraData || '',
        message: data.message,
        orderId: data.orderId,
        orderInfo: data.orderInfo,
        orderType: data.orderType,
        partnerCode: data.partnerCode,
        payType: data.payType,
        requestId: data.requestId,
        responseTime: data.responseTime,
        resultCode: data.resultCode,
        transId: data.transId,
      };

      const isValidSignature = verifyPay2sSignature(
        params,
        signature,
        pay2sConfig.apiSecret,
      );
      if (!isValidSignature) {
        this.logger.error(`Invalid signature for Pay2S IPN: ${signature}`);
        throw new UnauthorizedException('Invalid signature');
      }
    }

    // Process payment using collection request service
    const result =
      await this.collectionRequestsService.processPay2sCallback(data);

    this.logger.log(
      `Pay2S IPN processed for collection request ${collectionRequestCode}: ${result.success ? 'SUCCESS' : 'FAILED'}`,
    );
    return result;
  }

  async logWebhook(
    provider: string,
    eventId: string,
    payload: any,
    status: string,
  ) {
    try {
      await this.prisma.paymentWebhookLog.create({
        data: {
          provider,
          eventId,
          rawPayload: payload,
          status,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log webhook: ${error}`);
    }
  }
}
