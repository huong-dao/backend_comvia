import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionPurchase } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { PrismaService } from '../prisma/prisma.service';
import { Pay2SWebhookDto } from '../topups/dto/pay2s-webhook.dto';
import { Pay2sBankTransactionDto } from '../topups/dto/pay2s-bank-transaction-webhook.dto';
import {
  SUBSCRIPTION_BANK_CONTENT_PREFIX,
  SUBSCRIPTION_CODE_PREFIX,
  SUBSCRIPTION_PROVIDER,
} from './subscription.constants';
import { computeSubscriptionPeriod } from './subscription-pricing';

type Source = 'pay2s_ipn' | 'pay2s_bank_webhook';

/**
 * Xử lý kết quả thanh toán đơn mua subscription từ Pay2S. TopupsService chuyển
 * các callback có mã COMVIA_SUB_* sang đây. Khác nạp ví: KHÔNG cộng ví, chỉ tạo
 * Order + kỳ subscription, và chỉ chạy đúng 1 lần dù callback đến nhiều lần.
 */
@Injectable()
export class SubscriptionPaymentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async handlePay2sIpn(dto: Pay2SWebhookDto, rawBody: Record<string, unknown>) {
    const purchase = await this.prismaService.subscriptionPurchase.findUnique({
      where: { purchaseCode: dto.orderId },
    });
    if (!purchase) {
      console.error(
        `Pay2S IPN: không tìm thấy đơn subscription ${dto.orderId}`,
      );
      return { success: false, message: 'Order not found' };
    }

    if (dto.resultCode !== 0) {
      await this.markFailedIfPending(
        purchase,
        dto.transId,
        'pay2s_ipn',
        rawBody as Prisma.InputJsonValue,
      );
      return { success: true };
    }

    const amountPaid = new Prisma.Decimal(dto.amount);
    if (
      purchase.status !== 'PAID' &&
      !amountPaid.equals(purchase.amountInclVat)
    ) {
      console.error(
        `Pay2S IPN: số tiền không khớp cho ${dto.orderId}. Nhận ${amountPaid.toString()}, mong đợi ${purchase.amountInclVat.toString()}`,
      );
      return { success: false, message: 'Amount mismatch' };
    }

