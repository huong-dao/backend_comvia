import { BillingType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class WorkspaceBillingFieldsDto {
  @IsEnum(BillingType)
  billingType!: BillingType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  address?: string;

  @IsOptional()
  @IsEmail()
  invoiceEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  citizenId?: string;
}
