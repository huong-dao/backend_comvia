import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ZaloModule } from '../integrations/zalo/zalo.module';
import { OaAuthController } from './oa-auth.controller';
import { OaConnectionsController } from './oa-connections.controller';
import { OaConnectionsService } from './oa-connections.service';
import { OaMessagingService } from './oa-messaging.service';
import { OaProfileController } from './oa-profile.controller';
import { OaProfileService } from './oa-profile.service';
import { OaTokenService } from './oa-token.service';

@Module({
  imports: [ZaloModule, CommonModule],
  controllers: [OaConnectionsController, OaAuthController, OaProfileController],
  providers: [
    OaConnectionsService,
    OaTokenService,
    OaMessagingService,
    OaProfileService,
  ],
  exports: [OaConnectionsService, OaTokenService, OaMessagingService],
})
export class OaConnectionsModule {}
