import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageStatus, Prisma, SendType } from '@prisma/client';
import { OaMessagingService } from '../oa/oa-messaging.service';
import { assertOtpPayloadData } from '../templates/otp-template.util';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';

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
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApprovedTemplate(ctx: PublicRequestContext, templateId: string) {
    await this.assertActiveWorkspace(ctx.workspaceId);
    const template = await this.prismaService.template.findFirst({
      where: {
        id: templateId,
        workspaceId: ctx.workspaceId,
        status: 'APPROVED',
      },
      select: {
        id: true,
        type: true,
        name: true,
        code: true,
        placeholdersJson: true,
        status: true,
        oaConnectionId: true,
        content: true,
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
      templateId: string;
      phoneNumber: string;
      data: Record<string, unknown>;
    },
  ) {
    const template = await this.prismaService.template.findFirst({
      where: {
        id: dto.templateId,
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

    if (!template || template.status !== 'APPROVED') {
      throw new BadRequestException('Template not approved');
    }

    if (!template.providerTemplateId) {
      throw new BadRequestException(
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
      throw new BadRequestException('OA is not connected');
    }

    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { id: true, status: true, ownerUserId: true },
    });

    if (!workspace || workspace.status !== 'ACTIVE') {
      throw new BadRequestException('Workspace is not active');
    }

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
      throw new BadRequestException('Wallet not initialized');
    }

    const balanceNumber = Number(wallet.balance);
    if (balanceNumber < unitCost) {
      throw new BadRequestException('Insufficient credit');
    }

    const payloadSnapshot: Prisma.InputJsonValue = {
      templateId: template.id,
      phoneNumber: dto.phoneNumber,
      data: dto.data,
    } as Prisma.InputJsonValue;

    let dispatchResult: Awaited<
      ReturnType<OaMessagingService['dispatchZnsTemplate']>
    >;
    try {
      dispatchResult = await this.oaMessagingService.dispatchZnsTemplate({
        oaConnectionId: template.oaConnectionId,
        phoneNumber: dto.phoneNumber,
        providerTemplateId: template.providerTemplateId,
        templateData: dto.data,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Zalo ZNS send failed';

      const failedLog = await this.prismaService.messageLog.create({
        data: {
          workspaceId: workspace.id,
          oaConnectionId: template.oaConnectionId,
          templateId: template.id,
          sendType: 'SINGLE' satisfies SendType,
          phoneNumber: dto.phoneNumber,
          payloadSnapshot,
          status: 'FAILED' satisfies MessageStatus,
          errorCode: errorMessage.slice(0, 255),
          operatorUserId: null,
        },
      });

      throw new BadRequestException({
        message: errorMessage,
        messageLogId: failedLog.id,
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
      providerMessageId: dispatchResult.providerMessageId,
      messageLogId: result.messageLog.id,
    };
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
