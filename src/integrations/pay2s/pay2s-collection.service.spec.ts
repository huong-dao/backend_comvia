import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Pay2sCollectionService } from './pay2s-collection.service';
import {
  PAY2S_UNAVAILABLE_CODE,
  PAY2S_UNAVAILABLE_MESSAGE,
  Pay2sRequestError,
} from './pay2s.errors';
import { createPay2sCollectionLink } from './pay2s.util';

jest.mock('./pay2s.util', () => ({
  createPay2sCollectionLink: jest.fn(),
}));

const createLink = createPay2sCollectionLink as jest.Mock;

const params = {
  code: 'COMVIA_SUB_AB12CD34',
  orderInfo: 'COMVIASUBAB12CD34',
  amountInclVat: 2200000,
  moneyAccountId: 'MA1',
  redirectPath: '/subscription/success',
};

function buildService(
  moneyAccount: Record<string, unknown> | null = {
    accountNumber: '123',
    pay2sBankId: 'ACB',
    isActive: true,
  },
) {
  const prisma = {
    moneyAccount: { findUnique: jest.fn().mockResolvedValue(moneyAccount) },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: string) =>
      key === 'pay2s'
        ? {
            partnerCode: 'P',
            partnerName: 'Comvia',
            apiKey: 'K',
            apiSecret: 'S',
            apiUrl: 'https://pay2s.example',
          }
        : undefined,
    ),
  } as unknown as ConfigService;
  const service = new Pay2sCollectionService(prisma, config);
  jest
    .spyOn(service, 'saveQrCodeImage')
    .mockResolvedValue('http://be/public/qrcodes/x/qr_code.png');
  return service;
}

async function catchBadRequest(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      code?: string;
      message: string;
    };
  }
  throw new Error('expected rejection');
}

describe('Pay2sCollectionService.createCollectionQr', () => {
  beforeEach(() => {
    createLink.mockReset();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trả URL ảnh QR khi Pay2S thành công', async () => {
    createLink.mockResolvedValue({
      resultCode: 0,
      qrList: [{ qrCode: 'abc' }],
    });

    await expect(buildService().createCollectionQr(params)).resolves.toBe(
      'http://be/public/qrcodes/x/qr_code.png',
    );
  });

  it('Pay2sRequestError (timeout/network/http...) → PAY2S_UNAVAILABLE', async () => {
    createLink.mockRejectedValue(
      new Pay2sRequestError('http', 'Pay2S trả HTTP 502', 502, 'secret body'),
    );

    const body = await catchBadRequest(
      buildService().createCollectionQr(params),
    );

    expect(body).toEqual({
      code: PAY2S_UNAVAILABLE_CODE,
      message: PAY2S_UNAVAILABLE_MESSAGE,
    });
  });

  it('Pay2S báo lỗi (resultCode != 0) → PAY2S_UNAVAILABLE, không lộ thông điệp của Pay2S, có log', async () => {
    createLink.mockResolvedValue({
      resultCode: 11,
      resultMessage: 'Tài khoản đối tác bị khóa',
    });

    const body = await catchBadRequest(
      buildService().createCollectionQr(params),
    );

    expect(body.code).toBe(PAY2S_UNAVAILABLE_CODE);
    expect(JSON.stringify(body)).not.toContain('đối tác');
    const logged = String(
      ((Logger.prototype.error as jest.Mock).mock.calls as unknown[][])[0][0],
    );
    expect(logged).toContain('orderId=COMVIA_SUB_AB12CD34');
    expect(logged).toContain('Tài khoản đối tác bị khóa');
  });

  it('Pay2S báo lỗi dạng { status: false } → PAY2S_UNAVAILABLE', async () => {
    createLink.mockResolvedValue({ status: false, message: 'Invalid' });

    const body = await catchBadRequest(
      buildService().createCollectionQr(params),
    );

    expect(body.code).toBe(PAY2S_UNAVAILABLE_CODE);
  });

  it('không có mã QR → PAY2S_UNAVAILABLE', async () => {
    createLink.mockResolvedValue({ resultCode: 0, qrList: [] });

    const body = await catchBadRequest(
      buildService().createCollectionQr(params),
    );

    expect(body.code).toBe(PAY2S_UNAVAILABLE_CODE);
  });

  it('lưu ảnh QR thất bại → PAY2S_UNAVAILABLE', async () => {
    createLink.mockResolvedValue({
      resultCode: 0,
      qrList: [{ qrCode: 'abc' }],
    });
    const service = buildService();
    jest.spyOn(service, 'saveQrCodeImage').mockResolvedValue('');

    const body = await catchBadRequest(service.createCollectionQr(params));

    expect(body.code).toBe(PAY2S_UNAVAILABLE_CODE);
  });

  it('tài khoản ngân hàng không hợp lệ → giữ thông điệp riêng, không gọi Pay2S', async () => {
    const body = await catchBadRequest(
      buildService(null).createCollectionQr(params),
    );

    expect(body.message).toBe(
      'Tài khoản ngân hàng không hợp lệ hoặc không hoạt động',
    );
    expect(createLink).not.toHaveBeenCalled();
  });

  it('lỗi không phải Pay2sRequestError → ném lại nguyên vẹn', async () => {
    const boom = new Error('unexpected');
    createLink.mockRejectedValue(boom);

    await expect(buildService().createCollectionQr(params)).rejects.toBe(boom);
  });
});
