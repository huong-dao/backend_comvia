import { Type } from 'class-transformer';
import { TemplateCtaType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TemplateCtaButtonDto {
  // An existing button's id is required when PATCHing it so its unit price is
  // retained. Omit it to create a new button.
  @IsOptional()
  @IsUUID()
  id?: string;

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

  // Accepted by the DTO so the service can return the required 403 for a
  // workspace user. ADMIN may set it only through the template PATCH route.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice?: number;

  @IsInt()
  @Min(0)
  @Max(1)
  position!: number;
}

export class UpdateTemplateCtaButtonPriceDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;
}
