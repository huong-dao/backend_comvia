import { Module } from '@nestjs/common';
import { ZaloOAuthClient } from './zalo-oauth.client';
import { ZaloZnsClient } from './zalo-zns.client';

@Module({
  providers: [ZaloOAuthClient, ZaloZnsClient],
  exports: [ZaloOAuthClient, ZaloZnsClient],
})
export class ZaloModule {}
