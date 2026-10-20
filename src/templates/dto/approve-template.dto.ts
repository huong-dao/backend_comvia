import { IsString, MinLength } from 'class-validator';

export class ApproveTemplateDto {
  @IsString()
  @MinLength(1)
  providerTemplateId!: string;
}
