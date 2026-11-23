import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateGeneralConfigDto {
  /** Số ngày trước khi hết hạn subscription thì gửi mail nhắc owner (1-365). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  subscriptionExpiryReminderDays?: number;

  /**
   * Ngưỡng số dư ví (VND): sau một giao dịch mà ví còn <= ngưỡng này thì gửi mail
   * nhắc (tối đa 1 mail/ngày). 0 hoặc null = tắt.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  walletLowBalanceThreshold?: number | null;
}
