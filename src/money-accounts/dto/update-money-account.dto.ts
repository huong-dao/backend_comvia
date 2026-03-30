import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateMoneyAccountDto {
  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  bankCode?: string;

  @IsString()
  @IsOptional()
  pay2sBankId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
