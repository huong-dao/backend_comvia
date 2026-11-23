import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmailService } from '../integrations/email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';

const TICK_MS = 5 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00 hôm nay theo giờ Việt Nam (UTC+7), trả về dạng Date UTC. */
export function startOfVietnamDay(now: Date): Date {
  const local = now.getTime() + VN_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - VN_OFFSET_MS);
}

/**
 * Nhắc owner khi ví chỉ còn <= ngưỡng (cấu hình chung) sau một giao dịch.
 * Một ví chỉ nhận tối đa 1 mail mỗi ngày (giờ VN), và chỉ nhắc lại khi ví có
 * giao dịch mới kể từ lần nhắc trước.
 */
@Injectable()
export class WalletLowBalanceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletLowBalanceWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly systemConfigService: SystemConfigService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    setTimeout(() => void this.tick(), 45_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now: Date = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      await this.sendDueReminders(now);
    } catch (error) {
      this.logger.error(
        `Low balance tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async sendDueReminders(now: Date) {
    const { walletLowBalanceThreshold } =
      await this.systemConfigService.getGeneralConfig();
    if (!walletLowBalanceThreshold || walletLowBalanceThreshold <= 0) return;

    const todayStart = startOfVietnamDay(now);
    const notNotifiedToday: Prisma.WalletAccountWhereInput = {
      OR: [
        { lowBalanceEmailSentAt: null },
        { lowBalanceEmailSentAt: { lt: todayStart } },
      ],
    };

    const wallets = await this.prismaService.walletAccount.findMany({
      where: {
        balance: { lte: new Prisma.Decimal(walletLowBalanceThreshold) },
        ...notNotifiedToday,
      },
      include: { owner: { select: { email: true } } },
      take: 200,
    });

    for (const wallet of wallets) {
      // Chỉ nhắc khi ví có giao dịch kể từ lần nhắc trước (hoặc chưa từng nhắc).
      const hasNewTransaction =
        await this.prismaService.walletTransaction.findFirst({
          where: {
            ownerUserId: wallet.ownerUserId,
            ...(wallet.lowBalanceEmailSentAt
              ? { createdAt: { gt: wallet.lowBalanceEmailSentAt } }
              : {}),
          },
          select: { id: true },
        });
      if (!hasNewTransaction) continue;

      // Claim nguyên tử: đảm bảo 1 mail/ngày dù nhiều instance chạy.
      const claimed = await this.prismaService.walletAccount.updateMany({
        where: { id: wallet.id, ...notNotifiedToday },
        data: { lowBalanceEmailSentAt: now },
      });
      if (!claimed.count) continue;

      try {
        await this.emailService.sendWalletLowBalanceEmail({
          to: wallet.owner.email,
          balance: Number(wallet.balance),
          threshold: walletLowBalanceThreshold,
          topupUrl: this.emailService.buildAppUrl('/app/wallet'),
        });
      } catch (error) {
        await this.prismaService.walletAccount.update({
          where: { id: wallet.id },
          data: { lowBalanceEmailSentAt: wallet.lowBalanceEmailSentAt },
        });
        this.logger.error(
          `Cannot send low balance email for wallet ${wallet.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
