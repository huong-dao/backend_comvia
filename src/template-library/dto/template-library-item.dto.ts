import { Type } from 'class-transformer';
import { TemplateCtaType, TemplateType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TemplateLibraryCtaButtonDto {
  @IsEnum(TemplateCtaType)
  type!: TemplateCtaType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  target?: string;

  @IsInt()
  @Min(0)
  @Max(1)
  position!: number;
}

export class CreateTemplateLibraryItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  secondaryContent?: string;

  @IsOptional()
  @IsString()
  content2?: string;

  @IsOptional()
  @IsString()
  secondaryContent2?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  otpExpiryMinutes?: number;

  @IsOptional()
  @IsObject()
  placeholdersJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  placeholder_labels?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  placeholderOrder?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TemplateLibraryCtaButtonDto)
  ctaButtons?: TemplateLibraryCtaButtonDto[];
}

// PATCH: bỏ trống = giữ nguyên; null = xoá giá trị (với field cho phép null).
export class UpdateTemplateLibraryItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  content?: string | null;

  @IsOptional()
  @IsString()
  secondaryContent?: string | null;

  @IsOptional()
  @IsString()
  content2?: string | null;

  @IsOptional()
  @IsString()
  secondaryContent2?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  otpExpiryMinutes?: number | null;

  @IsOptional()
  @IsObject()
  placeholdersJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  placeholder_labels?: Record<string, string> | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  placeholderOrder?: string[] | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TemplateLibraryCtaButtonDto)
  ctaButtons?: TemplateLibraryCtaButtonDto[] | null;
}

export class ListTemplateLibraryItemsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 12;

  /** Tìm theo tên, mô tả, tiêu đề mẫu tin (contains, không phân biệt hoa thường). */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** Lọc theo danh mục. Giá trị `none` = mẫu chưa phân loại. */
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;
}
