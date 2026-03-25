import { Module } from '@nestjs/common';
import { OaConnectionsController } from './oa-connections.controller';
import { OaConnectionsService } from './oa-connections.service';

@Module({
  controllers: [OaConnectionsController],
  providers: [OaConnectionsService],
})
export class OaConnectionsModule {}
