import { IsOptional, IsString, MinLength } from 'class-validator';

export class ApproveTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  providerTemplateId?: string;
}
