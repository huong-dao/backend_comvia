import { Type } from 'class-transformer';
import { WorkspaceStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListWorkspacesQueryDto {
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
  limit?: number = 30;

  // Matches against name/slug (contains, case-insensitive). Owner is a
  // separate exact-match filter below, same split as GET /admin/orders.
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(WorkspaceStatus)
  status?: WorkspaceStatus;

  @IsOptional()
  @IsString()
  ownerUserId?: string;
}
