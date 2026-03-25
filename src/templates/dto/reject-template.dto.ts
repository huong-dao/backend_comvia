import { IsString, MinLength } from 'class-validator';

export class RejectTemplateDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
