import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateMoneyAccountDto {
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

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
  isActive?: boolean = true;
}
