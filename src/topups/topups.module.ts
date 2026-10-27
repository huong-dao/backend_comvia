import { Module } from '@nestjs/common';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { TopupsController } from './topups.controller';
import { TopupsService } from './topups.service';
import { WalletModule } from '../wallet/wallet.module';
import { ZaloModule } from '../integrations/zalo/zalo.module';

@Module({
  imports: [WalletModule, ZaloModule],
  controllers: [TopupsController, WebhooksController],
  providers: [TopupsService],
  exports: [TopupsService],
})
export class TopupsModule {}
