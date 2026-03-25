import { IsObject, IsString, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsObject()
  placeholdersJson!: Record<string, unknown>;
}
