import { WorkspaceSubscriptionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Admin cấp tay một kỳ subscription cho workspace (không qua thanh toán). */
export class GrantWorkspaceSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  /** Bỏ trống = tính như mua cộng dồn: từ lúc hết hạn kỳ cuối (hoặc từ bây giờ). */
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  /** Bỏ trống = startsAt + số năm của gói. */
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Admin sửa gói / ngày bắt đầu / ngày hết hạn của kỳ subscription đang dùng. */
export class UpdateWorkspaceSubscriptionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  planId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(WorkspaceSubscriptionStatus)
  status?: WorkspaceSubscriptionStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}
