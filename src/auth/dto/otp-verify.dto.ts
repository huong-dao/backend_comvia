import { IsEnum, IsString, MinLength } from 'class-validator';
import { OtpPurpose, OtpTargetType } from '@prisma/client';

export class OtpVerifyDto {
  @IsEnum(OtpTargetType)
  targetType!: OtpTargetType;

  @IsString()
  @MinLength(3)
  targetValue!: string;

  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @IsString()
  @MinLength(4)
  otpCode!: string;
}
