import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';

describe('OtpService.createOtp email failure handling', () => {
  const prisma = {
    otpRequest: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const emailService = {
    sendOtpVerificationEmail: jest.fn(),
    sendPasswordResetOtpEmail: jest.fn(),
  };
  const config = { get: jest.fn() };
  let service: OtpService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.otpRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.otpRequest.create.mockResolvedValue({
      id: 'otp-1',
      expiredAt: new Date(),
    });
    emailService.sendOtpVerificationEmail.mockRejectedValue(
      new Error('smtp down'),
    );
    service = new OtpService(
      prisma as never,
      config as unknown as ConfigService,
      emailService as never,
    );
  });

  it('throws when email fails and failure is not tolerated', async () => {
    await expect(
      service.createOtp('EMAIL', 'a@example.com', 'REGISTER'),
    ).rejects.toThrow('smtp down');
  });

  it('still returns the OTP request when email failure is tolerated', async () => {
    const result = await service.createOtp(
      'EMAIL',
      'a@example.com',
      'REGISTER',
      { tolerateEmailFailure: true },
    );

    expect(result).toMatchObject({ otpRequestId: 'otp-1', emailSent: false });
  });
});