    await this.activateIfPending(
      purchase,
      amountPaid,
      dto.transId,
      'pay2s_ipn',
      rawBody as Prisma.InputJsonValue,
    );
    return { success: true };
  }

  async handleBankTransaction(tx: Pay2sBankTransactionDto, content: string) {
    const suffix = content
      .slice(SUBSCRIPTION_BANK_CONTENT_PREFIX.length)
      .match(/^[A-Za-z0-9]{8}/)?.[0];
    if (!suffix) {
      console.error(
        `Pay2S WebHook: nội dung đơn subscription lỗi "${content}"`,
      );
      return;
    }
    const purchaseCode = `${SUBSCRIPTION_CODE_PREFIX}_${suffix}`.toUpperCase();

    const purchase = await this.prismaService.subscriptionPurchase.findUnique({
      where: { purchaseCode },
    });
    if (!purchase) {
      console.error(
        `Pay2S WebHook: không tìm thấy đơn subscription ${purchaseCode}`,
      );
      return;
    }

    const amountPaid = new Prisma.Decimal(tx.transferAmount);
    if (
      purchase.status !== 'PAID' &&
      !amountPaid.equals(purchase.amountInclVat)
    ) {
      console.error(
        `Pay2S WebHook: số tiền không khớp cho ${purchaseCode}. Nhận ${amountPaid.toString()}, mong đợi ${purchase.amountInclVat.toString()}`,
      );
      return;
    }

    await this.activateIfPending(
      purchase,
      amountPaid,
      tx.transactionNumber ?? String(tx.id),
      'pay2s_bank_webhook',
      tx as unknown as Prisma.InputJsonValue,
    );
  }

  private async activateIfPending(
    purchase: SubscriptionPurchase,
    amountPaid: Prisma.Decimal,
    paymentRef: string,
    source: Source,
    rawPayload: Prisma.InputJsonValue,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      try {
        await tx.paymentCallbackLog.create({
          data: {
            provider: SUBSCRIPTION_PROVIDER,
            eventId: paymentRef,
            source,
            status: 'PAID',
            subscriptionPurchaseId: purchase.id,
            workspaceId: purchase.workspaceId,
            payloadJson: rawPayload,
          },
        });
      } catch (error) {
        if (this.isUniqueError(error)) {
          return { status: 'success', message: 'Already processed' };
        }
        throw error;
      }

      const now = new Date();
      const updated = await tx.subscriptionPurchase.updateMany({
        where: { id: purchase.id, status: 'PENDING' },
        data: { status: 'PAID', paidAt: now, paymentRef },
      });
      if (updated.count === 0) {
        return { status: 'success', message: 'Already processed' };
      }

      // Khóa workspace để hai đơn thanh toán cùng lúc không tính trùng kỳ.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${purchase.workspaceId} FOR UPDATE`,
      );
      const latest = await tx.workspaceSubscription.aggregate({
        where: { workspaceId: purchase.workspaceId, status: 'ACTIVE' },
        _max: { endsAt: true },
      });
      const period = computeSubscriptionPeriod({
        now,
        latestEndsAt: latest._max.endsAt,
        durationYears: purchase.durationYears,
      });

      const order = await tx.order.create({
        data: {
          orderCode: `ORD_${purchase.purchaseCode}`,
          workspaceId: purchase.workspaceId,
          ownerUserId: purchase.ownerUserId,
          type: 'SUBSCRIPTION',
          totalAmountExclVat: purchase.amountExclVat,
          totalVatAmount: purchase.vatAmount,
          totalAmountInclVat: purchase.amountInclVat,
          status: 'PAID',
          paidAt: now,
          subscriptionPurchaseId: purchase.id,
          items: {
            create: {
              name: `Gói subscription ${purchase.planName} (${purchase.durationYears} năm)`,
              quantity: 1,
              unitPrice: purchase.amountExclVat,
              vatRate: purchase.vatPercent,
              vatAmount: purchase.vatAmount,
              totalAmountInclVat: purchase.amountInclVat,
            },
          },
        },
      });

      const subscription = await tx.workspaceSubscription.create({
        data: {
          workspaceId: purchase.workspaceId,
          planId: purchase.planId,
          purchaseId: purchase.id,
          orderId: order.id,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          durationDays: period.durationDays,
        },
      });

      await this.auditLogService.write({
        actorUserId: purchase.ownerUserId,
        workspaceId: purchase.workspaceId,
        action: AUDIT_ACTIONS.SUBSCRIPTION_PURCHASED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_SUBSCRIPTION,
        resourceId: subscription.id,
        metadataJson: {
          purchaseCode: purchase.purchaseCode,
          orderCode: order.orderCode,
          amountPaid: amountPaid.toNumber(),
          startsAt: period.startsAt.toISOString(),
          endsAt: period.endsAt.toISOString(),
          paymentRef,
          source,
        },
        tx,
      });

      return { status: 'success' };
    });
  }

  private async markFailedIfPending(
    purchase: SubscriptionPurchase,
    paymentRef: string,
    source: Source,
    rawPayload: Prisma.InputJsonValue,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      try {
        await tx.paymentCallbackLog.create({
          data: {
            provider: SUBSCRIPTION_PROVIDER,
            eventId: paymentRef,
            source,
            status: 'FAILED',
            subscriptionPurchaseId: purchase.id,
            workspaceId: purchase.workspaceId,
            payloadJson: rawPayload,
          },
        });
      } catch (error) {
        if (this.isUniqueError(error)) return;
        throw error;
      }

      const updated = await tx.subscriptionPurchase.updateMany({
        where: { id: purchase.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      if (!updated.count) return;

      await this.auditLogService.write({
        actorUserId: purchase.ownerUserId,
        workspaceId: purchase.workspaceId,
        action: AUDIT_ACTIONS.SUBSCRIPTION_PURCHASE_FAILED,
        resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION_PURCHASE,
        resourceId: purchase.id,
        metadataJson: {
          purchaseCode: purchase.purchaseCode,
          paymentRef,
          source,
        },
        tx,
      });
    });
  }

  private isUniqueError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
