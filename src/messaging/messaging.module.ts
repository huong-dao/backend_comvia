import { Module } from '@nestjs/common';
import { OaConnectionsModule } from '../oa/oa-connections.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OaConnectionsModule, WalletModule],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
