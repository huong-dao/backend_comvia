import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Body for PATCH /workspaces/:workspaceId/oa. Mọi field optional;
 * chỉ sửa profile nhập tay (name/code/description). Ảnh xử lý ở TICKET-011.
 */
export class UpdateOaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
