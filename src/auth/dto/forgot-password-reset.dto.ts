import { IsEmail, IsString, MinLength } from 'class-validator';

export class ForgotPasswordResetDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @MinLength(4, { message: 'Mã OTP phải có ít nhất 4 ký tự' })
  otpCode!: string;

  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  password!: string;
}
