import { IsString, MinLength } from 'class-validator';

export class UpdateCampaignDto {
  @IsString()
  @MinLength(2)
  name!: string;
}
