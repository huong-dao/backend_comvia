import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SEND_ERROR_CODES,
  sendErrorBody,
} from '../messaging/send-error-messages';
import { daysRemaining } from './subscription-pricing';

export type WorkspaceSubscriptionView = {
  /** NONE: chưa từng có gói; ACTIVE: đang hiệu lực; EXPIRED: đã hết hạn. */
  status: 'NONE' | 'ACTIVE' | 'EXPIRED';
  canSend: boolean;
  plan: { id: string; code: string; name: string } | null;
  /** Bắt đầu kỳ đang hiệu lực. */
  startsAt: Date | null;
  /** Ngày hết hạn cuối cùng (đã tính các kỳ mua cộng dồn liền kề). */
  endsAt: Date | null;
  daysRemaining: number;
  /** Có khi status = EXPIRED. */
  expiredAt: Date | null;
};

@Injectable()
export class SubscriptionAccessService {
  constructor(private readonly prismaService: PrismaService) {}

  async getStatus(
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<WorkspaceSubscriptionView> {
    const periods = await this.prismaService.workspaceSubscription.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      orderBy: { startsAt: 'asc' },
      select: {
        startsAt: true,
        endsAt: true,
        plan: { select: { id: true, code: true, name: true } },
      },
    });

    const current = periods
      .filter((p) => p.startsAt <= now && p.endsAt > now)
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];

    if (!current) {
      const expiredAt = periods
        .filter((p) => p.endsAt <= now)
        .reduce<Date | null>(
          (latest, p) => (!latest || p.endsAt > latest ? p.endsAt : latest),
          null,
        );
      return {
        status: expiredAt ? 'EXPIRED' : 'NONE',
        canSend: false,
        plan: null,
        startsAt: null,
        endsAt: null,
        daysRemaining: 0,
        expiredAt,
      };
    }

    // Nối các kỳ liền kề (mua cộng dồn) để biết ngày hết hạn thật sự.
    let chainEnd = current.endsAt;
    for (const period of periods) {
      if (period.startsAt <= chainEnd && period.endsAt > chainEnd) {
        chainEnd = period.endsAt;
      }
    }

    return {
      status: 'ACTIVE',
      canSend: true,
      plan: current.plan,
      startsAt: current.startsAt,
      endsAt: chainEnd,
      daysRemaining: daysRemaining(now, chainEnd),
      expiredAt: null,
    };
  }

  async canSend(workspaceId: string): Promise<boolean> {
    const hit = await this.prismaService.workspaceSubscription.findFirst({
      where: {
        workspaceId,
        status: 'ACTIVE',
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return hit != null;
  }

  /** Gọi trước mọi thao tác gửi tin (single, public API, campaign). */
  async assertCanSend(workspaceId: string): Promise<void> {
    if (await this.canSend(workspaceId)) return;

    const hasAny = await this.prismaService.workspaceSubscription.findFirst({
      where: { workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    throw new BadRequestException(
      sendErrorBody(
        hasAny
          ? SEND_ERROR_CODES.SUBSCRIPTION_EXPIRED
          : SEND_ERROR_CODES.SUBSCRIPTION_REQUIRED,
      ),
    );
  }
}
