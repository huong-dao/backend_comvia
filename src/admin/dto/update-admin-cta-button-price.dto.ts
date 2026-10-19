import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateAdminCtaButtonPriceDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice!: number | null;
}
