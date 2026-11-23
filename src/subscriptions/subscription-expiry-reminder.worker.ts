import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EmailService } from '../integrations/email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { daysRemaining } from './subscription-pricing';

const TICK_MS = 60 * 60 * 1000; // mỗi giờ; mỗi kỳ chỉ nhắc đúng 1 lần
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gửi mail nhắc owner khi subscription còn <= N ngày (N cấu hình trong
 * admin/config chung). Mỗi kỳ chỉ nhắc 1 lần (expiryReminderSentAt); nếu đã mua
 * cộng dồn kỳ nối tiếp thì không nhắc vì workspace chưa sắp hết hạn thật.
 */
@Injectable()
export class SubscriptionExpiryReminderWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionExpiryReminderWorker.name);
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
    setTimeout(() => void this.tick(), 30_000).unref();
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
        `Expiry reminder tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async sendDueReminders(now: Date) {
    const { subscriptionExpiryReminderDays } =
      await this.systemConfigService.getGeneralConfig();
    const horizon = new Date(
      now.getTime() + subscriptionExpiryReminderDays * DAY_MS,
    );

    const candidates = await this.prismaService.workspaceSubscription.findMany({
      where: {
        status: 'ACTIVE',
        expiryReminderSentAt: null,
        startsAt: { lte: now },
        endsAt: { gt: now, lte: horizon },
      },
      include: {
        plan: { select: { name: true } },
        workspace: {
          select: {
            name: true,
            owner: { select: { email: true } },
          },
        },
      },
      take: 200,
    });

    for (const candidate of candidates) {
      // Còn kỳ nối tiếp (mua cộng dồn) => chưa sắp hết hạn thật.
      const continued =
        await this.prismaService.workspaceSubscription.findFirst({
          where: {
            workspaceId: candidate.workspaceId,
            status: 'ACTIVE',
            id: { not: candidate.id },
            startsAt: { lte: candidate.endsAt },
            endsAt: { gt: candidate.endsAt },
          },
          select: { id: true },
        });
      if (continued) continue;

      // Claim nguyên tử để nhiều instance không gửi trùng.
      const claimed = await this.prismaService.workspaceSubscription.updateMany(
        {
          where: { id: candidate.id, expiryReminderSentAt: null },
          data: { expiryReminderSentAt: now },
        },
      );
      if (!claimed.count) continue;

      try {
        await this.emailService.sendSubscriptionExpiryReminderEmail({
          to: candidate.workspace.owner.email,
          workspaceName: candidate.workspace.name,
          planName: candidate.plan.name,
          endsAt: candidate.endsAt,
          daysRemaining: daysRemaining(now, candidate.endsAt),
          renewUrl: this.emailService.buildAppUrl('/app/subscription'),
        });
      } catch (error) {
        // Trả lại để lần quét sau thử gửi lại.
        await this.prismaService.workspaceSubscription.update({
          where: { id: candidate.id },
          data: { expiryReminderSentAt: null },
        });
        this.logger.error(
          `Cannot send expiry reminder for subscription ${candidate.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
