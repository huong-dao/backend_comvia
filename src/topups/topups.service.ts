import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  OrderStatus,
  TopupStatus,
  WalletTransactionType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopupQrDto } from './dto/create-topup-qr.dto';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';

@Injectable()
export class TopupsService {
  constructor(private readonly prismaService: PrismaService) {}

  private generateCode(prefix: string) {
    return `${prefix}_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  async createTopupQr(
    workspaceId: string,
    ownerUserId: string,
    dto: CreateTopupQrDto,
  ) {
    const vatRate = dto.vatRate ?? 10;
    const amountExcl = dto.amountExclVat;
    const amountIncl = amountExcl * (1 + vatRate / 100);
    const vatAmount = amountIncl - amountExcl;

    const topupCode = this.generateCode('TP');
    const qrContent = `qr_${topupCode}`;
    const paymentRef = this.generateCode('PR');
    const qrExpiredAt = new Date(Date.now() + 15 * 60 * 1000);

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

    return this.prismaService.topupRequest.create({
      data: {
        topupCode,
        ownerUserId,
        workspaceId,
        amountExclVat: amountExcl,
        vatAmount,
        amountInclVat: amountIncl,
        paymentProvider: 'mock_gateway',
        paymentRef,
        qrContent,
        qrExpiredAt,
        status: 'PENDING' satisfies TopupStatus,
      },
      select: {
        id: true,
        topupCode: true,
        paymentProvider: true,
        paymentRef: true,
        qrContent: true,
        qrExpiredAt: true,
        amountExclVat: true,
        vatAmount: true,
        amountInclVat: true,
        status: true,
      },
    });
  }

  async handleWebhook(dto: MockPaymentWebhookDto) {
    const rawPayload: Prisma.InputJsonValue = (dto.rawPayload ??
      {}) as Prisma.InputJsonValue;

    // idempotency by (provider, eventId)
    const existingWebhook =
      await this.prismaService.paymentWebhookLog.findUnique({
        where: {
          provider_eventId: { provider: dto.provider, eventId: dto.eventId },
        },
        select: { id: true, status: true, processedAt: true },
      });

    if (existingWebhook) {
      return {
        ok: true,
        status: existingWebhook.status,
        processedAt: existingWebhook.processedAt,
      };
    }

    const topup = await this.prismaService.topupRequest.findUnique({
      where: { topupCode: dto.topupCode },
      select: {
        id: true,
        topupCode: true,
        paymentRef: true,
        ownerUserId: true,
        workspaceId: true,
        amountExclVat: true,
        vatAmount: true,
        amountInclVat: true,
        status: true,
      },
    });

    if (!topup) {
      throw new BadRequestException('Topup not found');
    }

    if (dto.status === 'failed') {
      await this.prismaService.$transaction(async (tx) => {
        await tx.paymentWebhookLog.create({
          data: {
            provider: dto.provider,
            eventId: dto.eventId,
            topupRequestId: topup.id,
            rawPayload,
            status: 'FAILED',
          },
        });

        await tx.topupRequest.update({
          where: { id: topup.id },
          data: { status: 'FAILED' satisfies TopupStatus },
        });
      });

      return { ok: true, status: 'FAILED' };
    }

    // success
    if (dto.amountInclVat != null) {
      const expected = Number(topup.amountInclVat);
      if (Math.abs(expected - dto.amountInclVat) > 0.0001) {
        throw new BadRequestException('Callback amount mismatch');
      }
    }

    await this.prismaService.$transaction(async (tx) => {
      // prevent double-processing if topup already paid
      const freshTopup = await tx.topupRequest.findUnique({
        where: { id: topup.id },
        select: { id: true, status: true, amountExclVat: true },
      });
      if (!freshTopup || freshTopup.status === 'PAID') {
        await tx.paymentWebhookLog.create({
          data: {
            provider: dto.provider,
            eventId: dto.eventId,
            topupRequestId: topup.id,
            rawPayload,
            status: 'ALREADY_PROCESSED',
          },
        });
        return;
      }

      const wallet = await tx.walletAccount.findUnique({
        where: { ownerUserId: topup.ownerUserId },
        select: { balance: true, totalTopup: true },
      });
      if (!wallet) {
        throw new BadRequestException('Wallet not initialized');
      }

      const amountExcl = Number(topup.amountExclVat);
      const vatAmount = Number(topup.vatAmount);
      const amountIncl = Number(topup.amountInclVat);

      const walletBefore = Number(wallet.balance);
      const walletAfter = walletBefore + amountExcl;

      const transactionCode = this.generateCode('WT');
      const orderCode = this.generateCode('ORD');
      const invoiceCode = this.generateCode('INV');
      const paymentRef = topup.paymentRef;

      await tx.paymentWebhookLog.create({
        data: {
          provider: dto.provider,
          eventId: dto.eventId,
          topupRequestId: topup.id,
          rawPayload,
          status: 'SUCCESS',
        },
      });

      await tx.topupRequest.update({
        where: { id: topup.id },
        data: { status: 'PAID' satisfies TopupStatus, paidAt: new Date() },
      });

      await tx.walletAccount.update({
        where: { ownerUserId: topup.ownerUserId },
        data: {
          balance: { increment: amountExcl },
          totalTopup: { increment: amountExcl },
        },
      });

      await tx.walletTransaction.create({
        data: {
          transactionCode,
          ownerUserId: topup.ownerUserId,
          workspaceId: topup.workspaceId,
          type: 'TOPUP_CREDIT' satisfies WalletTransactionType,
          amount: amountExcl,
          balanceBefore: walletBefore,
          balanceAfter: walletAfter,
          sourceType: 'TOPUP',
          sourceId: topup.topupCode,
          createdBy: null,
          note: 'Mock topup success',
        },
      });

      await tx.order.create({
        data: {
          orderCode,
          workspaceId: topup.workspaceId,
          ownerUserId: topup.ownerUserId,
          orderType: 'topup',
          currency: 'VND',
          totalAmountExclVat: amountExcl,
          totalVatAmount: vatAmount,
          totalAmountInclVat: amountIncl,
          paymentMethod: dto.provider,
          paymentRef,
          status: 'PAID' satisfies OrderStatus,
          paidAt: new Date(),
          items: {
            create: [
              {
                name: 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS',
                quantity: 1,
                unitPrice: amountExcl,
                vatRate: 10,
                vatAmount: vatAmount,
                totalAmountInclVat: amountIncl,
              },
            ],
          },
          invoice: {
            create: {
              invoiceCode,
              workspaceId: topup.workspaceId,
              billingType: 'ORGANIZATION',
              billingSnapshotJson: {
                mock: true,
                topupCode: topup.topupCode,
              } as Prisma.InputJsonValue,
              status: 'POSTED',
              issueDate: null,
              items: {
                create: [
                  {
                    name: 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS',
                    quantity: 1,
                    unitPrice: amountExcl,
                    vatRate: 10,
                    vatAmount: vatAmount,
                    totalAmountInclVat: amountIncl,
                  },
                ],
              },
            },
          },
        },
        select: { id: true },
      });
    });

    return { ok: true };
  }
}
