import { Module } from '@nestjs/common';
import { OaConnectionsModule } from '../oa/oa-connections.module';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OaConnectionsModule, WalletModule],
  controllers: [PublicApiController],
  providers: [PublicApiService],
})
export class PublicApiModule {}
