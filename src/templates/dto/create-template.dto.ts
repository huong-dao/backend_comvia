import { TemplateType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(2)
  name!: string;

  // Controls content structure (BR-TPL-01). Defaults to TEXT at the service
  // layer when omitted, so legacy clients keep working.
  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  trackingId?: string;

  // Required for TEXT/TABLE, ignored for OTP — enforced in the service by type.
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
}
