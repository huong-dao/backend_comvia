import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TopupStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopupPay2sDto } from './dto/create-topup-pay2s.dto';
import {
  createPay2sCollectionLink,
  Pay2sBankAccount,
} from '../integrations/pay2s/pay2s.util';

import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { Pay2SWebhookDto } from './dto/pay2s-webhook.dto';

@Injectable()
export class TopupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private generateCode(prefix: string) {
    return `${prefix}_${randomBytes(4).toString('hex')}`;
  }

  private async saveQrCodeImage(qrCodeContent: string, topupCode: string): Promise<string> {
    try {
      // 1. Xác định đường dẫn thư mục tuyệt đối
      const rootDir = process.cwd();
      const targetDir = path.join(rootDir, 'public', 'qrcodes', topupCode);

      // 2. Tạo thư mục nếu chưa có (recursive: true để tạo cả folder cha)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const fileName = `qr_code.png`;
      const filePath = path.join(targetDir, fileName);

      // 3. Xử lý lưu dữ liệu
      if (qrCodeContent.startsWith('data:image')) {
        /**
         * TRƯỜNG HỢP BASE64: Pay2S gửi sẵn hình ảnh mã hóa
         * Ví dụ: "data:image/png;base64,iVBORw0KG..."
         */
        // Tách bỏ phần tiền tố "data:image/png;base64," để lấy nội dung ảnh thuần túy
        const base64Data = qrCodeContent.split(';base64,').pop();

        if (!base64Data) {
          throw new Error('Dữ liệu Base64 không hợp lệ');
        }

        // Ghi dữ liệu nhị phân (Buffer) trực tiếp ra file
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        console.log(`[Success] Đã lưu ảnh QR từ Base64 cho: ${topupCode}`);
      } else {
        /**
         * TRƯỜNG HỢP TEXT: Pay2S gửi chuỗi văn bản (VietQR)
         * Ví dụ: "00020101021138580010A000000727..."
         */
        await QRCode.toFile(filePath, qrCodeContent, {
          width: 600,
          margin: 2,
          errorCorrectionLevel: 'M'
        });

        console.log(`[Success] Đã tạo ảnh QR từ Text cho: ${topupCode}`);
      }

      // 4. Trả về URL public dựa trên cấu hình Static Assets trong main.ts
      const baseUrl = this.configService.get('BACKEND_URL') || 'http://localhost:3000';

      // Theo cấu hình của bạn: prefix là '/public/'
      return `${baseUrl}/public/qrcodes/${topupCode}/${fileName}`;

    } catch (error) {
      // Log lỗi chi tiết để dễ dàng kiểm tra
      console.error(`[Error] Lỗi khi lưu ảnh QR cho ${topupCode}:`, error.message);
      return '';
    }
  }

  async createTopupWithPay2S(
    workspaceId: string,
    ownerUserId: string,
    dto: CreateTopupPay2sDto,
    moneyAccountId: string,
  ) {
    const vatRate = dto.vatRate ?? 10;
    const amountExcl = dto.amountExclVat;
    const amountIncl = amountExcl * (1 + vatRate / 100);
    const vatAmount = amountIncl - amountExcl;

    // Ensure wallet exists
    await this.prismaService.walletAccount.upsert({
      where: { ownerUserId },
      update: {},
      create: {
        ownerUserId,
        balance: 0,
        totalTopup: 0,
        totalSpent: 0,
        totalRefund: 0,
      },
    });

    // Tạo topup request trước
    const topup = await this.prismaService.topupRequest.create({
      data: {
        topupCode: this.generateCode('COMVIA_TOPUP').toUpperCase(),
        ownerUserId,
        workspaceId,
        amountExclVat: amountExcl,
        vatAmount,
        amountInclVat: amountIncl,
        paymentProvider: 'pay2s',
        paymentRef: '',
        qrCodeUrl: '',
        status: 'PENDING' satisfies TopupStatus,
      },
    });

    // Tạo collection request cho Pay2S
    try {
      // Lấy chi tiết tài khoản ngân hàng
      const moneyAccount = await this.prismaService.moneyAccount.findUnique({
        where: { id: moneyAccountId },
        select: {
          id: true,
          accountNumber: true,
          bankName: true,
          bankCode: true,
          pay2sBankId: true,
          isActive: true,
        },
      });

      if (!moneyAccount || !moneyAccount.isActive) {
        throw new BadRequestException('Tài khoản ngân hàng không hợp lệ hoặc không hoạt động');
      }

      if (!moneyAccount.pay2sBankId) {
        throw new BadRequestException(
          'Tài khoản ngân hàng không có ID ngân hàng Pay2S được cấu hình',
        );
      }

      // Lấy cấu hình Pay2S
      const pay2sConfig = this.configService.get('pay2s');
      if (!pay2sConfig) {
        throw new BadRequestException('Cấu hình Pay2S không được tìm thấy');
      }

      // Chuẩn bị tài khoản ngân hàng cho Pay2S
      const bankAccounts: Pay2sBankAccount[] = [
        {
          account_number: moneyAccount.accountNumber,
          bank_id: moneyAccount.pay2sBankId,
        },
      ];

      // Tạo liên kết thu tiền của Pay2S
      const pay2sResponse = await createPay2sCollectionLink({
        amount: Math.round(amountIncl), // Pay2S yêu cầu số tiền là số nguyên
        orderId: topup.topupCode,
        orderInfo:
          `${topup.topupCode.replace(/[^a-zA-Z0-9]/g, '').replace('TOPUP', '')}`.substring(
            0,
            32,
          ), // Giới hạn 10-32 ký tự, chỉ chấp nhậ ký tự chữ + số, không dấu gạch ngang hoặc đặc biêt.
        bankAccounts,
        redirectUrl: `${process.env.FRONTEND_URL || 'https://localhost:3000'}/topup/success`, // URL chuyển hướng sau khi thanh toán trên màn hình pay2s
        ipnUrl: `${process.env.BACKEND_URL || 'https://localhost:3001'}/api/v1/webhooks/pay2s`, // API nhận kết quả thanh toán của đối tác.
        requestType: 'pay2s',
        pay2sConfigData: {
          partner_code: pay2sConfig.partnerCode,
          partner_name: pay2sConfig.partnerName,
          api_key: pay2sConfig.apiKey,
          api_secret: pay2sConfig.apiSecret,
          api_url: pay2sConfig.apiUrl,
        },
      });

      // Handle Pay2S response format - could be { status: false, message: ... } or { resultCode: ..., ... }
      const responseStatus = pay2sResponse?.status ?? pay2sResponse?.resultCode;
      
      if (!pay2sResponse) {
        throw new BadRequestException(
          'Pay2S API error: No response from Pay2S service',
        );
      }

      // Check for error response (status: false or resultCode !== 0)
      if (responseStatus === false || (typeof responseStatus === 'number' && responseStatus !== 0)) {
        const errorMessage = pay2sResponse.message || pay2sResponse.resultMessage || 'Unknown error';
        throw new BadRequestException(
          `Pay2S API error: ${errorMessage}`,
        );
      }

      // Extract QR code from response
      let qrCodeUrl: string | undefined;
      const qrCode = pay2sResponse.qrList?.[0]?.qrCode;
      console.log('qrCode:', qrCode);
      if (!qrCode) {
        throw new BadRequestException('No QR code received from Pay2S');
      }

      if (qrCode) {
        qrCodeUrl = await this.saveQrCodeImage(qrCode, topup.topupCode);
  
        if (!qrCodeUrl) {
          throw new BadRequestException('Lỗi tạo ảnh QR code');
        }
      }

      // Cập nhật lại qrCodeUrl của topup request
      await this.prismaService.topupRequest.update({
        where: { id: topup.id },
        data: {
          qrCodeUrl: qrCodeUrl,
        },
      });

      return {
        ...topup,
        qrCodeUrl: qrCodeUrl,
        amountExclVat: amountExcl,
        vatAmount: vatAmount,
        amountInclVat: amountIncl,
      };
    } catch (error) {
      // Nếu tích hợp Pay2S thất bại, cập nhật trạng thái topup thành FAILED
      try {
        await this.prismaService.topupRequest.update({
          where: { id: topup.id },
          data: {
            status: 'FAILED' satisfies TopupStatus,
          },
        });
      } catch (updateError) {
        console.error('Lỗi khi cập nhật trạng thái topup thành FAILED:', updateError);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        `Failed to create Pay2S collection request: ${errorMessage}`,
      );
    }
  }

  async getTopupStatus(workspaceId: string, topupCode: string) {
    const topup = await this.prismaService.topupRequest.findFirst({
      where: {
        topupCode,
        workspaceId,
      },
      select: {
        id: true,
        topupCode: true,
        status: true,
        paidAt: true,
        amountExclVat: true,
        vatAmount: true,
        amountInclVat: true,
        qrCodeUrl: true,
      },
    });

    if (!topup) {
      throw new BadRequestException('Topup request not found');
    }

    return {
      id: topup.id,
      topupCode: topup.topupCode,
      status: topup.status,
      paidAt: topup.paidAt,
      amountExclVat: topup.amountExclVat,
      vatAmount: topup.vatAmount,
      amountInclVat: topup.amountInclVat,
    };
  }

  async getTopupHistory(workspaceId: string, query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const status = query.status;

    const where: any = {
      workspaceId,
    };

    if (status) {
      where.status = status;
    }

    const [topups, total] = await Promise.all([
      this.prismaService.topupRequest.findMany({
        where,
        select: {
          id: true,
          topupCode: true,
          status: true,
          paidAt: true,
          amountExclVat: true,
          vatAmount: true,
          amountInclVat: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prismaService.topupRequest.count({ where }),
    ]);

    return {
      data: topups.map((topup) => ({
        id: topup.id,
        topupCode: topup.topupCode,
        amountExclVat: topup.amountExclVat,
        amountInclVat: topup.amountInclVat,
        status: topup.status,
        paidAt: topup.paidAt,
        createdAt: topup.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async handlePay2sWebhook(dto: Pay2SWebhookDto) {
    // 1. Kiểm tra trạng thái giao dịch từ Pay2S
    if (dto.resultCode !== 0) {
      console.error(`Pay2S Webhook báo lỗi: ${dto.message}`);
      return { status: 'error', message: 'Transaction failed from provider' };
    }

    // 2. Tìm topup request trong DB
    const topup = await this.prismaService.topupRequest.findUnique({
      where: { id: dto.orderId },
    });

    if (!topup) throw new NotFoundException('Topup request không tồn tại');
    if (topup.status === 'PAID') return { status: 'success', message: 'Already processed' };

    const amountPaid = new Prisma.Decimal(dto.amount);

    // 3. Thực hiện Transaction
    return await this.prismaService.$transaction(async (tx) => {
      // 2. Cập nhật wallet account trực tiếp qua ownerUserId
      // Prisma cho phép update dựa trên trường có @unique (ownerUserId trong WalletAccount là @unique)
      await tx.walletAccount.update({
        where: { ownerUserId: topup.ownerUserId },
        data: {
          balance: { increment: new Prisma.Decimal(dto.amount) },
          totalTopup: { increment: new Prisma.Decimal(dto.amount) },
        },
      });

      // A. Cập nhật trạng thái TopupRequest
      await tx.topupRequest.update({
        where: { id: topup.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentRef: dto.transId,
        },
      });

      // B. Cập nhật số dư ví (WalletAccount)
      const wallet = await tx.walletAccount.findUnique({
        where: { ownerUserId: topup.ownerUserId },
      });
      
      if (!wallet) {
        throw new NotFoundException('Không tìm thấy ví của người dùng');
      }

      const balanceBefore = wallet.balance; // Số dư hiện tại trước khi nạp
      const balanceAfter = balanceBefore.add(amountPaid); // Số dư mới sau khi nạp

      await tx.walletAccount.update({
        where: { ownerUserId: topup.ownerUserId },
        data: {
          balance: balanceAfter,
          totalTopup: { increment: amountPaid },
        },
      });

      // C. Tạo WalletTransaction (Lịch sử biến động số dư)
      await tx.walletTransaction.create({
        data: {
          transactionCode: `TX_${topup.topupCode}`,
          ownerUserId: topup.ownerUserId,
          workspaceId: topup.workspaceId,
          type: 'TOPUP_CREDIT',
          amount: amountPaid,
          balanceBefore: 0, // Bạn có thể tính toán chính xác hơn nếu cần
          balanceAfter: 0, 
          sourceType: 'TOPUP_REQUEST',
          sourceId: topup.id,
          note: `Nạp tiền từ Pay2S: ${topup.topupCode}`,
        },
      });

      // D. Tạo Order (Đơn hàng)
      const order = await tx.order.create({
        data: {
          orderCode: `ORD_${topup.topupCode}`,
          workspaceId: topup.workspaceId,
          ownerUserId: topup.ownerUserId,
          totalAmountExclVat: topup.amountExclVat,
          totalVatAmount: topup.vatAmount,
          totalAmountInclVat: topup.amountInclVat,
          status: 'PAID',
          paidAt: new Date(),
          topupRequestId: topup.id,
          items: {
            create: {
              name: `Nạp tiền vào ví - Gói ${topup.topupCode}`,
              quantity: 1,
              unitPrice: topup.amountExclVat,
              vatRate: 10,
              vatAmount: topup.vatAmount,
              totalAmountInclVat: topup.amountInclVat,
            },
          },
        },
      });

      // E. Tạo Invoice (Hóa đơn)
      // Lấy thông tin billing từ Workspace làm snapshot
      const billing = await tx.workspaceBillingProfile.findUnique({
        where: { workspaceId: topup.workspaceId },
      });

      await tx.invoice.create({
        data: {
          invoiceCode: `INV_${order.orderCode}`,
          workspaceId: topup.workspaceId,
          orderId: order.id,
          billingType: billing?.billingType || 'INDIVIDUAL',
          billingSnapshotJson: (billing as any) || {},
          status: 'POSTED',
          items: {
            create: {
              name: `Nạp tiền vào ví`,
              quantity: 1,
              unitPrice: topup.amountExclVat,
              vatAmount: topup.vatAmount,
              totalAmountInclVat: topup.amountInclVat,
            },
          },
        },
      });

      return { status: 'success' };
    });
  }
}
