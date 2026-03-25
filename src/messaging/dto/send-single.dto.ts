import { IsObject, IsString } from 'class-validator';

export class SendSingleDto {
  @IsString()
  templateId!: string;

  @IsString()
  phoneNumber!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
