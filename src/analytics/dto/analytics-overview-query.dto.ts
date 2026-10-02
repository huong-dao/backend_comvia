import { IsEnum, IsOptional } from 'class-validator';

/**
 * Kỳ lọc cho dashboard analytics (BR-MSG-04 / ADR-003).
 * Giá trị khớp query string FE gửi: `7d` | `month` | `year`.
 */
export enum AnalyticsPeriod {
  SEVEN_DAYS = '7d',
  MONTH = 'month',
  YEAR = 'year',
}

export class AnalyticsOverviewQueryDto {
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period: AnalyticsPeriod = AnalyticsPeriod.SEVEN_DAYS;
}
