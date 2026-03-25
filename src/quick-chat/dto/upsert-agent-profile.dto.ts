import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const providers = ['openai', 'gemini', 'claude'] as const;

export class UpsertQuickChatAgentProfileDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsIn(providers)
  provider!: (typeof providers)[number];

  @IsString()
  @MaxLength(10000)
  systemPrompt!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedTools!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
