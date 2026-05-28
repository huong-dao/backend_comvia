import { Module } from '@nestjs/common';
import { OaConnectionsModule } from '../oa/oa-connections.module';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

@Module({
  imports: [OaConnectionsModule],
  controllers: [PublicApiController],
  providers: [PublicApiService],
})
export class PublicApiModule {}
