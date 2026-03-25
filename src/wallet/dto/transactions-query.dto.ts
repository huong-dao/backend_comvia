import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { WalletTransactionType } from '@prisma/client';

export class TransactionsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;
}
