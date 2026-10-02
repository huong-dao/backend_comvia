import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Body for "Tạo OA" (POST /workspaces/:workspaceId/oa).
 * Chỉ các field profile nhập tay (BR-OA-01/05). Ảnh xử lý ở TICKET-011.
 */
export class CreateOaDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
