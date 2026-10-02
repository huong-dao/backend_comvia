import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * Module analytics read-only (ADR-003): query trực tiếp PrismaService
 * (PrismaModule @Global), không bảng aggregate/cache.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
