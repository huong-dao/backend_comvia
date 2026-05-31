import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CampaignRowStatus,
  CampaignStatus,
  MessageStatus,
  Prisma,
  SendType,
  WalletTransactionType,
} from '@prisma/client';
import { OaMessagingService } from '../oa/oa-messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
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
    unitPricePerMessage: Prisma.Decimal | null;
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
    const unitPrice = await this.systemConfigService.resolveTemplateUnitPrice(
      template.unitPricePerMessage,
    );

    return this.prismaService.campaign.create({
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
    return this.prismaService.campaign.findUnique({
      where: { id: campaign.id },
      include: this.campaignInclude(),
    });
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

    return this.prismaService.campaign.update({
      where: { id: campaign.id },
      data: { name: dto.name },
      include: this.campaignInclude(),
    });
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
    return buildCsvTemplateContent(placeholders);
  }

  async importCsv(workspaceId: string, campaignId: string, csvText: string) {
    const campaign = await this.getCampaignContext(workspaceId, campaignId);
    this.assertCanImport(campaign);

    const placeholders = campaign.template.placeholdersJson as Record<
      string,
      unknown
    >;
    const parsed = parseCampaignCsv(csvText, placeholders);
    if (parsed.errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: parsed.errors,
      });
    }

    const unitPrice = await this.systemConfigService.resolveTemplateUnitPrice(
      campaign.template.unitPricePerMessage,
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

    return this.runSendBatch({
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

    return this.runSendBatch({
      campaign,
      rows,
      operatorUserId,
      note: 'Campaign retry failed rows',
      isRetry: true,
    });
  }

  private async runSendBatch(params: {
    campaign: CampaignContext;
    rows: { id: string; phoneNumber: string; payloadData: Prisma.JsonValue }[];
    operatorUserId: string;
    note: string;
    isRetry?: boolean;
  }) {
    const { campaign, rows, operatorUserId, note, isRetry } = params;
    const unitPrice = await this.systemConfigService.resolveTemplateUnitPrice(
      campaign.template.unitPricePerMessage,
    );
    const totalCharge = unitPrice * rows.length;

    const wallet = await this.getOwnerWalletOrThrow(
      campaign.workspace.ownerUserId,
    );
    const balanceBefore = Number(wallet.balance);
    if (balanceBefore < totalCharge) {
      throw new BadRequestException(
        'Insufficient credit. Please top up your wallet before sending.',
      );
    }

    await this.prismaService.campaign.update({
      where: { id: campaign.id },
      data: { status: 'RUNNING' satisfies CampaignStatus },
    });

    let holdTransactionId: string | undefined;
    try {
      holdTransactionId = await this.debitWallet({
        ownerUserId: campaign.workspace.ownerUserId,
        workspaceId: campaign.workspaceId,
        amount: totalCharge,
        type: 'CAMPAIGN_HOLD' satisfies WalletTransactionType,
        sourceType: 'CAMPAIGN',
        sourceId: campaign.id,
        createdBy: operatorUserId,
        note,
      });
    } catch (error) {
      await this.prismaService.campaign.update({
        where: { id: campaign.id },
        data: {
          status:
            campaign.lastRunAt == null
              ? ('READY' satisfies CampaignStatus)
              : ('COMPLETED' satisfies CampaignStatus),
        },
      });
      throw error;
    }

    let failedCount = 0;

    for (const row of rows) {
      const result = await this.sendOneRow({
        campaign,
        row,
        unitPrice,
        operatorUserId,
        isRetry: !!isRetry,
      });
      if (!result.success) {
        failedCount++;
      }
    }

    if (failedCount > 0) {
      await this.creditWallet({
        ownerUserId: campaign.workspace.ownerUserId,
        workspaceId: campaign.workspaceId,
        amount: unitPrice * failedCount,
        type: 'CAMPAIGN_REFUND' satisfies WalletTransactionType,
        sourceType: 'CAMPAIGN',
        sourceId: campaign.id,
        createdBy: operatorUserId,
        note: `${note} refund for ${failedCount} failed message(s)`,
      });
    }

    await this.syncCampaignCounters(campaign.id);

    const updated = await this.prismaService.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'COMPLETED' satisfies CampaignStatus,
        lastRunAt: new Date(),
        unitPriceAtCreate: unitPrice,
      },
      include: this.campaignInclude(),
    });

    return {
      campaign: updated,
      holdTransactionId,
      sentCount: rows.length - failedCount,
      failedCount,
      unitPrice,
      totalCharged: totalCharge,
      totalRefunded: unitPrice * failedCount,
    };
  }

  private async sendOneRow(params: {
    campaign: CampaignContext;
    row: { id: string; phoneNumber: string; payloadData: Prisma.JsonValue };
    unitPrice: number;
    operatorUserId: string;
    isRetry: boolean;
  }): Promise<{ success: boolean }> {
    const { campaign, row, unitPrice, operatorUserId, isRetry } = params;
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
          retryCount: isRetry ? { increment: 1 } : undefined,
        },
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Zalo ZNS send failed';

      const messageLog = await this.prismaService.messageLog.create({
        data: {
          workspaceId: campaign.workspaceId,
          oaConnectionId: campaign.oaConnectionId,
          templateId: campaign.templateId,
          sendType: 'CAMPAIGN' satisfies SendType,
          phoneNumber: row.phoneNumber,
          payloadSnapshot,
          status: 'FAILED' satisfies MessageStatus,
          errorCode: errorMessage.slice(0, 255),
          costAtTime: unitPrice,
          operatorUserId,
        },
      });

      await this.prismaService.campaignRow.update({
        where: { id: row.id },
        data: {
          status: 'FAILED' satisfies CampaignRowStatus,
          failureReason: errorMessage.slice(0, 500),
          messageLogId: messageLog.id,
          retryCount: isRetry ? { increment: 1 } : undefined,
        },
      });

      return { success: false };
    }
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
      const wallet = await tx.walletAccount.findUnique({
        where: { ownerUserId: params.ownerUserId },
      });
      if (!wallet) {
        throw new BadRequestException('Wallet not initialized');
      }

      const balanceBefore = Number(wallet.balance);
      if (balanceBefore < params.amount) {
        throw new BadRequestException(
          'Insufficient credit. Please top up your wallet before sending.',
        );
      }

      const balanceAfter = balanceBefore - params.amount;
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          transactionCode: this.newTransactionCode(),
          ownerUserId: params.ownerUserId,
          workspaceId: params.workspaceId,
          type: params.type,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          createdBy: params.createdBy,
          note: params.note,
        },
      });

      await tx.walletAccount.update({
        where: { ownerUserId: params.ownerUserId },
        data: {
          balance: { decrement: params.amount },
          totalSpent: { increment: params.amount },
        },
      });

      return walletTransaction.id;
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
      const wallet = await tx.walletAccount.findUnique({
        where: { ownerUserId: params.ownerUserId },
      });
      if (!wallet) {
        throw new BadRequestException('Wallet not initialized');
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + params.amount;

      await tx.walletTransaction.create({
        data: {
          transactionCode: this.newTransactionCode(),
          ownerUserId: params.ownerUserId,
          workspaceId: params.workspaceId,
          type: params.type,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          createdBy: params.createdBy,
          note: params.note,
        },
      });

      await tx.walletAccount.update({
        where: { ownerUserId: params.ownerUserId },
        data: {
          balance: { increment: params.amount },
          totalRefund: { increment: params.amount },
        },
      });
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
        totalPending: countByStatus.get('PENDING') ?? 0,
        totalSuccess: countByStatus.get('SUCCESS') ?? 0,
        totalFailed: countByStatus.get('FAILED') ?? 0,
        estimatedTotalAmount: unitPrice * (countByStatus.get('PENDING') ?? 0),
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
            unitPricePerMessage: true,
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

    const oa = await this.prismaService.workspaceOaConnection.findUnique({
      where: { id: template.oaConnectionId },
      select: { status: true },
    });
    if (!oa || oa.status !== 'CONNECTED') {
      throw new BadRequestException('OA is not connected');
    }

    return template;
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

  private newTransactionCode(): string {
    return `WT_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
        },
      },
      oaConnection: {
        select: { id: true, oaId: true, oaName: true, status: true },
      },
    };
  }
}
