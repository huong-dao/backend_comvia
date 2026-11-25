import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageStatus, Prisma, SendType } from '@prisma/client';
import { OaMessagingService } from '../oa/oa-messaging.service';
import { assertOtpPayloadData } from '../templates/otp-template.util';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  recordFailedMessage,
  withMessageLogId,
} from '../messaging/message-failure-log';
import {
  SEND_ERROR_CODES,
  type SendErrorCode,
} from '../messaging/send-error-messages';

type PublicRequestContext = {
  workspaceId: string;
};

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly oaMessagingService: OaMessagingService,
    private readonly walletLedgerService: WalletLedgerService,
    private readonly systemConfigService: SystemConfigService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  async listApprovedTemplates(ctx: PublicRequestContext) {
    await this.assertActiveWorkspace(ctx.workspaceId);
    return this.prismaService.template.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: 'APPROVED',
      },
      select: {
        id: true,
        type: true,
        placeholdersJson: true,
        name: true,
        code: true,
        title: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** `idOrCode` matches the template id or its workspace-unique code. */
  async getApprovedTemplate(ctx: PublicRequestContext, idOrCode: string) {
    await this.assertActiveWorkspace(ctx.workspaceId);
    const template = await this.prismaService.template.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
        workspaceId: ctx.workspaceId,
        status: 'APPROVED',
      },
      select: {
        id: true,
        type: true,
        name: true,
        code: true,
        title: true,
        placeholdersJson: true,
        placeholder_labels: true,
        placeholderOrder: true,
        status: true,
        oaConnectionId: true,
        providerTemplateId: true,
        content: true,
        secondaryContent: true,
        content2: true,
        secondaryContent2: true,
        otpExpiryMinutes: true,
        ctaButtons: {
          select: { type: true, label: true, target: true, position: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!template) {
      throw new BadRequestException('Template not found or not approved');
    }

    return template;
  }

  async sendSingle(
    ctx: PublicRequestContext,
    dto: {
      templateId?: string;
      templateCode?: string;
      phoneNumber: string;
      data: Record<string, unknown>;
    },
  ) {
    if (!dto.templateId && !dto.templateCode) {
      throw new BadRequestException('templateId or templateCode is required');
    }

    const template = await this.prismaService.template.findFirst({
      where: {
        ...(dto.templateId ? { id: dto.templateId } : {}),
        ...(dto.templateCode ? { code: dto.templateCode } : {}),
        workspaceId: ctx.workspaceId,
      },
      select: {
        id: true,
        type: true,
        workspaceId: true,
        status: true,
        oaConnectionId: true,
        content: true,
        providerTemplateId: true,
        unitPricePerMessage: true,
        ctaButtons: {
          select: { unitPrice: true, defaultUnitPrice: true },
        },
      },
    });

    if (!template) {
      // No template row means no FK target for a MessageLog: nothing to log against.
      throw new BadRequestException('Template not approved');
    }

    const payloadSnapshot: Prisma.InputJsonValue = {
      templateId: template.id,
      phoneNumber: dto.phoneNumber,
      data: dto.data,
    } as Prisma.InputJsonValue;

    let preflight: Awaited<ReturnType<PublicApiService['preflight']>>;
    try {
      preflight = await this.preflight(ctx, template, dto);
    } catch (error) {
      const failedLogId = await recordFailedMessage(this.prismaService, {
        workspaceId: ctx.workspaceId,
        oaConnectionId: template.oaConnectionId,
        templateId: template.id,
        sendType: 'SINGLE' satisfies SendType,
        phoneNumber: dto.phoneNumber,
        payloadSnapshot,
        error,
        operatorUserId: null,
      });
      throw withMessageLogId(error, failedLogId);
    }
    const { workspace, unitCost } = preflight;

    let dispatchResult: Awaited<
      ReturnType<OaMessagingService['dispatchZnsTemplate']>
    >;
    try {
      dispatchResult = await this.oaMessagingService.dispatchZnsTemplate({
        oaConnectionId: template.oaConnectionId,
        phoneNumber: dto.phoneNumber,
        providerTemplateId: template.providerTemplateId!,
        templateData: dto.data,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Zalo ZNS send failed';

      const failedLogId = await recordFailedMessage(this.prismaService, {
        workspaceId: workspace.id,
        oaConnectionId: template.oaConnectionId,
        templateId: template.id,
        sendType: 'SINGLE' satisfies SendType,
        phoneNumber: dto.phoneNumber,
        payloadSnapshot,
        error,
        operatorUserId: null,
      });

      throw new BadRequestException({
        message: errorMessage,
        messageLogId: failedLogId,
      });
    }

    const result = await this.prismaService.$transaction(async (tx) => {
      const walletTransactionId = await this.walletLedgerService.debit(tx, {
        ownerUserId: workspace.ownerUserId,
        workspaceId: workspace.id,
        amount: unitCost,
        type: 'MESSAGE_DEBIT',
        sourceType: 'PUBLIC_SEND',
        sourceId: template.id,
        createdBy: null,
        note: 'ZNS public send',
      });

      const messageLog = await tx.messageLog.create({
        data: {
          workspaceId: workspace.id,
          oaConnectionId: template.oaConnectionId,
          templateId: template.id,
          sendType: 'SINGLE' satisfies SendType,
          phoneNumber: dto.phoneNumber,
          payloadSnapshot,
          status: 'SUCCESS' satisfies MessageStatus,
          providerMessageId: dispatchResult.providerMessageId,
          providerTrackingId: dispatchResult.providerTrackingId,
          providerSentAt: dispatchResult.providerSentAt,
          providerQuotaDaily: dispatchResult.providerQuotaDaily,
          providerQuotaRemaining: dispatchResult.providerQuotaRemaining,
          costAtTime: unitCost,
          walletTransactionId,
          operatorUserId: null,
          sentAt: new Date(),
        },
      });

      return { messageLog };
    });

    return {
      status: 'success',
      message: 'Gửi tin nhắn thành công',
      providerMessageId: dispatchResult.providerMessageId,
      messageLogId: result.messageLog.id,
    };
  }

  /**
   * Every check that can reject a public send before Zalo is called. Messages
   * stay as they were for API clients; a stable `code` is added so the failure
   * can be logged and matched. The caller records it as a FAILED MessageLog.
   */
  private async preflight(
    ctx: PublicRequestContext,
    template: {
      type: string;
      status: string;
      oaConnectionId: string;
      providerTemplateId: string | null;
      unitPricePerMessage: Prisma.Decimal | null;
      ctaButtons: {
        unitPrice: number | null;
        defaultUnitPrice: number | null;
      }[];
    },
    dto: { data: Record<string, unknown> },
  ): Promise<{
    workspace: { id: string; ownerUserId: string };
    unitCost: number;
  }> {
    if (template.status !== 'APPROVED') {
      throw this.reject(
        SEND_ERROR_CODES.TEMPLATE_NOT_APPROVED,
        'Template not approved',
      );
    }

    if (!template.providerTemplateId) {
      throw this.reject(
        SEND_ERROR_CODES.TEMPLATE_NOT_SYNCED,
        'Template is missing Zalo providerTemplateId',
      );
    }

    if (template.type === 'OTP') {
      assertOtpPayloadData(dto.data);
    }

    // template.oaConnectionId references WorkspaceOa.id (ADR-001); the Zalo
    // connection is reached via workspaceOaId.
    const oa = await this.prismaService.workspaceOaConnection.findUnique({
      where: { workspaceOaId: template.oaConnectionId },
      select: { status: true },
    });
    if (!oa || oa.status !== 'CONNECTED') {
      throw this.reject(
        SEND_ERROR_CODES.OA_NOT_CONNECTED,
        'OA is not connected',
      );
    }

    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { id: true, status: true, ownerUserId: true },
    });
    if (!workspace || workspace.status !== 'ACTIVE') {
      throw this.reject(
        SEND_ERROR_CODES.WORKSPACE_INACTIVE,
        'Workspace is not active',
      );
    }

    // Subscription phải còn hạn mới được gửi.
    await this.subscriptionAccessService.assertCanSend(ctx.workspaceId);

    const unitCost =
      (await this.systemConfigService.resolveTemplateUnitPrice(
        template.unitPricePerMessage,
      )) +
      template.ctaButtons.reduce(
        (sum, button) =>
          sum + (button.unitPrice ?? button.defaultUnitPrice ?? 0),
        0,
      );

    const wallet = await this.prismaService.walletAccount.findUnique({
      where: { ownerUserId: workspace.ownerUserId },
      select: { ownerUserId: true, balance: true },
    });
    if (!wallet) {
      throw this.reject(
        SEND_ERROR_CODES.WALLET_NOT_INITIALIZED,
        'Wallet not initialized',
      );
    }

    if (Number(wallet.balance) < unitCost) {
      throw this.reject(
        SEND_ERROR_CODES.INSUFFICIENT_CREDIT,
        'Insufficient credit',
      );
    }

    return { workspace, unitCost };
  }

  /** 400 with the legacy English message plus a stable `code`. */
  private reject(code: SendErrorCode, message: string) {
    return new BadRequestException({
      statusCode: 400,
      message,
      error: 'Bad Request',
      code,
    });
  }

  private async assertActiveWorkspace(workspaceId: string) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
    if (!workspace || workspace.status !== 'ACTIVE') {
      throw new BadRequestException('Workspace is not active');
    }
  }
}
