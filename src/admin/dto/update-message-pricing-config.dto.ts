import { IsNumber, Min } from 'class-validator';

export class UpdateMessagePricingConfigDto {
  @IsNumber()
  @Min(0)
  defaultMessageUnitPrice!: number;
}
