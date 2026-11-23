import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { createPay2sCollectionLink, Pay2sBankAccount } from './pay2s.util';

type Pay2sAppConfig = {
  partnerCode: string;
  partnerName: string;
  apiKey: string;
  apiSecret: string;
  apiUrl: string;
};

/**
 * Tạo Collection Link + ảnh QR của Pay2S. Dùng chung cho nạp ví (topup) và mua
 * subscription: tách ra để hai luồng không nhân đôi logic gọi Pay2S.
 */
@Injectable()
export class Pay2sCollectionService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * @param code      mã đơn gửi sang Pay2S làm orderId (topupCode / purchaseCode)
   * @param orderInfo nội dung chuyển khoản (10-32 ký tự chữ + số)
   * @returns URL ảnh QR đã lưu
   */
  async createCollectionQr(params: {
    code: string;
    orderInfo: string;
    amountInclVat: number;
    moneyAccountId: string;
    redirectPath: string;
  }): Promise<string> {
    const moneyAccount = await this.prismaService.moneyAccount.findUnique({
      where: { id: params.moneyAccountId },
      select: {
        accountNumber: true,
        pay2sBankId: true,
        isActive: true,
      },
    });

    if (!moneyAccount || !moneyAccount.isActive) {
      throw new BadRequestException(
        'Tài khoản ngân hàng không hợp lệ hoặc không hoạt động',
      );
    }
    if (!moneyAccount.pay2sBankId) {
      throw new BadRequestException(
        'Tài khoản ngân hàng không có ID ngân hàng Pay2S được cấu hình',
      );
    }

    const pay2sConfig = this.configService.get<Pay2sAppConfig>('pay2s');
    if (!pay2sConfig) {
      throw new BadRequestException('Cấu hình Pay2S không được tìm thấy');
    }

    const bankAccounts: Pay2sBankAccount[] = [
      {
        account_number: moneyAccount.accountNumber,
        bank_id: moneyAccount.pay2sBankId,
      },
    ];

    const pay2sResponse = await createPay2sCollectionLink({
      amount: Math.round(params.amountInclVat), // Pay2S yêu cầu số nguyên
      orderId: params.code,
      orderInfo: params.orderInfo,
      bankAccounts,
      redirectUrl: `${process.env.FRONTEND_URL}${params.redirectPath}`,
      ipnUrl: `${process.env.BACKEND_URL}/api/v1/webhooks/pay2s`,
      requestType: 'pay2s',
      pay2sConfigData: {
        partner_code: pay2sConfig.partnerCode,
        partner_name: pay2sConfig.partnerName,
        api_key: pay2sConfig.apiKey,
        api_secret: pay2sConfig.apiSecret,
        api_url: pay2sConfig.apiUrl,
      },
    });

    if (!pay2sResponse) {
      throw new BadRequestException(
        'Pay2S API error: No response from Pay2S service',
      );
    }

    // Lỗi có thể là { status: false } hoặc { resultCode !== 0 }.
    const responseStatus = pay2sResponse.status ?? pay2sResponse.resultCode;
    if (
      responseStatus === false ||
      (typeof responseStatus === 'number' && responseStatus !== 0)
    ) {
      throw new BadRequestException(
        `Pay2S API error: ${
          pay2sResponse.message ||
          pay2sResponse.resultMessage ||
          'Unknown error'
        }`,
      );
    }

    const qrCode = pay2sResponse.qrList?.[0]?.qrCode;
    if (!qrCode) {
      throw new BadRequestException('No QR code received from Pay2S');
    }

    const qrCodeUrl = await this.saveQrCodeImage(qrCode, params.code);
    if (!qrCodeUrl) {
      throw new BadRequestException('Lỗi tạo ảnh QR code');
    }
    return qrCodeUrl;
  }

  async saveQrCodeImage(qrCodeContent: string, code: string): Promise<string> {
    try {
      const targetDir = path.join(process.cwd(), 'public', 'qrcodes', code);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const fileName = 'qr_code.png';
      const filePath = path.join(targetDir, fileName);

      if (qrCodeContent.startsWith('data:image')) {
        // Pay2S gửi sẵn ảnh base64: "data:image/png;base64,..."
        const base64Data = qrCodeContent.split(';base64,').pop();
        if (!base64Data) {
          throw new Error('Dữ liệu Base64 không hợp lệ');
        }
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      } else {
        // Pay2S gửi chuỗi VietQR dạng text.
        await QRCode.toFile(filePath, qrCodeContent, {
          width: 600,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
      }

      const baseUrl =
        this.configService.get<string>('BACKEND_URL') ||
        'http://localhost:3000';
      return `${baseUrl}/public/qrcodes/${code}/${fileName}`;
    } catch (error) {
      console.error(
        `[Error] Lỗi khi lưu ảnh QR cho ${code}:`,
        error instanceof Error ? error.message : error,
      );
      return '';
    }
  }
}
