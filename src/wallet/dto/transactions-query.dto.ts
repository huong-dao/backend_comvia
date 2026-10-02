import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { WalletTransactionStatus, WalletTransactionType } from '@prisma/client';

export class TransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  // Group filter: multiple types in one query (?types=A&types=B).
  // Takes precedence over `type` when both are sent (see TICKET-005).
  @IsOptional()
  @Transform(({ value }): unknown =>
    value === undefined || Array.isArray(value) ? value : [value],
  )
  @IsEnum(WalletTransactionType, { each: true })
  types?: WalletTransactionType[];

  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  status?: WalletTransactionStatus;

  // ISO date or date-only (YYYY-MM-DD). Date-only is anchored to the
  // Asia/Ho_Chi_Minh day boundary in the service (BR-WALLET-05).
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
