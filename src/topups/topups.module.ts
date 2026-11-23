import { Module } from '@nestjs/common';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { TopupsController } from './topups.controller';
import { TopupsService } from './topups.service';
import { WalletModule } from '../wallet/wallet.module';
import { ZaloModule } from '../integrations/zalo/zalo.module';
import { Pay2sModule } from '../integrations/pay2s/pay2s.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [WalletModule, ZaloModule, Pay2sModule, SubscriptionsModule],
  controllers: [TopupsController, WebhooksController],
  providers: [TopupsService],
  exports: [TopupsService],
})
export class TopupsModule {}
