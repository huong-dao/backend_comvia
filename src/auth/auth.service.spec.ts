jest.mock('./otp/otp.service', () => ({
  OtpService: class OtpService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { sha256Hex } from '../common/utils/sha256';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';

describe('AuthService password reset', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn() };
  const otpService = { resendOtp: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: OtpService, useValue: otpService },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('returns the same response whether the requested email exists or not', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'exists@example.com',
    });
    otpService.resendOtp.mockResolvedValue({ demoOtpCode: '123456' });

    const existing = await service.requestPasswordReset({
      email: 'exists@example.com',
    });

    prisma.user.findUnique.mockResolvedValueOnce(null);
    const missing = await service.requestPasswordReset({
      email: 'missing@example.com',
    });

    expect(existing).toEqual(missing);
    expect(otpService.resendOtp).toHaveBeenCalledWith(
      'EMAIL',
      'exists@example.com',
      'FORGOT_PASSWORD',
    );
  });

  it('consumes a valid OTP, changes the password, and revokes existing tokens', async () => {
    const tx = {
      otpRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'otp-1',
          otpCodeHash: sha256Hex('123456'),
          expiredAt: new Date(Date.now() + 60_000),
          attemptCount: 0,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn(),
      },
      userCredential: { upsert: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      service.resetPassword({
        email: 'user@example.com',
        otpCode: '123456',
        password: 'new-secure-password',
      }),
    ).resolves.toEqual({ message: 'Mật khẩu đã được đặt lại thành công.' });

    expect(tx.otpRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'USED' }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    const passwordHash =
      tx.userCredential.upsert.mock.calls[0][0].update.passwordHash;
    await expect(
      bcrypt.compare('new-secure-password', passwordHash),
    ).resolves.toBe(true);
  });

  it('rejects an expired OTP and never changes the password', async () => {
    const tx = {
      otpRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'otp-expired',
          otpCodeHash: sha256Hex('123456'),
          expiredAt: new Date(Date.now() - 1),
          attemptCount: 0,
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn(), update: jest.fn() },
      userCredential: { upsert: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      service.resetPassword({
        email: 'user@example.com',
        otpCode: '123456',
        password: 'new-secure-password',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(tx.otpRequest.update).toHaveBeenCalledWith({
      where: { id: 'otp-expired' },
      data: { status: 'EXPIRED' },
    });
    expect(tx.userCredential.upsert).not.toHaveBeenCalled();
  });
});
