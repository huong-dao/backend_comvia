import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';

/**
 * Database-backed worker. The database is the queue: a row is atomically
 * changed from PENDING to PROCESSING before Zalo is called. PROCESSING rows
 * found at startup are deliberately paused for reconciliation, never resent.
 */
@Injectable()
export class CampaignWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly campaignsService: CampaignsService) {}

  async onModuleInit() {
    await this.campaignsService.recoverInFlightCampaignRows();
    this.timer = setInterval(() => void this.tick(), 2_000);
    this.timer.unref();
    await this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.campaignsService.processQueuedCampaignRuns();
    } catch (error) {
      this.logger.error(
        `Campaign worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
