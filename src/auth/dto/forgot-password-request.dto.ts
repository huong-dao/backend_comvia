import { IsEmail } from 'class-validator';

export class ForgotPasswordRequestDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}
