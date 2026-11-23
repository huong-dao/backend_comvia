import { Module } from '@nestjs/common';
import { OaConnectionsModule } from '../oa/oa-connections.module';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [OaConnectionsModule, WalletModule, SubscriptionsModule],
  controllers: [PublicApiController],
  providers: [PublicApiService],
})
export class PublicApiModule {}
