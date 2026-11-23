import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const SUBSCRIPTION_STATES = [
  'ACTIVE',
  'UPCOMING',
  'EXPIRED',
  'CANCELLED',
] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export class ListWorkspaceSubscriptionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  /** Tìm theo tên/slug workspace hoặc email owner. */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  /** Trạng thái tại thời điểm hiện tại. */
  @IsOptional()
  @IsIn(SUBSCRIPTION_STATES)
  state?: SubscriptionState;

  /** Lọc theo ngày hết hạn (endsAt) trong khoảng. */
  @IsOptional()
  @IsDateString()
  endsAtFrom?: string;

  @IsOptional()
  @IsDateString()
  endsAtTo?: string;
}
