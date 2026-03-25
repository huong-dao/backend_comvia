import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendQuickChatMessageDto {
  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsObject()
  toolInput?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  autoExecute?: boolean;
}
