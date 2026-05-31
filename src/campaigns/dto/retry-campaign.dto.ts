import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class RetryCampaignDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  rowIds!: string[];
}
