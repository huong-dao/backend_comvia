import { TemplateCtaType } from '@prisma/client';
import { IsObject } from 'class-validator';

export class UpdateCtaPricingConfigDto {
  @IsObject()
  prices!: Partial<Record<TemplateCtaType, number>>;
}
