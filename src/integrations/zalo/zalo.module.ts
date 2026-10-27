import { Module } from '@nestjs/common';
import { ZaloOAuthClient } from './zalo-oauth.client';
import { ZaloDeliveryWebhookService } from './zalo-delivery-webhook.service';
import { ZaloZnsClient } from './zalo-zns.client';

@Module({
  providers: [ZaloOAuthClient, ZaloZnsClient, ZaloDeliveryWebhookService],
  exports: [ZaloOAuthClient, ZaloZnsClient, ZaloDeliveryWebhookService],
})
export class ZaloModule {}
