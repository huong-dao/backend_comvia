import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MessageStatus, SendType } from '@prisma/client';

export class MessageLogsQueryDto {
  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;

  @IsOptional()
  @IsEnum(SendType)
  sendType?: SendType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
