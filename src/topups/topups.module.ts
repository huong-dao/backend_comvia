import { Module } from '@nestjs/common';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { TopupsController } from './topups.controller';
import { TopupsService } from './topups.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [TopupsController, WebhooksController],
  providers: [TopupsService],
  exports: [TopupsService],
})
export class TopupsModule {}
