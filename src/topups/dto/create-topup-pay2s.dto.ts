import { IsString, IsNumber, Min } from 'class-validator';

export class CreateTopupPay2sDto {
  @IsNumber()
  @Min(10000) // Minimum amount according to Pay2S documentation
  amountExclVat!: number;

  @IsString()
  moneyAccountId!: string;
}
