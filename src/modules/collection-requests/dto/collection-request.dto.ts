import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDecimal,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CollectionRequestType {
  TOPUP = 'TOPUP',
  INVOICE = 'INVOICE',
}

export enum CollectionRequestStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELED = 'CANCELED',
  FAILED = 'FAILED',
}

export class CreateCollectionRequestDto {
  @IsEnum(CollectionRequestType)
  type: CollectionRequestType;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsUUID()
  moneyAccountId: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  topupRequestId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  invoiceIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryCollectionRequestDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsEnum(CollectionRequestStatus)
  status?: CollectionRequestStatus;

  @IsOptional()
  @IsEnum(CollectionRequestType)
  type?: CollectionRequestType;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

export class CollectionRequestResponseDto {
  id: string;
  code: string;
  type: string; // Changed from enum to string
  status: string; // Changed from enum to string
  amount: number | any; // Changed to handle Decimal
  qrCodeUrl?: string | null; // Changed to handle null
  transId?: string | null; // Changed to handle null
  paidAt?: Date | null; // Changed to handle null
  moneyAccountId: string;
  workspaceId: string;
  orderId?: string | null; // Changed to handle null
  topupRequestId?: string | null; // Changed to handle null
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;

  moneyAccount: {
    id: string;
    accountNumber: string;
    bankName?: string | null; // Changed to handle null
    bankCode?: string | null; // Changed to handle null
  };

  workspace: {
    id: string;
    name: string;
  };

  creator: {
    id: string;
    email: string;
    fullName?: string | null; // Changed to handle null
  };

  mappings?: any; // Changed to any to avoid type issues
}
