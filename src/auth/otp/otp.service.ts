import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OtpPurpose,
  OtpStatus,
  OtpTargetType,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256Hex } from '../../common/utils/sha256';
import { EmailService } from '../../integrations/email/email.service';

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private get demoMode(): boolean {
    return isTruthy(this.configService.get('DEMO_MODE'));
  }

  private get ttlSeconds(): number {
    const v = Number(this.configService.get('OTP_TTL_SECONDS'));
    return Number.isFinite(v) && v > 0 ? v : 300;
  }

  private get resendCooldownSeconds(): number {
    const configured = Number(
      this.configService.get('OTP_RESEND_COOLDOWN_SECONDS'),
    );
    if (Number.isFinite(configured) && configured >= 0) {
      return configured;
    }

    return this.ttlSeconds;
  }

  private get maxVerifyAttempts(): number {
    const v = Number(this.configService.get('OTP_MAX_VERIFY_ATTEMPTS'));
    return Number.isFinite(v) && v > 0 ? v : 5;
  }

  private generateOtpCode(): string {
    const n = Math.floor(Math.random() * 1_000_000);
    return n.toString().padStart(6, '0');
  }

  private formatCooldownMessage(remainingSeconds: number): string {
    if (remainingSeconds >= 60) {
      const minutes = Math.ceil(remainingSeconds / 60);
      return `OTP resend cooldown: wait ${minutes} minute(s)`;
    }

    return `OTP resend cooldown: wait ${Math.ceil(remainingSeconds)}s`;
  }

  private async assertResendAllowed(
    targetType: OtpTargetType,
    targetValue: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const last = await this.prismaService.otpRequest.findFirst({
      where: { targetType, targetValue, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!last) {
      return;
    }

    const elapsedSeconds = (Date.now() - last.createdAt.getTime()) / 1000;
    if (elapsedSeconds < this.resendCooldownSeconds) {
      throw new BadRequestException(
        this.formatCooldownMessage(
          this.resendCooldownSeconds - elapsedSeconds,
        ),
      );
    }
  }

  private async sendOtpEmailIfNeeded(
    targetType: OtpTargetType,
    targetValue: string,
    otpCode: string,
  ): Promise<void> {
    if (targetType !== 'EMAIL' || this.demoMode) {
      return;
    }

    await this.emailService.sendOtpVerificationEmail({
      to: targetValue,
      otpCode,
      expiresInMinutes: Math.ceil(this.ttlSeconds / 60),
    });
  }

  async createOtp(
    targetType: OtpTargetType,
    targetValue: string,
    purpose: OtpPurpose,
  ) {
    // In demo/production, we treat the latest OTP as active and mark old ones expired.
    await this.prismaService.otpRequest.updateMany({
      where: {
        targetType,
        targetValue,
        purpose,
        status: 'ACTIVE',
      },
      data: { status: 'EXPIRED' as OtpStatus },
    });

    const otpCode = this.generateOtpCode();
    const otpCodeHash = sha256Hex(otpCode);
    const expiredAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const otpRequest = await this.prismaService.otpRequest.create({
      data: {
        targetType,
        targetValue,
        purpose,
        otpCodeHash,
        expiredAt,
        attemptCount: 0,
        status: 'ACTIVE',
      },
      select: { id: true, expiredAt: true },
    });

    await this.sendOtpEmailIfNeeded(targetType, targetValue, otpCode);

    if (this.demoMode) {
      return {
        otpRequestId: otpRequest.id,
        expiredAt: otpRequest.expiredAt,
        demoOtpCode: otpCode,
      };
    }

    return { otpRequestId: otpRequest.id, expiredAt: otpRequest.expiredAt };
  }

  async resendOtp(
    targetType: OtpTargetType,
    targetValue: string,
    purpose: OtpPurpose,
  ) {
    await this.assertResendAllowed(targetType, targetValue, purpose);

    await this.prismaService.otpRequest.updateMany({
      where: {
        targetType,
        targetValue,
        purpose,
        status: 'ACTIVE',
      },
      data: { status: 'EXPIRED' as OtpStatus },
    });

    return this.createOtp(targetType, targetValue, purpose);
  }

  async verifyOtp(
    targetType: OtpTargetType,
    targetValue: string,
    purpose: OtpPurpose,
    otpCode: string,
  ) {
    const otpRequest = await this.prismaService.otpRequest.findFirst({
      where: { targetType, targetValue, purpose, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRequest) {
      throw new BadRequestException('OTP not found or expired');
    }

    if (otpRequest.expiredAt.getTime() < Date.now()) {
      await this.prismaService.otpRequest.update({
        where: { id: otpRequest.id },
        data: { status: 'EXPIRED' as OtpStatus },
      });
      throw new BadRequestException('OTP expired');
    }

    const isLocked = otpRequest.status === 'LOCKED';
    if (isLocked) {
      throw new BadRequestException('OTP verification temporarily locked');
    }

    const otpCodeHash = sha256Hex(otpCode);

    if (otpCodeHash !== otpRequest.otpCodeHash) {
      const nextAttempt = otpRequest.attemptCount + 1;
      const shouldLock = nextAttempt >= this.maxVerifyAttempts;

      await this.prismaService.otpRequest.update({
        where: { id: otpRequest.id },
        data: {
          attemptCount: nextAttempt,
          status: shouldLock ? ('LOCKED' as OtpStatus) : otpRequest.status,
        },
      });

      throw new UnauthorizedException(
        shouldLock ? 'Too many attempts' : 'Invalid OTP',
      );
    }

    // OTP correct => mark used and activate user (for REGISTER flow)
    const now = new Date();
    await this.prismaService.otpRequest.update({
      where: { id: otpRequest.id },
      data: { usedAt: now, status: 'USED' as OtpStatus },
    });

    if (purpose === 'REGISTER') {
      await this.prismaService.user.update({
        where: { email: targetValue },
        data: { status: 'ACTIVE' as UserStatus },
      });
    }

    const user = await this.prismaService.user.findUnique({
      where: { email: targetValue },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found for OTP');
    }

    return user;
  }
}
