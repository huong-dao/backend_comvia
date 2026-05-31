import { CampaignRowStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListCampaignRowsQueryDto {
  @IsOptional()
  @IsEnum(CampaignRowStatus)
  status?: CampaignRowStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
