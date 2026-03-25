import { IsNumber, IsOptional, Min } from 'class-validator';

export class CreateTopupQrDto {
  @IsNumber()
  @Min(100)
  amountExclVat!: number;

  @IsOptional()
  @IsNumber()
  vatRate?: number; // default 10%
}
