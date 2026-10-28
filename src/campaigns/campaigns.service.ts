import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CampaignRowStatus,
  CampaignRunStatus,
  CampaignStatus,
  MessageStatus,
  OaConnectionStatus,
  Prisma,
  SendType,
  WalletTransactionType,
} from '@prisma/client';
import { OaMessagingService } from '../oa/oa-messaging.service';
import { ZaloZnsRejectedError } from '../integrations/zalo/zalo-zns.client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import {
  buildCsvTemplateContent,
  parseCampaignCsv,
  placeholderKeysFromJson,
} from './campaign-csv.util';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { RetryCampaignDto } from './dto/retry-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateCampaignRowDto } from './dto/update-campaign-row.dto';

type CampaignContext = {
  id: string;
  workspaceId: string;
  oaConnectionId: string;
  templateId: string;
  status: CampaignStatus;
  lastRunAt: Date | null;
  unitPriceAtCreate: Prisma.Decimal;
  template: {
    id: string;
    status: string;
    providerTemplateId: string | null;
    placeholdersJson: Prisma.JsonValue;
    placeholder_labels: Prisma.JsonValue;
    unitPricePerMessage: Prisma.Decimal | null;
    ctaButtons: { unitPrice: number | null; defaultUnitPrice: number | null }[];
    oaConnectionId: string;
  };
  workspace: {
    ownerUserId: string;
    status: string;
  };
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly systemConfigService: SystemConfigService,
    private readonly oaMessagingService: OaMessagingService,
    private readonly walletLedgerService: WalletLedgerService,
  ) {}

  async create(
    workspaceId: string,
    actorUserId: string,
    dto: CreateCampaignDto,
  ) {
    const template = await this.getApprovedTemplateOrThrow(
      workspaceId,
      dto.templateId,
    );
    const unitPrice = await this.resolveTemplateDispatchUnitPrice(template);

    const campaign = await this.prismaService.campaign.create({
      data: {
        workspaceId,
        oaConnectionId: template.oaConnectionId,
        templateId: template.id,
        name: dto.name,
        status: 'DRAFT' satisfies CampaignStatus,
        unitPriceAtCreate: unitPrice,
        estimatedTotalAmount: 0,
        createdBy: actorUserId,
      },
      include: this.campaignInclude(),
    });
    return this.flattenCampaignOa(campaign);
  }

  list(workspaceId: string) {
    return this.prismaService.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: { id: true, name: true, code: true, status: true },
        },
      },
    });
  }

  async get(workspaceId: string, campaignId: string) {
    const campaign = await this.findCampaignOrThrow(workspaceId, campaignId);
    const found = await this.prismaService.campaign.findUnique({
      where: { id: campaign.id },
      include: this.campaignInclude(),
    });
    return found ? this.flattenCampaignOa(found) : found;
  }

  async update(
    workspaceId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
  ) {
    const campaign = await this.findCampaignOrThrow(workspaceId, campaignId);
    if (campaign.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled campaign cannot be updated');
    }

    const updated = await this.prismaService.campaign.update({
      where: { id: campaign.id },
      data: { name: dto.name },
      include: this.campaignInclude(),
    });
    return this.flattenCampaignOa(updated);
  }

  async remove(workspaceId: string, campaignId: string) {
    const campaign = await this.findCampaignOrThrow(workspaceId, campaignId);

    if (campaign.status === 'DRAFT') {
      await this.prismaService.campaign.delete({ where: { id: campaign.id } });
      return { id: campaign.id, deleted: true };
    }

    if (campaign.status === 'CANCELLED') {
      throw new BadRequestException('Campaign is already cancelled');
    }

    return this.prismaService.campaign.update({
      where: { id: campaign.id },
      data: { status: 'CANCELLED' satisfies CampaignStatus },
      select: { id: true, status: true },
    });
  }

  async exportCsvTemplate(workspaceId: string, campaignId: string) {
    const campaign = await this.getCampaignContext(workspaceId, campaignId);
    const placeholders = campaign.template.placeholdersJson as Record<
      string,
      unknown
    >;
    return buildCsvTemplateContent(
      placeholders,
      campaign.template.placeholder_labels as Record<string, unknown> | null,
    );
  }

  async importCsv(workspaceId: string, campaignId: string, csvText: string) {
    const campaign = await this.getCampaignContext(workspaceId, campaignId);
    this.assertCanImport(campaign);

    const placeholders = campaign.template.placeholdersJson as Record<
      string,
      unknown
    >;
    const parsed = parseCampaignCsv(
      csvText,
      placeholders,
      campaign.template.placeholder_labels as Record<string, unknown> | null,
    );
    if (parsed.errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: parsed.errors,
      });
    }

    const unitPrice = await this.resolveTemplateDispatchUnitPrice(
      campaign.template,
    );
    const estimatedTotal = unitPrice * parsed.rows.length;

    await this.prismaService.$transaction(async (tx) => {
      await tx.campaignRow.deleteMany({ where: { campaignId: campaign.id } });

      if (parsed.rows.length > 0) {
        await tx.campaignRow.createMany({
          data: parsed.rows.map((row) => ({
            campaignId: campaign.id,
            phoneNumber: row.phoneNumber,
            payloadData: row.payloadData as Prisma.InputJsonValue,
            rawImportRow: row.rawImportRow as Prisma.InputJsonValue,
            status: 'PENDING' satisfies CampaignRowStatus,
          })),
        });
      }

      await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          status:
            parsed.rows.length > 0
              ? ('READY' satisfies CampaignStatus)
              : ('DRAFT' satisfies CampaignStatus),
          unitPriceAtCreate: unitPrice,
          estimatedTotalAmount: estimatedTotal,
          totalData: parsed.rows.length,
          totalValid: parsed.rows.length,
          totalInvalid: 0,
          totalPending: parsed.rows.length,
          totalSuccess: 0,
          totalFailed: 0,
        },
      });
    });

    return this.get(workspaceId, campaignId);
  }

  listRows(
    workspaceId: string,
    campaignId: string,
    status?: CampaignRowStatus,
    limit = 100,
  ) {
    return this.findCampaignOrThrow(workspaceId, campaignId).then((campaign) =>
      this.prismaService.campaignRow.findMany({
        where: {
          campaignId: campaign.id,
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: {
          messageLog: {
            select: {
              id: true,
              status: true,
              errorCode: true,
              providerMessageId: true,
              sentAt: true,
            },
          },
        },
      }),
    );
  }

  async updateRow(
    workspaceId: string,
    campaignId: string,
    rowId: string,
    dto: UpdateCampaignRowDto,
  ) {
    const campaign = await this.getCampaignContext(workspaceId, campaignId);
    if (campaign.status === 'RUNNING') {
      throw new BadRequestException(
        'Cannot edit rows while campaign is running',
      );
    }
    if (campaign.status === 'CANCELLED') {
      throw new BadRequestException('Campaign is cancelled');
    }

    const row = await this.prismaService.campaignRow.findFirst({
      where: { id: rowId, campaignId: campaign.id },
    });
    if (!row) {
      throw new BadRequestException('Campaign row not found');
    }

    const placeholders = placeholderKeysFromJson(
      campaign.template.placeholdersJson as Record<string, unknown>,
    );

    if (dto.payloadData) {
      for (const key of placeholders) {
        if (!dto.payloadData[key]?.trim()) {
          throw new BadRequestException(`payloadData.${key} is required`);
        }
      }
    }

    const updated = await this.prismaService.campaignRow.update({
      where: { id: rowId },
      data: {
        phoneNumber: dto.phoneNumber,
        payloadData: dto.payloadData
          ? (dto.payloadData as Prisma.InputJsonValue)
          : undefined,
        status:
          row.status === 'FAILED'
            ? ('PENDING' satisfies CampaignRowStatus)
            : undefined,
        failureReason: row.status === 'FAILED' ? null : undefined,
      },
      include: {
        messageLog: {
          select: {
            id: true,
            status: true,
            errorCode: true,
            providerMessageId: true,
            sentAt: true,
          },
        },
      },
    });

    await this.syncCampaignCounters(campaign.id);
    return updated;
  }

  async removeRow(workspaceId: string, campaignId: string, rowId: string) {
    const campaign = await this.getCampaignContext(workspaceId, campaignId);
    if (campaign.status === 'RUNNING') {
      throw new BadRequestException(
        'Cannot delete rows while campaign is running',
      );
    }

    const row = await this.prismaService.campaignRow.findFirst({
      where: { id: rowId, campaignId: campaign.id },
    });
    if (!row) {
      throw new BadRequestException('Campaign row not found');
    }

    await this.prismaService.campaignRow.delete({ where: { id: rowId } });
    await this.syncCampaignCounters(campaign.id);

    const remaining = await this.prismaService.campaignRow.count({
      where: { campaignId: campaign.id },
    });

    if (remaining === 0) {
      await this.prismaService.campaign.update({
        where: { id: campaign.id },
        data: {
          status: 'DRAFT' satisfies CampaignStatus,
          estimatedTotalAmount: 0,
        },
      });
    }

    return { id: rowId, deleted: true };
  }

  async execute(
    workspaceId: string,
    campaignId: string,
    operatorUserId: string,
  ) {
    const campaign = await this.getCampaignContext(workspaceId, campaignId);
    this.assertCanRun(campaign);

    const pendingRows = await this.prismaService.campaignRow.findMany({
      where: { campaignId: campaign.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingRows.length === 0) {
      throw new BadRequestException('Campaign has no pending rows to send');
    }

    return this.enqueueCampaignRun({
      campaign,
      rows: pendingRows,
      operatorUserId,
      note: 'Campaign execute',
    });
  }

  async retry(
    workspaceId: string,
    campaignId: string,
    operatorUserId: string,
    dto: RetryCampaignDto,
  ) {
    const campaign = await this.getCampaignContext(workspaceId, campaignId);
    this.assertCanRun(campaign);

    const rows = await this.prismaService.campaignRow.findMany({
      where: {
        campaignId: campaign.id,
        id: { in: dto.rowIds },
        status: 'FAILED',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (rows.length !== dto.rowIds.length) {
      throw new BadRequestException(
        'All rowIds must reference failed rows in this campaign',
      );
    }

    return this.enqueueCampaignRun({
      campaign,
      rows,
      operatorUserId,
      note: 'Campaign retry failed rows',
      isRetry: true,
    });
  }

  /**
   * Creates a durable run and charges it before the worker can claim a row.
   * The HTTP request never calls the provider directly.
   */
  private async enqueueCampaignRun(params: {
    campaign: CampaignContext;
    rows: { id: string; phoneNumber: string; payloadData: Prisma.JsonValue }[];
    operatorUserId: string;
    note: string;
    isRetry?: boolean;
  }) {
    const { campaign, rows, operatorUserId, note, isRetry } = params;
    const unitPrice = await this.resolveTemplateDispatchUnitPrice(
      campaign.template,
    );
    const totalCharge = unitPrice * rows.length;

    const run = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.campaignRun.create({
        data: {
          campaignId: campaign.id,
          operatorUserId,
          unitPrice,
          totalCharged: totalCharge,
        },
      });
      const holdTransactionId = await this.walletLedgerService.debit(tx, {
        ownerUserId: campaign.workspace.ownerUserId,
        workspaceId: campaign.workspaceId,
        amount: totalCharge,
        type: 'CAMPAIGN_HOLD' satisfies WalletTransactionType,
        sourceType: 'CAMPAIGN_RUN',
        sourceId: created.id,
        createdBy: operatorUserId,
        note,
      });

      await tx.campaignRow.updateMany({
        where: {
          id: { in: rows.map((row) => row.id) },
          campaignId: campaign.id,
        },
        data: {
          status: 'PENDING' satisfies CampaignRowStatus,
          campaignRunId: created.id,
          dispatchStartedAt: null,
          failureReason: null,
          ...(isRetry ? { retryCount: { increment: 1 } } : {}),
        },
      });
      await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          status: 'RUNNING' satisfies CampaignStatus,
          unitPriceAtCreate: unitPrice,
        },
      });
      return tx.campaignRun.update({
        where: { id: created.id },
        data: { holdTransactionId },
      });
    });

    await this.syncCampaignCounters(campaign.id);
    return {
      campaignId: campaign.id,
      status: 'QUEUED' satisfies CampaignRunStatus,
      runId: run.id,
      unitPrice,
      totalCharged: totalCharge,
    };
  }

  /** Called by CampaignWorkerService. Claims happen before any provider call. */
  async processQueuedCampaignRuns() {
    const runs = await this.prismaService.campaignRun.findMany({
      where: { status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const run of runs) await this.processCampaignRun(run.id);
  }

  async recoverInFlightCampaignRows() {
    const processing = await this.prismaService.campaignRow.findMany({
      where: { status: 'PROCESSING' },
      select: { campaignId: true, campaignRunId: true },
    });
    if (!processing.length) return;

    await this.prismaService.campaignRow.updateMany({
      where: { status: 'PROCESSING' },
      data: {
        status: 'RECONCILIATION_REQUIRED' satisfies CampaignRowStatus,
        failureReason:
          'Dispatch outcome is unknown after worker interruption; do not resend automatically.',
      },
    });
    const runIds = [
      ...new Set(
        processing
          .map((row) => row.campaignRunId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const campaignIds = [...new Set(processing.map((row) => row.campaignId))];
    if (runIds.length) {
      await this.prismaService.campaignRun.updateMany({
        where: { id: { in: runIds } },
        data: { status: 'PAUSED' satisfies CampaignRunStatus },
      });
    }
    if (campaignIds.length) {
      await this.prismaService.campaign.updateMany({
        where: { id: { in: campaignIds } },
        data: { status: 'PAUSED' satisfies CampaignStatus },
      });
      await Promise.all(campaignIds.map((id) => this.syncCampaignCounters(id)));
    }
  }

  private async processCampaignRun(runId: string) {
    await this.prismaService.campaignRun.updateMany({
      where: { id: runId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    const run = await this.prismaService.campaignRun.findUnique({
      where: { id: runId },
    });
    if (!run || run.status !== 'RUNNING') return;

    const row = await this.prismaService.campaignRow.findFirst({
      where: { campaignRunId: run.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (!row) return this.finalizeCampaignRun(run.id);

    const claimed = await this.prismaService.campaignRow.updateMany({
      where: { id: row.id, status: 'PENDING', campaignRunId: run.id },
      data: { status: 'PROCESSING', dispatchStartedAt: new Date() },
    });
    if (!claimed.count) return;

    const campaign = await this.getCampaignContextById(run.campaignId);
    await this.sendOneRow({
      campaign,
      row,
      unitPrice: Number(run.unitPrice),
      operatorUserId: run.operatorUserId,
      isRetry: row.retryCount > 0,
    });
    await this.syncCampaignCounters(campaign.id);
  }

  private async sendOneRow(params: {
    campaign: CampaignContext;
    row: { id: string; phoneNumber: string; payloadData: Prisma.JsonValue };
    unitPrice: number;
    operatorUserId: string;
    isRetry: boolean;
  }): Promise<{ success: boolean }> {
    const { campaign, row, unitPrice, operatorUserId } = params;
    const templateData = row.payloadData as Record<string, unknown>;
    const payloadSnapshot = {
      campaignId: campaign.id,
      campaignRowId: row.id,
      templateId: campaign.templateId,
      phoneNumber: row.phoneNumber,
      data: templateData,
    } as Prisma.InputJsonValue;

    try {
      const dispatch = await this.oaMessagingService.dispatchZnsTemplate({
        oaConnectionId: campaign.oaConnectionId,
        phoneNumber: row.phoneNumber,
        providerTemplateId: campaign.template.providerTemplateId!,
        templateData,
        trackingId: row.id,
      });

      const messageLog = await this.prismaService.messageLog.create({
        data: {
          workspaceId: campaign.workspaceId,
          oaConnectionId: campaign.oaConnectionId,
          templateId: campaign.templateId,
          sendType: 'CAMPAIGN' satisfies SendType,
          phoneNumber: row.phoneNumber,
          payloadSnapshot,
          status: 'SUCCESS' satisfies MessageStatus,
          providerMessageId: dispatch.providerMessageId,
          providerTrackingId: dispatch.providerTrackingId,
          providerSentAt: dispatch.providerSentAt,
          providerQuotaDaily: dispatch.providerQuotaDaily,
          providerQuotaRemaining: dispatch.providerQuotaRemaining,
          costAtTime: unitPrice,
          operatorUserId,
          sentAt: new Date(),
        },
      });

      await this.prismaService.campaignRow.update({
        where: { id: row.id },
        data: {
          status: 'SUCCESS' satisfies CampaignRowStatus,
          failureReason: null,
          providerMessageId: dispatch.providerMessageId,
          messageLogId: messageLog.id,
          dispatchStartedAt: null,
        },
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Zalo ZNS send failed';

      // Only a parsed provider rejection is safe to retry. A network failure or
      // lost response is ambiguous and must not be resent automatically.
      const isConfirmedFailure = error instanceof ZaloZnsRejectedError;
      const messageLog = await this.prismaService.messageLog.create({
        data: {
          workspaceId: campaign.workspaceId,
          oaConnectionId: campaign.oaConnectionId,
          templateId: campaign.templateId,
          sendType: 'CAMPAIGN' satisfies SendType,
          phoneNumber: row.phoneNumber,
          payloadSnapshot,
          status: (isConfirmedFailure
            ? 'FAILED'
            : 'PENDING') satisfies MessageStatus,
          errorCode: errorMessage.slice(0, 255),
          costAtTime: unitPrice,
          operatorUserId,
        },
      });

      await this.prismaService.campaignRow.update({
        where: { id: row.id },
        data: {
          status: (isConfirmedFailure
            ? 'FAILED'
            : 'RECONCILIATION_REQUIRED') satisfies CampaignRowStatus,
          failureReason: isConfirmedFailure
            ? errorMessage.slice(0, 500)
            : `Dispatch outcome requires reconciliation: ${errorMessage.slice(0, 440)}`,
          messageLogId: messageLog.id,
          dispatchStartedAt: null,
        },
      });

      return { success: false };
    }
  }

  private async finalizeCampaignRun(runId: string) {
    await this.prismaService.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CampaignRun" WHERE "id" = ${runId} FOR UPDATE`,
      );
      const run = await tx.campaignRun.findUnique({
        where: { id: runId },
        include: {
          campaign: {
            include: { workspace: { select: { ownerUserId: true } } },
          },
        },
      });
      if (!run || run.status !== 'RUNNING') return;

      const grouped = await tx.campaignRow.groupBy({
        by: ['status'],
        where: { campaignRunId: run.id },
        _count: { _all: true },
      });
      const count = new Map(
        grouped.map((entry) => [entry.status, entry._count._all]),
      );
      const unfinished =
        (count.get('PENDING') ?? 0) + (count.get('PROCESSING') ?? 0);
      if (unfinished) return;

      if (count.get('RECONCILIATION_REQUIRED')) {
        await tx.campaignRun.update({
          where: { id: run.id },
          data: { status: 'PAUSED' },
        });
        await tx.campaign.update({
          where: { id: run.campaignId },
          data: { status: 'PAUSED' },
        });
        return;
      }

      const failedCount = count.get('FAILED') ?? 0;
      const refund = Number(run.unitPrice) * failedCount;
      if (refund > 0) {
        await this.walletLedgerService.credit(
          tx,
          {
            ownerUserId: run.campaign.workspace.ownerUserId,
            workspaceId: run.campaign.workspaceId,
            amount: refund,
            type: 'CAMPAIGN_REFUND',
            sourceType: 'CAMPAIGN_RUN',
            sourceId: run.id,
            createdBy: run.operatorUserId,
            note: `Campaign run refund for ${failedCount} failed message(s)`,
          },
          'totalRefund',
        );
      }

      await tx.campaignRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalRefunded: refund,
        },
      });
      await tx.campaign.update({
        where: { id: run.campaignId },
        data: {
          status: 'COMPLETED',
          lastRunAt: new Date(),
          unitPriceAtCreate: run.unitPrice,
        },
      });
    });
    const run = await this.prismaService.campaignRun.findUnique({
      where: { id: runId },
    });
    if (run) await this.syncCampaignCounters(run.campaignId);
  }

  private async debitWallet(params: {
    ownerUserId: string;
    workspaceId: string;
    amount: number;
    type: WalletTransactionType;
    sourceType: string;
    sourceId: string;
    createdBy: string;
    note: string;
  }): Promise<string> {
    return this.prismaService.$transaction(async (tx) => {
      return this.walletLedgerService.debit(tx, {
        ownerUserId: params.ownerUserId,
        workspaceId: params.workspaceId,
        amount: params.amount,
        type: params.type,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        createdBy: params.createdBy,
        note: params.note,
      });
    });
  }

  private async creditWallet(params: {
    ownerUserId: string;
    workspaceId: string;
    amount: number;
    type: WalletTransactionType;
    sourceType: string;
    sourceId: string;
    createdBy: string;
    note: string;
  }): Promise<void> {
    if (params.amount <= 0) return;

    await this.prismaService.$transaction(async (tx) => {
      await this.walletLedgerService.credit(
        tx,
        {
          ownerUserId: params.ownerUserId,
          workspaceId: params.workspaceId,
          amount: params.amount,
          type: params.type,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          createdBy: params.createdBy,
          note: params.note,
        },
        'totalRefund',
      );
    });
  }

  private async syncCampaignCounters(campaignId: string) {
    const grouped = await this.prismaService.campaignRow.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });

    const countByStatus = new Map(
      grouped.map((g) => [g.status, g._count._all]),
    );
    const totalData = [...countByStatus.values()].reduce((a, b) => a + b, 0);
    const unitPriceRow = await this.prismaService.campaign.findUnique({
      where: { id: campaignId },
      select: { unitPriceAtCreate: true },
    });
    const unitPrice = Number(unitPriceRow?.unitPriceAtCreate ?? 0);

    await this.prismaService.campaign.update({
      where: { id: campaignId },
      data: {
        totalData,
        totalValid: totalData,
        totalInvalid: 0,
        totalPending:
          (countByStatus.get('PENDING') ?? 0) +
          (countByStatus.get('PROCESSING') ?? 0) +
          (countByStatus.get('RECONCILIATION_REQUIRED') ?? 0),
        totalSuccess: countByStatus.get('SUCCESS') ?? 0,
        totalFailed: countByStatus.get('FAILED') ?? 0,
        estimatedTotalAmount:
          unitPrice *
          ((countByStatus.get('PENDING') ?? 0) +
            (countByStatus.get('PROCESSING') ?? 0) +
            (countByStatus.get('RECONCILIATION_REQUIRED') ?? 0)),
      },
    });
  }

  private async getCampaignContext(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignContext> {
    const campaign = await this.prismaService.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: {
        template: {
          select: {
            id: true,
            status: true,
            providerTemplateId: true,
            placeholdersJson: true,
            placeholder_labels: true,
            unitPricePerMessage: true,
            ctaButtons: { select: { unitPrice: true, defaultUnitPrice: true } },
            oaConnectionId: true,
          },
        },
        workspace: {
          select: { ownerUserId: true, status: true },
        },
      },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    return campaign;
  }

  private async getCampaignContextById(
    campaignId: string,
  ): Promise<CampaignContext> {
    const campaign = await this.prismaService.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: {
          select: {
            id: true,
            status: true,
            providerTemplateId: true,
            placeholdersJson: true,
            placeholder_labels: true,
            unitPricePerMessage: true,
            ctaButtons: { select: { unitPrice: true, defaultUnitPrice: true } },
            oaConnectionId: true,
          },
        },
        workspace: { select: { ownerUserId: true, status: true } },
      },
    });
    if (!campaign) throw new BadRequestException('Campaign not found');
    return campaign;
  }

  private async findCampaignOrThrow(workspaceId: string, campaignId: string) {
    const campaign = await this.prismaService.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }
    return campaign;
  }

  private async getApprovedTemplateOrThrow(
    workspaceId: string,
    templateId: string,
  ) {
    const template = await this.prismaService.template.findFirst({
      where: { id: templateId, workspaceId, status: 'APPROVED' },
      select: {
        id: true,
        oaConnectionId: true,
        providerTemplateId: true,
        unitPricePerMessage: true,
        ctaButtons: { select: { unitPrice: true, defaultUnitPrice: true } },
      },
    });

    if (!template) {
      throw new BadRequestException('Template not found or not approved');
    }
    if (!template.providerTemplateId) {
      throw new BadRequestException(
        'Template is missing Zalo providerTemplateId',
      );
    }

    // template.oaConnectionId references WorkspaceOa.id (ADR-001); the Zalo
    // connection is reached via workspaceOaId.
    const oa = await this.prismaService.workspaceOaConnection.findUnique({
      where: { workspaceOaId: template.oaConnectionId },
      select: { status: true },
    });
    if (!oa || oa.status !== 'CONNECTED') {
      throw new BadRequestException('OA is not connected');
    }

    return template;
  }

  private async resolveTemplateDispatchUnitPrice(template: {
    unitPricePerMessage: Prisma.Decimal | null;
    ctaButtons: { unitPrice: number | null; defaultUnitPrice: number | null }[];
  }): Promise<number> {
    return (
      (await this.systemConfigService.resolveTemplateUnitPrice(
        template.unitPricePerMessage,
      )) +
      template.ctaButtons.reduce(
        (sum, button) =>
          sum + (button.unitPrice ?? button.defaultUnitPrice ?? 0),
        0,
      )
    );
  }

  private assertCanImport(campaign: CampaignContext) {
    if (campaign.status === 'RUNNING') {
      throw new BadRequestException('Cannot import while campaign is running');
    }
    if (campaign.status === 'CANCELLED') {
      throw new BadRequestException('Campaign is cancelled');
    }
    if (campaign.lastRunAt != null) {
      throw new BadRequestException(
        'Cannot re-import CSV after campaign has been executed',
      );
    }
  }

  private assertCanRun(campaign: CampaignContext) {
    if (campaign.status === 'CANCELLED') {
      throw new BadRequestException('Campaign is cancelled');
    }
    if (campaign.status === 'RUNNING') {
      throw new BadRequestException('Campaign is already running');
    }
    if (campaign.workspace.status !== 'ACTIVE') {
      throw new BadRequestException('Workspace is not active');
    }
    if (campaign.template.status !== 'APPROVED') {
      throw new BadRequestException('Template is not approved');
    }
    if (!campaign.template.providerTemplateId) {
      throw new BadRequestException(
        'Template is missing Zalo providerTemplateId',
      );
    }
  }

  private async getOwnerWalletOrThrow(ownerUserId: string) {
    const wallet = await this.prismaService.walletAccount.findUnique({
      where: { ownerUserId },
      select: { ownerUserId: true, balance: true },
    });
    if (!wallet) {
      throw new BadRequestException('Wallet not initialized');
    }
    return wallet;
  }

  private campaignInclude() {
    return {
      template: {
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          unitPricePerMessage: true,
          ctaButtons: { select: { unitPrice: true, defaultUnitPrice: true } },
        },
      },
      // oaConnection is the WorkspaceOa profile (ADR-001); Zalo identifiers live
      // on its nested connection row.
      oaConnection: {
        select: {
          id: true,
          connection: {
            select: { oaId: true, oaName: true, status: true },
          },
        },
      },
    };
  }

  /** Flatten WorkspaceOa + its Zalo connection into the legacy oaConnection shape. */
  private flattenCampaignOa<
    T extends {
      oaConnection: {
        id: string;
        connection: {
          oaId: string;
          oaName: string | null;
          status: OaConnectionStatus;
        } | null;
      } | null;
    },
  >(campaign: T) {
    const { oaConnection, ...rest } = campaign;
    return {
      ...rest,
      oaConnection: oaConnection
        ? {
            id: oaConnection.id,
            oaId: oaConnection.connection?.oaId ?? null,
            oaName: oaConnection.connection?.oaName ?? null,
            status:
              oaConnection.connection?.status ??
              ('NOT_CONNECTED' satisfies OaConnectionStatus),
          }
        : null,
    };
  }
}
