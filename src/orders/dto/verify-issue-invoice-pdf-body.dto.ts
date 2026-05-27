import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyIssueInvoicePdfBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
