import { IsObject, IsString } from 'class-validator';

export class SendPublicMessageDto {
  @IsString()
  templateId!: string;

  @IsString()
  phoneNumber!: string;

  @IsObject()
  data!: Record<string, unknown>;

  // included for compatibility with your spec (some clients pass in body)
  @IsString()
  api_key!: string;
}
