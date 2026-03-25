import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class MockPaymentWebhookDto {
  @IsString()
  provider!: string;

  @IsString()
  eventId!: string;

  @IsString()
  topupCode!: string;

  @IsIn(['success', 'failed'])
  status!: 'success' | 'failed';

  @IsOptional()
  @IsString()
  paymentRef?: string;

  @IsOptional()
  amountInclVat?: number;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}
