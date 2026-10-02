import { Type } from 'class-transformer';
import { TemplateType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  code?: string;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  trackingId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsString()
  secondaryContent?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  otpExpiryMinutes?: number;

  @IsOptional()
  @IsObject()
  placeholdersJson?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPricePerMessage?: number;
}
