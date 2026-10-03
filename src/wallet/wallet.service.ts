import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface ListTransactionsParams {
  type?: WalletTransactionType;
  types?: WalletTransactionType[];
  status?: WalletTransactionStatus;
  fromDate?: string;
  toDate?: string;
  offset?: number;
  limit?: number;
}

// Asia/Ho_Chi_Minh is a fixed UTC+7 offset (no DST), so month/day boundaries
// can be derived arithmetically without a timezone library.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface MonthlyMetric {
  value: number;
  changePercent: number | null;
}

export interface MonthlyStats {
  toppedUp: MonthlyMetric;
  used: MonthlyMetric;
}

@Injectable()
export class WalletService {
  constructor(private readonly prismaService: PrismaService) {}

  async getBalance(workspaceId: string) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerUserId: true },
    });
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const account = await this.prismaService.walletAccount.findUnique({
      where: { ownerUserId: workspace.ownerUserId },
      select: {
        ownerUserId: true,
        balance: true,
        totalTopup: true,
        totalSpent: true,
        totalRefund: true,
      },
    });
    if (!account) {
      return null;
    }

    const monthly = await this.computeMonthlyStats(workspaceId);
    return { ...account, monthly };
  }

  async listTransactions(
    workspaceId: string,
    {
      type,
      types,
      status,
      fromDate,
      toDate,
      offset = 0,
      limit = 20,
    }: ListTransactionsParams = {},
  ) {
    const where: Prisma.WalletTransactionWhereInput = { workspaceId };

    // `types` (group filter) takes precedence over the single `type` per TICKET-005.
    if (types && types.length > 0) {
      where.type = { in: types };
    } else if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    const createdAt = this.buildCreatedAtRange(fromDate, toDate);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    return this.prismaService.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  private buildCreatedAtRange(
    fromDate?: string,
    toDate?: string,
  ): Prisma.DateTimeFilter | undefined {
    const range: Prisma.DateTimeFilter = {};
    if (fromDate) {
      range.gte = this.parseVnBoundary(fromDate, 'start');
    }
    if (toDate) {
      range.lte = this.parseVnBoundary(toDate, 'end');
    }
    return Object.keys(range).length > 0 ? range : undefined;
  }

  // Date-only inputs are anchored to the start/end of that calendar day in
  // Asia/Ho_Chi_Minh so day boundaries match VND billing (BR-WALLET-05).
  // Full timestamps are honoured as sent.
  private parseVnBoundary(value: string, boundary: 'start' | 'end'): Date {
    if (DATE_ONLY_PATTERN.test(value)) {
      const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
      return new Date(`${value}T${time}+07:00`);
    }
    return new Date(value);
  }

  private async computeMonthlyStats(
    workspaceId: string,
  ): Promise<MonthlyStats> {
    const now = new Date();
    const { startOfThisMonth, startOfLastMonth, startOfNextMonth } =
      this.getVnMonthBoundaries(now);

    // Previous month is compared over the SAME elapsed length as the current
    // month so far: [startOfLastMonth, startOfLastMonth + (now - startOfThisMonth)),
    // clamped at startOfThisMonth so it never spills past the end of last month
    // (e.g. Mar 31 vs a 28-day February clamps to the whole of February).
    const elapsedMs = now.getTime() - startOfThisMonth.getTime();
    const endOfLastMonthWindow = new Date(
      Math.min(
        startOfLastMonth.getTime() + elapsedMs,
        startOfThisMonth.getTime(),
      ),
    );

    const [thisMonth, lastMonth] = await Promise.all([
      this.sumByTypeInRange(workspaceId, startOfThisMonth, startOfNextMonth),
      this.sumByTypeInRange(
        workspaceId,
        startOfLastMonth,
        endOfLastMonthWindow,
      ),
    ]);

    const toppedUpThis = thisMonth.get(WalletTransactionType.TOPUP_CREDIT) ?? 0;
    const toppedUpLast = lastMonth.get(WalletTransactionType.TOPUP_CREDIT) ?? 0;

    const usedThis = this.usedAmount(thisMonth);
    const usedLast = this.usedAmount(lastMonth);

    return {
      toppedUp: {
        value: toppedUpThis,
        changePercent: this.changePercent(toppedUpThis, toppedUpLast),
      },
      used: {
        value: usedThis,
        changePercent: this.changePercent(usedThis, usedLast),
      },
    };
  }

  // "Đã dùng" = MESSAGE_DEBIT minus CAMPAIGN_REFUND; CAMPAIGN_HOLD (not yet
  // finalized) is excluded. See conventions.md Giả định mặc định.
  private usedAmount(sums: Map<WalletTransactionType, number>): number {
    const debit = sums.get(WalletTransactionType.MESSAGE_DEBIT) ?? 0;
    const refund = sums.get(WalletTransactionType.CAMPAIGN_REFUND) ?? 0;
    return debit - refund;
  }

  private async sumByTypeInRange(
    workspaceId: string,
    gte: Date,
    lt: Date,
  ): Promise<Map<WalletTransactionType, number>> {
    const groups = await this.prismaService.walletTransaction.groupBy({
      by: ['type'],
      // Only SUCCESS transactions affect balance aggregates (BR-WALLET-05).
      where: {
        workspaceId,
        status: WalletTransactionStatus.SUCCESS,
        createdAt: { gte, lt },
      },
      _sum: { amount: true },
    });

    const sums = new Map<WalletTransactionType, number>();
    for (const group of groups) {
      sums.set(group.type, this.toNumber(group._sum.amount));
    }
    return sums;
  }

  private changePercent(current: number, previous: number): number | null {
    if (previous === 0) {
      return null;
    }
    return ((current - previous) / previous) * 100;
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return Number(value);
  }

  private getVnMonthBoundaries(now: Date): {
    startOfThisMonth: Date;
    startOfLastMonth: Date;
    startOfNextMonth: Date;
  } {
    const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
    const year = vnNow.getUTCFullYear();
    const month = vnNow.getUTCMonth();

    // Date.UTC normalizes month under/overflow (e.g. month-1 at January rolls
    // back to the prior December). Subtract the VN offset to get the UTC instant
    // of each VN-local month start.
    const startOfThisMonth = new Date(Date.UTC(year, month, 1) - VN_OFFSET_MS);
    const startOfLastMonth = new Date(
      Date.UTC(year, month - 1, 1) - VN_OFFSET_MS,
    );
    const startOfNextMonth = new Date(
      Date.UTC(year, month + 1, 1) - VN_OFFSET_MS,
    );

    return { startOfThisMonth, startOfLastMonth, startOfNextMonth };
  }
}
