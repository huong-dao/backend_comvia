import { Type } from 'class-transformer';
import { OaConnectionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListOaConnectionsQueryDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsEnum(OaConnectionStatus)
  status?: OaConnectionStatus;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  limit?: number;
}
