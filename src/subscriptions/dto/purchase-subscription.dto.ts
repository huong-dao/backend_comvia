import { IsNotEmpty, IsString } from 'class-validator';

export class PurchaseSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsString()
  @IsNotEmpty()
  moneyAccountId!: string;
}
