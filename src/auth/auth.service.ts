import {
  ConflictException,
  Injectable,
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

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
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
      throw new ConflictException('Email is already registered');
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
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.credential.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not verified');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
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

  async verifyOtp(dto: OtpVerifyDto) {
    // only REGISTER flow is handled now
    if (dto.purpose !== 'REGISTER') {
      throw new UnauthorizedException('Unsupported OTP purpose');
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
}
