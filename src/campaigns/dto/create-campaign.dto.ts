import { IsString, MinLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  templateId!: string;
}
