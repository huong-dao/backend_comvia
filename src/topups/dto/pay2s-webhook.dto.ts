import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class Pay2SWebhookDto {
  @IsString()
  partnerCode: string;

  /** Giá trị gửi sang Pay2S là `topupCode` (vd. `COMVIA_TOPUP_...`), Pay2S echo lại ở đây */
  @IsString()
  orderId: string;

  @IsString()
  requestId: string;

  /** Pay2S thường gửi dạng string */
  @IsString()
  amount: string;

  @IsString()
  orderInfo: string;

  @IsString()
  orderType: string;

  @IsString()
  transId: string;

  @Type(() => Number)
  @IsNumber()
  resultCode: number;

  @IsString()
  message: string;

  @IsString()
  payType: string;

  @IsString()
  responseTime: string;

  @IsOptional()
  @IsString()
  extraData?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}