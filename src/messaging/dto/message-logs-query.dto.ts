import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MessageStatus, SendType } from '@prisma/client';

export class MessageLogsQueryDto {
  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;

  @IsOptional()
  @IsEnum(SendType)
  sendType?: SendType;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
