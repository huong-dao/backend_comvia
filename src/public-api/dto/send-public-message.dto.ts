import { IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';

export class SendPublicMessageDto {
  // Identify the template by either its id or its workspace-unique code.
  // When both are sent, both must match the same template.
  @ValidateIf((dto: SendPublicMessageDto) => !dto.templateCode)
  @IsString()
  templateId?: string;

  @ValidateIf((dto: SendPublicMessageDto) => !dto.templateId)
  @IsString()
  templateCode?: string;

  @IsString()
  phoneNumber!: string;

  @IsObject()
  data!: Record<string, unknown>;

  // Fallback only: ApiKeyGuard already reads the key from the x-api-key
  // header first (see common/guards/api-key.guard.ts). Optional so callers
  // that only send the header aren't forced to duplicate it in the body;
  // kept (not removed) so existing clients that still send it here don't
  // break under the global forbidNonWhitelisted ValidationPipe.
  @IsOptional()
  @IsString()
  api_key?: string;
}
