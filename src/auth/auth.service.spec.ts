jest.mock('./otp/otp.service', () => ({
  OtpService: class OtpService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { sha256Hex } from '../common/utils/sha256';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
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
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
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

describe('AuthService change password', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: OtpService, useValue: { resendOtp: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('changes the password and revokes all active access tokens', async () => {
    const oldPasswordHash = await bcrypt.hash('old-password', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'staff-1',
      credential: { passwordHash: oldPasswordHash },
    });
    const tx = {
      userCredential: { update: jest.fn() },
      user: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(
      service.changePassword('staff-1', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    ).resolves.toEqual({
      message: 'Password changed successfully. Please sign in again.',
    });

    const passwordHash =
      tx.userCredential.update.mock.calls[0][0].data.passwordHash;
    await expect(bcrypt.compare('new-password', passwordHash)).resolves.toBe(
      true,
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { tokenVersion: { increment: 1 } },
    });
  });

  it('rejects an incorrect current password without updating credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'staff-1',
      credential: { passwordHash: await bcrypt.hash('old-password', 10) },
    });

    await expect(
      service.changePassword('staff-1', {
        currentPassword: 'incorrect-password',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function lastUpdatedRefreshTokenId(
  updateMock: jest.Mock<
    unknown,
    [{ where: { id: string }; data: { currentRefreshTokenId: unknown } }]
  >,
): unknown {
  return updateMock.mock.calls[0][0].data.currentRefreshTokenId;
}

describe('AuthService login / refresh / logout (ISSUE-003 sliding session)', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  const jwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const configService = { get: jest.fn() };
  const auditLogService = { write: jest.fn() };

  const activeUser = {
    id: 'user-1',
    email: 'user@example.com',
    fullName: 'Demo User',
    role: 'USER',
    status: 'ACTIVE',
    tokenVersion: 0,
    credential: { passwordHash: '' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: OtpService, useValue: {} },
        { provide: ConfigService, useValue: configService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('login issues an access token and a rotated refresh token, persisting its jti', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      credential: { passwordHash: await bcrypt.hash('secret123', 10) },
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access.jwt')
      .mockResolvedValueOnce('refresh.jwt');

    const result = await service.login({
      email: 'user@example.com',
      password: 'secret123',
    });

    expect(result).toEqual({
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      tokenType: 'Bearer',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Demo User',
        role: 'USER',
      },
    });
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sub: 'user-1', type: 'access' }),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sub: 'user-1', type: 'refresh' }),
      { expiresIn: '30d' },
    );
    const persistedJti = lastUpdatedRefreshTokenId(prisma.user.update);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentRefreshTokenId: persistedJti },
    });
    expect(typeof persistedJti).toBe('string');
  });

  it('refresh rotates the refresh token when the jti matches the stored one', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      type: 'refresh',
      jti: 'jti-current',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      currentRefreshTokenId: 'jti-current',
    });
    jwtService.signAsync
      .mockResolvedValueOnce('new.access.jwt')
      .mockResolvedValueOnce('new.refresh.jwt');

    const result = await service.refresh({ refreshToken: 'old.refresh.jwt' });

    expect(result).toEqual({
      accessToken: 'new.access.jwt',
      refreshToken: 'new.refresh.jwt',
      tokenType: 'Bearer',
    });
    const rotatedJti = lastUpdatedRefreshTokenId(prisma.user.update);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentRefreshTokenId: rotatedJti },
    });
    expect(typeof rotatedJti).toBe('string');
    expect(auditLogService.write).not.toHaveBeenCalled();
  });

  it('refresh rejects and revokes the chain when the jti was already rotated away', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      type: 'refresh',
      jti: 'jti-stale',
      tokenVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      currentRefreshTokenId: 'jti-current',
    });

    await expect(
      service.refresh({ refreshToken: 'stale.refresh.jwt' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentRefreshTokenId: null },
    });
    expect(auditLogService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        action: 'auth.refresh_token_reused',
      }),
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('refresh rejects an access token presented in place of a refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      type: 'access',
      tokenVersion: 0,
    });

    await expect(
      service.refresh({ refreshToken: 'access.jwt' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('logout clears the active refresh chain', async () => {
    await service.logout('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentRefreshTokenId: null },
    });
  });
});
