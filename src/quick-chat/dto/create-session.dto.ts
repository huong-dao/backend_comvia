import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateQuickChatSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  agentId?: string;
}
