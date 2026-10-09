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
  verifyPay2sSignature,
} from '../integrations/pay2s/pay2s.util';

import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Pay2SWebhookDto } from './dto/pay2s-webhook.dto';
import {
  Pay2sBankTransactionDto,
  Pay2sBankTransactionWebhookDto,
} from './dto/pay2s-bank-transaction-webhook.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';

type TopupRequestRecord = {
  id: string;
  topupCode: string;
  ownerUserId: string;
  workspaceId: string;
  status: TopupStatus;
  amountExclVat: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  amountInclVat: Prisma.Decimal;
};

@Injectable()
export class TopupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private generateCode(prefix: string) {
    return `${prefix}_${randomBytes(4).toString('hex')}`;
  }

  private async saveQrCodeImage(
    qrCodeContent: string,
    topupCode: string,
  ): Promise<string> {
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
          errorCorrectionLevel: 'M',
        });

        console.log(`[Success] Đã tạo ảnh QR từ Text cho: ${topupCode}`);
      }

      // 4. Trả về URL public dựa trên cấu hình Static Assets trong main.ts
      const baseUrl =
        this.configService.get('BACKEND_URL') || 'http://localhost:3000';

      // Theo cấu hình của bạn: prefix là '/public/'
      return `${baseUrl}/public/qrcodes/${topupCode}/${fileName}`;
    } catch (error) {
      // Log lỗi chi tiết để dễ dàng kiểm tra
      console.error(
        `[Error] Lỗi khi lưu ảnh QR cho ${topupCode}:`,
        error.message,
      );
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
    // Tính vatAmount trước bằng round() rồi cộng dồn, tránh lỗi làm tròn dấu
    // phẩy động của JS khi nhân trực tiếp (vd 1500000 * 1.1 = 1650000.0000000002).
    const vatAmount = Math.round((amountExcl * vatRate) / 100);
    const amountIncl = amountExcl + vatAmount;

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
        throw new BadRequestException(
          'Tài khoản ngân hàng không hợp lệ hoặc không hoạt động',
        );
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
        redirectUrl: `${process.env.FRONTEND_URL}/topup/success`, // URL chuyển hướng sau khi thanh toán trên màn hình pay2s
        ipnUrl: `${process.env.BACKEND_URL}/api/v1/webhooks/pay2s`, // API nhận kết quả thanh toán của đối tác.
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
      if (
        responseStatus === false ||
        (typeof responseStatus === 'number' && responseStatus !== 0)
      ) {
        const errorMessage =
          pay2sResponse.message ||
          pay2sResponse.resultMessage ||
          'Unknown error';
        throw new BadRequestException(`Pay2S API error: ${errorMessage}`);
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
        console.error(
          'Lỗi khi cập nhật trạng thái topup thành FAILED:',
          updateError,
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
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
      // Prisma.Decimal.toJSON() trả về string — ép về number để đúng hợp đồng
      // với FE (TopupStatusResponse khai báo amount* là number).
      amountExclVat: Number(topup.amountExclVat),
      vatAmount: Number(topup.vatAmount),
      amountInclVat: Number(topup.amountInclVat),
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
        amountExclVat: Number(topup.amountExclVat),
        vatAmount: Number(topup.vatAmount),
        amountInclVat: Number(topup.amountInclVat),
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

  /**
   * Nhánh 1: "Instant Payment Notification" gắn với Collection Link —
   * body phẳng (orderId/resultCode/m2signature). Xem
   * https://docs.pay2s.vn/api/instant-payment-notification.html
   */
  async handlePay2sWebhook(rawBody: Record<string, unknown>) {
    const dto = plainToInstance(Pay2SWebhookDto, rawBody);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length > 0) {
      console.error('Pay2S IPN: payload không hợp lệ', errors);
      return { success: false, message: 'Invalid payload' };
    }

    const pay2sConfig = this.configService.get('pay2s');
    if (!pay2sConfig) {
      console.error('Pay2S IPN: cấu hình Pay2S không được tìm thấy');
      return { success: false, message: 'Pay2S config not found' };
    }

    // 0. Xác thực chữ ký m2signature — bắt buộc, vì route này public, không
    //    có bước này ai cũng có thể giả webhook để tự cộng tiền vào ví.
    // Công thức theo tài liệu Pay2S: nối accessKey + toàn bộ field của IPN
    // (trừ m2signature), sort theo tên key, rồi HMAC-SHA256 bằng apiSecret.
    const { m2signature, ...signedFields } = dto;
    const signatureParams: Record<string, string> = {
      accessKey: pay2sConfig.apiKey,
      amount: signedFields.amount,
      extraData: signedFields.extraData ?? '',
      message: signedFields.message,
      orderId: signedFields.orderId,
      orderInfo: signedFields.orderInfo,
      orderType: signedFields.orderType,
      partnerCode: signedFields.partnerCode,
      payType: signedFields.payType,
      requestId: signedFields.requestId,
      responseTime: signedFields.responseTime,
      resultCode: String(signedFields.resultCode),
      transId: signedFields.transId,
    };

    if (
      !m2signature ||
      !verifyPay2sSignature(signatureParams, m2signature, pay2sConfig.apiSecret)
    ) {
      console.error(
        `Pay2S IPN: chữ ký không hợp lệ cho orderId=${dto.orderId}`,
      );
      return { success: false, message: 'Invalid signature' };
    }

    // 1. Kiểm tra trạng thái giao dịch từ Pay2S
    if (dto.resultCode !== 0) {
      console.error(`Pay2S IPN báo lỗi: ${dto.message}`);
      return { success: true }; // Nhận đã biết, không cần Pay2S gửi lại
    }

    // 2. Tìm topup request trong DB (orderId từ Pay2S = topupCode đã gửi khi tạo link)
    const topup = await this.prismaService.topupRequest.findUnique({
      where: { topupCode: dto.orderId },
    });

    if (!topup) {
      console.error(`Pay2S IPN: không tìm thấy topup orderId=${dto.orderId}`);
      return { success: false, message: 'Order not found' };
    }

    const amountPaid = new Prisma.Decimal(dto.amount);

    // 2b. Đối chiếu số tiền Pay2S báo về với số tiền thực tế của đơn nạp,
    //     tránh trường hợp webhook (giả hoặc lỗi) báo sai số tiền.
    if (topup.status !== 'PAID' && !amountPaid.equals(topup.amountInclVat)) {
      console.error(
        `Pay2S IPN: số tiền không khớp cho orderId=${dto.orderId}. ` +
          `Nhận ${amountPaid.toString()}, mong đợi ${topup.amountInclVat.toString()}`,
      );
      return { success: false, message: 'Amount mismatch' };
    }

    await this.creditTopupIfPending(
      topup,
      amountPaid,
      dto.transId,
      'pay2s_ipn',
    );
    return { success: true };
  }

  /**
   * Nhánh 2: "WebHook" báo biến động tài khoản ngân hàng — body có mảng
   * `transactions`, xác thực bằng header Authorization: Bearer <token>
   * (không phải field `checksum` trong body — Pay2S không công bố công
   * thức tính checksum này). Xem mục WebHook > Tài liệu kỹ thuật.
   */
  async handlePay2sBankTransactionWebhook(
    rawTransactions: unknown[],
    authorization?: string,
  ) {
    const pay2sConfig = this.configService.get('pay2s');
    const expectedTokens: string[] = pay2sConfig?.webhookTokens || [];

    const token = authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!token || !expectedTokens.includes(token)) {
      console.error('Pay2S WebHook: token xác thực không hợp lệ');
      return { success: false, message: 'Invalid webhook token' };
    }

    const payload = plainToInstance(Pay2sBankTransactionWebhookDto, {
      transactions: rawTransactions,
    });
    const errors = await validate(payload, { whitelist: true });
    if (errors.length > 0) {
      console.error('Pay2S WebHook: payload không hợp lệ', errors);
      return { success: false, message: 'Invalid payload' };
    }

    for (const transaction of payload.transactions) {
      await this.processPay2sBankTransaction(transaction);
    }

    return { success: true };
  }

  private async processPay2sBankTransaction(tx: Pay2sBankTransactionDto) {
    if (tx.transferType !== 'IN') return; // chỉ quan tâm tiền vào

    const content = tx.content?.trim() ?? '';
    const CODE_PREFIX = 'COMVIA';
    if (!content.startsWith(CODE_PREFIX)) {
      console.error(
        `Pay2S WebHook: content không đúng định dạng đơn nạp: "${content}"`,
      );
      return;
    }

    // orderInfo lúc tạo Collection Link = topupCode bỏ ký tự đặc biệt và
    // chữ "TOPUP" (xem createTopupWithPay2s) → suy ngược lại topupCode gốc.
    const topupCode = `COMVIA_TOPUP_${content.slice(CODE_PREFIX.length)}`;

    const topup = await this.prismaService.topupRequest.findUnique({
      where: { topupCode },
    });
    if (!topup) {
      console.error(
        `Pay2S WebHook: không tìm thấy topup cho content="${content}" (topupCode=${topupCode})`,
      );
      return;
    }

    const amountPaid = new Prisma.Decimal(tx.transferAmount);
    if (topup.status !== 'PAID' && !amountPaid.equals(topup.amountInclVat)) {
      console.error(
        `Pay2S WebHook: số tiền không khớp cho topupCode=${topupCode}. ` +
          `Nhận ${amountPaid.toString()}, mong đợi ${topup.amountInclVat.toString()}`,
      );
      return;
    }

    await this.creditTopupIfPending(
      topup,
      amountPaid,
      tx.transactionNumber ?? String(tx.id),
      'pay2s_bank_webhook',
    );
  }

  /**
   * Cộng ví + sinh Order/Invoice cho 1 topup, chỉ thực hiện đúng 1 lần dù
   * được gọi nhiều lần (IPN và WebHook có thể cùng báo về 1 giao dịch,
   * hoặc Pay2S tự retry) nhờ update có điều kiện `status: { not: 'PAID' }`.
   */
  private async creditTopupIfPending(
    topup: TopupRequestRecord,
    amountPaid: Prisma.Decimal,
    paymentRef: string,
    source: 'pay2s_ipn' | 'pay2s_bank_webhook',
  ) {
    return await this.prismaService.$transaction(async (tx) => {
      const updateResult = await tx.topupRequest.updateMany({
        where: { id: topup.id, status: { not: 'PAID' } },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentRef,
        },
      });

      if (updateResult.count === 0) {
        return { status: 'success', message: 'Already processed' };
      }

      // Số tiền khách thực chuyển (amountPaid) = amountInclVat, đã bao gồm VAT.
      // Phần VAT công ty phải giữ lại để nộp thuế, KHÔNG đưa vào số dư khả
      // dụng của khách — nếu không thì VAT chỉ còn là con số trên hóa đơn,
      // còn thực chất công ty tự bỏ tiền ra bù phần thuế đó.
      const creditAmount = topup.amountExclVat;

      await this.auditLogService.write({
        actorUserId: topup.ownerUserId,
        workspaceId: topup.workspaceId,
        action: AUDIT_ACTIONS.TOPUP_PAID,
        resourceType: AUDIT_RESOURCE_TYPES.TOPUP_REQUEST,
        resourceId: topup.id,
        metadataJson: {
          topupCode: topup.topupCode,
          amountPaid: amountPaid.toNumber(),
          creditedToWallet: creditAmount.toNumber(),
          paymentRef,
          source,
        },
        tx,
      });

      const walletBefore = await tx.walletAccount.findUnique({
        where: { ownerUserId: topup.ownerUserId },
      });
      if (!walletBefore) {
        throw new NotFoundException('Không tìm thấy ví của người dùng');
      }

      const balanceBefore = walletBefore.balance;
      const balanceAfter = balanceBefore.add(creditAmount);

      await tx.walletAccount.update({
        where: { ownerUserId: topup.ownerUserId },
        data: {
          balance: balanceAfter,
          totalTopup: { increment: creditAmount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          transactionCode: `TX_${topup.topupCode}`,
          ownerUserId: topup.ownerUserId,
          workspaceId: topup.workspaceId,
          type: 'TOPUP_CREDIT',
          amount: creditAmount,
          balanceBefore,
          balanceAfter,
          sourceType: 'TOPUP_REQUEST',
          sourceId: topup.id,
          note: `Nạp tiền từ Pay2S: ${topup.topupCode} (đã chuyển khoản ${amountPaid.toString()}, gồm ${topup.vatAmount.toString()} VAT)`,
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
