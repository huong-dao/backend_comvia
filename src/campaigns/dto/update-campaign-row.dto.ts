import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCampaignRowDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  phoneNumber?: string;

  @IsOptional()
  @IsObject()
  payloadData?: Record<string, string>;
}
