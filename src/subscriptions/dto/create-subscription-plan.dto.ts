import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSubscriptionPlanDto {
  /** Mã gói (không bắt buộc, tự sinh từ tên nếu bỏ trống). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,40}$/, {
    message: 'code chỉ gồm chữ, số, "-" hoặc "_" (2-40 ký tự)',
  })
  code?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Giá chưa VAT (VND). */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceExclVat!: number;

  /** % VAT, ví dụ 10. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent!: number;

  /** Thời hạn theo năm: 1, 2, 3... */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  durationYears!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
