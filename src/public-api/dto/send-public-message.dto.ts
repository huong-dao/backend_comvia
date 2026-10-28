import { IsObject, IsString, ValidateIf } from 'class-validator';

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

  // included for compatibility with your spec (some clients pass in body)
  @IsString()
  api_key!: string;
}
