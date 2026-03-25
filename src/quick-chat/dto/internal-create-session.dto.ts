import { IsOptional, IsString, MaxLength } from 'class-validator';

export class InternalCreateQuickChatSessionDto {
  @IsString()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  agentId?: string;
}
