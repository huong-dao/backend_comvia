import { Type } from 'class-transformer';
import { TemplateStatus, TemplateType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TemplateCtaButtonDto } from './template-cta-button.dto';

// Admin override: every field is optional and, unlike the workspace-scoped
// PATCH, none of them are gated by the template's current status. Only
// `status` itself is checked, against TemplatesService's admin transition
// table (see adminOverride()).
export class AdminOverrideTemplateDto {
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

  @IsOptional()
  @IsString()
  @MinLength(1)
  providerTemplateId?: string;

  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @IsOptional()
  @IsBoolean()
  requiresOwnerRevision?: boolean;

  @IsOptional()
  @IsString()
  revisionReason?: string;

  // Replaces the template CTA set, same semantics as UpdateTemplateDto.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateCtaButtonDto)
  ctaButtons?: TemplateCtaButtonDto[];
}
