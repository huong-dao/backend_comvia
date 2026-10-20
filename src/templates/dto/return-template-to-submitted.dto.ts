import { IsString, MinLength } from 'class-validator';

export class ReturnTemplateToSubmittedDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
