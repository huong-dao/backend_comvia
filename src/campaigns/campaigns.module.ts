import { Module } from '@nestjs/common';
import { OaConnectionsModule } from '../oa/oa-connections.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignWorkerService } from './campaign-worker.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OaConnectionsModule, WalletModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignWorkerService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
