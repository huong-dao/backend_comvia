import { Module } from '@nestjs/common';
import { ZaloModule } from '../integrations/zalo/zalo.module';
import { OaAuthController } from './oa-auth.controller';
import { OaConnectionsController } from './oa-connections.controller';
import { OaConnectionsService } from './oa-connections.service';
import { OaMessagingService } from './oa-messaging.service';
import { OaTokenService } from './oa-token.service';

@Module({
  imports: [ZaloModule],
  controllers: [OaConnectionsController, OaAuthController],
  providers: [OaConnectionsService, OaTokenService, OaMessagingService],
  exports: [OaConnectionsService, OaTokenService, OaMessagingService],
})
export class OaConnectionsModule {}
