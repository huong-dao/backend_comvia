import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { OtpResendDto } from './dto/otp-resend.dto';
import { OtpService } from './otp/otp.service';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ForgotPasswordResetDto } from './dto/forgot-password-reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { sha256Hex } from '../common/utils/sha256';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prismaService.user.findUnique({
      where: { email: registerDto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, SALT_ROUNDS);

    const user = await this.prismaService.user.create({
      data: {
        email: registerDto.email,
        fullName: registerDto.fullName,
        role: UserRole.USER,
        status: 'PENDING_VERIFICATION' satisfies UserStatus,
        credential: {
          create: {
            passwordHash,
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Create an owner wallet so later modules (topup / messaging) can debit/credit.
    await this.prismaService.walletAccount.create({
      data: {
        ownerUserId: user.id,
        balance: 0,
        totalTopup: 0,
        totalSpent: 0,
        totalRefund: 0,
      },
    });

    const otp = await this.otpService.createOtp(
      'EMAIL',
      user.email,
      'REGISTER',
    );

    return {
      user,
      ...otp,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prismaService.user.findUnique({
      where: { email: loginDto.email },
      include: { credential: true },
    });

    if (!user || !user.credential) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.credential.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản chưa được xác thực');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    return this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, credential: { select: { passwordHash: true } } },
    });

    if (!user?.credential) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.credential.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prismaService.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId },
        data: { passwordHash },
      });
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
    });

    return { message: 'Password changed successfully. Please sign in again.' };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    // only REGISTER flow is handled now
    if (dto.purpose !== 'REGISTER') {
      throw new UnauthorizedException('Mục đích OTP không được hỗ trợ');
    }

    const user = await this.otpService.verifyOtp(
      dto.targetType,
      dto.targetValue,
      dto.purpose as OtpPurpose,
      dto.otpCode,
    );

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }

  async resendOtp(dto: OtpResendDto) {
    return this.otpService.resendOtp(
      dto.targetType,
      dto.targetValue,
      dto.purpose,
    );
  }

  /** Return the same result whether or not the email belongs to an account. */
  async requestPasswordReset(dto: ForgotPasswordRequestDto) {
    const user = await this.prismaService.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true },
    });

    if (user) {
      // Deliberately do not expose OTP metadata (including demo OTP) from a
      // password-reset request; that would reveal whether the user exists.
      try {
        await this.otpService.resendOtp('EMAIL', user.email, 'FORGOT_PASSWORD');
      } catch (error) {
        // The endpoint must not disclose a delivery or cooldown difference to
        // callers. Operators still receive the failure in application logs.
        this.logger.error(
          `Password-reset OTP request failed for user ${user.id}: ${String(error)}`,
        );
      }
    }

    return {
      message:
        'Nếu email này thuộc một tài khoản, hướng dẫn đặt lại mật khẩu đã được gửi.',
    };
  }

  async resetPassword(dto: ForgotPasswordResetDto) {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const now = new Date();

    const result = await this.prismaService.$transaction(async (tx) => {
      const otpRequest = await tx.otpRequest.findFirst({
        where: {
          targetType: 'EMAIL',
          targetValue: dto.email,
          purpose: 'FORGOT_PASSWORD',
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!otpRequest) {
        return { error: 'INVALID_OTP' as const };
      }

      if (otpRequest.expiredAt.getTime() < now.getTime()) {
        await tx.otpRequest.update({
          where: { id: otpRequest.id },
          data: { status: 'EXPIRED' },
        });
        return { error: 'EXPIRED_OTP' as const };
      }

      if (sha256Hex(dto.otpCode) !== otpRequest.otpCodeHash) {
        const nextAttempt = otpRequest.attemptCount + 1;
        await tx.otpRequest.update({
          where: { id: otpRequest.id },
          data: {
            attemptCount: nextAttempt,
            status: nextAttempt >= 5 ? 'LOCKED' : 'ACTIVE',
          },
        });
        return { error: 'INVALID_OTP' as const };
      }

      // Conditional update makes concurrent resets single-use: only one
      // transaction can turn this active, unexpired OTP into USED.
      const consumed = await tx.otpRequest.updateMany({
        where: {
          id: otpRequest.id,
          status: 'ACTIVE',
          expiredAt: { gte: now },
        },
        data: { status: 'USED', usedAt: now },
      });
      if (consumed.count !== 1) {
        return { error: 'USED_OTP' as const };
      }

      const user = await tx.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (!user) {
        return { error: 'INVALID_OTP' as const };
      }

      await tx.userCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, passwordHash },
        update: { passwordHash },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });
      return { success: true as const };
    });

    if ('error' in result) {
      throw new UnauthorizedException('OTP không hợp lệ hoặc đã hết hạn');
    }

    return { message: 'Mật khẩu đã được đặt lại thành công.' };
  }
}
