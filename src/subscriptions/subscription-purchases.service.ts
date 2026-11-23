import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionPurchaseStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { Pay2sCollectionService } from '../integrations/pay2s/pay2s-collection.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListSubscriptionPurchasesQueryDto } from './dto/list-subscription-purchases-query.dto';
import { PurchaseSubscriptionDto } from './dto/purchase-subscription.dto';
import {
  SUBSCRIPTION_CODE_PREFIX,
  SUBSCRIPTION_PROVIDER,
} from './subscription.constants';
import {
  calculateSubscriptionAmounts,
  computeSubscriptionPeriod,
} from './subscription-pricing';

type PurchaseRow = Prisma.SubscriptionPurchaseGetPayload<object>;

function toPurchaseView(purchase: PurchaseRow) {
  return {
    id: purchase.id,
    purchaseCode: purchase.purchaseCode,
    planId: purchase.planId,
    planName: purchase.planName,
    durationYears: purchase.durationYears,
    amountExclVat: Number(purchase.amountExclVat),
    vatPercent: Number(purchase.vatPercent),
    vatAmount: Number(purchase.vatAmount),
    amountInclVat: Number(purchase.amountInclVat),
    status: purchase.status,
    qrCodeUrl: purchase.qrCodeUrl,
    paidAt: purchase.paidAt,
    createdAt: purchase.createdAt,
  };
}

@Injectable()
export class SubscriptionPurchasesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly pay2sCollectionService: Pay2sCollectionService,
  ) {}

  /** Tạo đơn mua + QR Pay2S (giống nạp ví). Chưa kích hoạt gì cho tới khi thanh toán. */
  async createPurchase(
    workspaceId: string,
    ownerUserId: string,
    dto: PurchaseSubscriptionDto,
  ) {
    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.isActive) {
      throw new BadRequestException(
        'Gói subscription không tồn tại hoặc đã ngừng bán',
      );
    }

    const amounts = calculateSubscriptionAmounts(
      plan.priceExclVat,
      plan.vatPercent,
    );
    if (amounts.amountInclVat < 10000) {
      // Ngưỡng tối thiểu của Pay2S (giống nạp ví).
      throw new BadRequestException(
        'Giá gói quá thấp để thanh toán qua Pay2S (tối thiểu 10.000đ)',
      );
    }

    const purchase = await this.prismaService.subscriptionPurchase.create({
      data: {
        purchaseCode:
          `${SUBSCRIPTION_CODE_PREFIX}_${randomBytes(4).toString('hex')}`.toUpperCase(),
        workspaceId,
        ownerUserId,
        planId: plan.id,
        planName: plan.name,
        durationYears: plan.durationYears,
        amountExclVat: amounts.amountExclVat,
        vatPercent: amounts.vatPercent,
        vatAmount: amounts.vatAmount,
        amountInclVat: amounts.amountInclVat,
        paymentProvider: SUBSCRIPTION_PROVIDER,
        paymentRef: '',
        qrCodeUrl: '',
        status: 'PENDING',
      },
    });

    try {
      const qrCodeUrl = await this.pay2sCollectionService.createCollectionQr({
        code: purchase.purchaseCode,
        // COMVIA_SUB_AB12CD34 -> COMVIASUBAB12CD34 (chỉ chữ + số)
        orderInfo: purchase.purchaseCode
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 32),
        amountInclVat: amounts.amountInclVat,
        moneyAccountId: dto.moneyAccountId,
        redirectPath: '/subscription/success',
      });

      const updated = await this.prismaService.subscriptionPurchase.update({
        where: { id: purchase.id },
        data: { qrCodeUrl },
      });

      const latest = await this.prismaService.workspaceSubscription.aggregate({
        where: { workspaceId, status: 'ACTIVE' },
        _max: { endsAt: true },
      });
      const preview = computeSubscriptionPeriod({
        now: new Date(),
        latestEndsAt: latest._max.endsAt,
        durationYears: plan.durationYears,
      });

      return {
        ...toPurchaseView(updated),
        // Dự kiến nếu thanh toán ngay (thực tế tính lại lúc nhận tiền).
        expectedStartsAt: preview.startsAt,
        expectedEndsAt: preview.endsAt,
      };
    } catch (error) {
      await this.prismaService.subscriptionPurchase
        .update({
          where: { id: purchase.id },
          data: { status: 'FAILED' satisfies SubscriptionPurchaseStatus },
        })
        .catch((updateError: unknown) =>
          console.error(
            'Không thể đánh dấu đơn subscription FAILED',
            updateError,
          ),
        );
      // Lỗi đã có mã/thông điệp an toàn cho client (ví dụ PAY2S_UNAVAILABLE,
      // tài khoản ngân hàng không hợp lệ) → trả nguyên; không nối thông điệp
      // gốc của Pay2S. Lỗi khác (ví dụ DB) → ghi log và để Nest trả 500.
      if (error instanceof HttpException) {
        throw error;
      }
      console.error(
        `Lỗi không mong đợi khi tạo đơn subscription ${purchase.purchaseCode}:`,
        error,
      );
      throw error;
    }
  }

  async getPurchaseStatus(workspaceId: string, purchaseCode: string) {
    const purchase = await this.prismaService.subscriptionPurchase.findFirst({
      where: { workspaceId, purchaseCode },
    });
    if (!purchase) throw new NotFoundException('Không tìm thấy đơn mua');
    return toPurchaseView(purchase);
  }

  async listPurchases(
    workspaceId: string,
    query: ListSubscriptionPurchasesQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SubscriptionPurchaseWhereInput = {
      workspaceId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prismaService.subscriptionPurchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          order: { select: { id: true, orderCode: true } },
          subscription: { select: { startsAt: true, endsAt: true } },
        },
      }),
      this.prismaService.subscriptionPurchase.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...toPurchaseView(row),
        order: row.order,
        startsAt: row.subscription?.startsAt ?? null,
        endsAt: row.subscription?.endsAt ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
