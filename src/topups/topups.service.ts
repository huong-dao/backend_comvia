import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TopupStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import { CreateTopupPay2sDto } from './dto/create-topup-pay2s.dto';
import { calculateTopupAmounts, TOPUP_VAT_RATE } from './topup-vat';
import { verifyPay2sSignature } from '../integrations/pay2s/pay2s.util';
import { Pay2sCollectionService } from '../integrations/pay2s/pay2s-collection.service';
import { SubscriptionPaymentsService } from '../subscriptions/subscription-payments.service';
import {
  SUBSCRIPTION_BANK_CONTENT_PREFIX,
  SUBSCRIPTION_CODE_PREFIX,
} from '../subscriptions/subscription.constants';
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
    private readonly walletLedgerService: WalletLedgerService,
    private readonly pay2sCollectionService: Pay2sCollectionService,
    private readonly subscriptionPaymentsService: SubscriptionPaymentsService,
  ) {}

  private generateCode(prefix: string) {
    return `${prefix}_${randomBytes(4).toString('hex')}`;
  }

  async createTopupWithPay2S(
    workspaceId: string,
    ownerUserId: string,
    dto: CreateTopupPay2sDto,
    moneyAccountId: string,
  ) {
    const {
      amountExclVat: amountExcl,
      vatAmount,
      amountInclVat: amountIncl,
    } = calculateTopupAmounts(dto.amountExclVat);

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
      // orderInfo: topupCode bỏ ký tự đặc biệt và chữ "TOPUP" (10-32 ký tự,
      // chỉ chữ + số) — processPay2sBankTransaction suy ngược lại từ đây.
      const qrCodeUrl = await this.pay2sCollectionService.createCollectionQr({
        code: topup.topupCode,
        orderInfo: topup.topupCode
          .replace(/[^a-zA-Z0-9]/g, '')
          .replace('TOPUP', '')
          .substring(0, 32),
        amountInclVat: amountIncl,
        moneyAccountId,
        redirectPath: '/topup/success',
      });

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

      // Lỗi đã có mã/thông điệp an toàn cho client (ví dụ PAY2S_UNAVAILABLE,
      // tài khoản ngân hàng không hợp lệ) → trả nguyên; không nối thông điệp
      // gốc của Pay2S. Lỗi khác (ví dụ DB) → ghi log và để Nest trả 500.
      if (error instanceof HttpException) {
        throw error;
      }
      console.error(
        `Lỗi không mong đợi khi tạo topup ${topup.topupCode}:`,
        error,
      );
      throw error;
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

    // Đơn mua subscription (orderId COMVIA_SUB_...) đi theo luồng riêng:
    // không cộng ví, chỉ kích hoạt subscription + tạo Order.
    if (dto.orderId.startsWith(`${SUBSCRIPTION_CODE_PREFIX}_`)) {
      return this.subscriptionPaymentsService.handlePay2sIpn(dto, rawBody);
    }

    // 1. Kiểm tra trạng thái giao dịch từ Pay2S
    if (dto.resultCode !== 0) {
      console.error(`Pay2S IPN báo lỗi: ${dto.message}`);
      const topup = await this.prismaService.topupRequest.findUnique({
        where: { topupCode: dto.orderId },
      });
      if (topup) {
        await this.markTopupFailedIfPending(
          topup,
          dto.transId,
          'pay2s_ipn',
          rawBody as Prisma.InputJsonValue,
        );
      }
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
      rawBody as Prisma.InputJsonValue,
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
    if (content.startsWith(SUBSCRIPTION_BANK_CONTENT_PREFIX)) {
      await this.subscriptionPaymentsService.handleBankTransaction(tx, content);
      return;
    }
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
      tx as unknown as Prisma.InputJsonValue,
    );
  }

  /**
   * Cộng ví + sinh Order cho 1 topup, chỉ thực hiện đúng 1 lần dù được gọi
   * nhiều lần (IPN và WebHook có thể cùng báo về 1 giao dịch, hoặc Pay2S tự
   * retry) nhờ update có điều kiện `status: { not: 'PAID' }`.
   */
  private async creditTopupIfPending(
    topup: TopupRequestRecord,
    amountPaid: Prisma.Decimal,
    paymentRef: string,
    source: 'pay2s_ipn' | 'pay2s_bank_webhook',
    rawPayload: Prisma.InputJsonValue,
  ) {
    return await this.prismaService.$transaction(async (tx) => {
      try {
        await tx.paymentCallbackLog.create({
          data: {
            provider: 'PAY2S',
            eventId: paymentRef,
            source,
            status: 'PAID',
            topupRequestId: topup.id,
            workspaceId: topup.workspaceId,
            payloadJson: rawPayload,
          },
        });
      } catch (error) {
        if (this.isUniqueCallbackError(error)) {
          return { status: 'success', message: 'Already processed' };
        }
        throw error;
      }

      const updateResult = await tx.topupRequest.updateMany({
        where: { id: topup.id, status: 'PENDING' },
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

      await this.walletLedgerService.lock(tx, topup.ownerUserId);
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

      // D. Tạo Order (Đơn hàng) — theo ISSUE-001, topup paid chỉ dừng lại ở
      // Order, không còn tạo Invoice/InvoiceItem kèm theo.
      await tx.order.create({
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
              vatRate: TOPUP_VAT_RATE,
              vatAmount: topup.vatAmount,
              totalAmountInclVat: topup.amountInclVat,
            },
          },
        },
      });

      return { status: 'success' };
    });
  }

  private async markTopupFailedIfPending(
    topup: TopupRequestRecord,
    paymentRef: string,
    source: 'pay2s_ipn',
    rawPayload: Prisma.InputJsonValue,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      try {
        await tx.paymentCallbackLog.create({
          data: {
            provider: 'PAY2S',
            eventId: paymentRef,
            source,
            status: 'FAILED',
            topupRequestId: topup.id,
            workspaceId: topup.workspaceId,
            payloadJson: rawPayload,
          },
        });
      } catch (error) {
        if (this.isUniqueCallbackError(error)) {
          return { status: 'success', message: 'Already processed' };
        }
        throw error;
      }

      const updated = await tx.topupRequest.updateMany({
        where: { id: topup.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      if (!updated.count)
        return { status: 'success', message: 'Already processed' };

      await this.auditLogService.write({
        actorUserId: topup.ownerUserId,
        workspaceId: topup.workspaceId,
        action: AUDIT_ACTIONS.TOPUP_FAILED,
        resourceType: AUDIT_RESOURCE_TYPES.TOPUP_REQUEST,
        resourceId: topup.id,
        metadataJson: { topupCode: topup.topupCode, paymentRef, source },
        tx,
      });
      return { status: 'success' };
    });
  }

  private isUniqueCallbackError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
