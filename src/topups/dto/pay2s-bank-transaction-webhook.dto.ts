import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

export class Pay2sBankTransactionDto {
  @IsNumber()
  id: number;

  @IsString()
  gateway: string;

  @IsString()
  transactionDate: string;

  @IsString()
  transactionNumber: string;

  @IsString()
  accountNumber: string;

  /** Nội dung chuyển khoản — khớp với `orderInfo` đã gửi lúc tạo Collection Link */
  @IsString()
  content: string;

  @IsIn(['IN', 'OUT'])
  transferType: 'IN' | 'OUT';

  @IsNumber()
  transferAmount: number;

  @IsString()
  checksum: string;
}

export class Pay2sBankTransactionWebhookDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Pay2sBankTransactionDto)
  transactions: Pay2sBankTransactionDto[];
}
