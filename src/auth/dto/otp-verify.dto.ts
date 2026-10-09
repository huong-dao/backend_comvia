import { IsEnum, IsString, MinLength } from 'class-validator';
import { OtpPurpose, OtpTargetType } from '@prisma/client';

export class OtpVerifyDto {
  @IsEnum(OtpTargetType, { message: 'Loại đích OTP không hợp lệ' })
  targetType!: OtpTargetType;

  @IsString({ message: 'Giá trị đích phải là chuỗi ký tự' })
  @MinLength(3, { message: 'Giá trị đích phải có ít nhất 3 ký tự' })
  targetValue!: string;

  @IsEnum(OtpPurpose, { message: 'Mục đích OTP không hợp lệ' })
  purpose!: OtpPurpose;

  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @MinLength(4, { message: 'Mã OTP phải có ít nhất 4 ký tự' })
  otpCode!: string;
}
