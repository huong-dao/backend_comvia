import { Module } from '@nestjs/common';
import { OaConnectionsModule } from '../oa/oa-connections.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OaConnectionsModule, WalletModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
