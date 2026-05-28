import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageStatus, Prisma, SendType } from '@prisma/client';
import { OaMessagingService } from '../oa/oa-messaging.service';
import { PrismaService } from '../prisma/prisma.service';

type PublicRequestContext = {
  workspaceId: string;
};

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly oaMessagingService: OaMessagingService,
  ) {}

  async listApprovedTemplates(ctx: PublicRequestContext) {
    return this.prismaService.template.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: 'APPROVED',
      },
      select: {
        id: true,
        name: true,
        code: true,
        placeholdersJson: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApprovedTemplate(ctx: PublicRequestContext, templateId: string) {
    const template = await this.prismaService.template.findFirst({
      where: {
        id: templateId,
        workspaceId: ctx.workspaceId,
        status: 'APPROVED',
      },
      select: {
        id: true,
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
        workspaceId: true,
        status: true,
        oaConnectionId: true,
        content: true,
        providerTemplateId: true,
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

    const oa = await this.prismaService.workspaceOaConnection.findUnique({
      where: { id: template.oaConnectionId },
      select: { id: true, status: true },
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

    const unitCost = 1000;

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
        oaConnectionId: oa.id,
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
          oaConnectionId: oa.id,
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
      await tx.walletAccount.update({
        where: { ownerUserId: workspace.ownerUserId },
        data: {
          balance: { decrement: unitCost },
          totalSpent: { increment: unitCost },
        },
      });

      const walletTransaction = await tx.walletTransaction.create({
        data: {
          transactionCode: `WT_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          ownerUserId: workspace.ownerUserId,
          workspaceId: workspace.id,
          type: 'MESSAGE_DEBIT',
          amount: unitCost,
          balanceBefore: Number(wallet.balance),
          balanceAfter: Number(wallet.balance) - unitCost,
          sourceType: 'PUBLIC_SEND',
          sourceId: template.id,
          createdBy: null,
          note: 'ZNS public send',
        },
        select: { id: true },
      });

      const messageLog = await tx.messageLog.create({
        data: {
          workspaceId: workspace.id,
          oaConnectionId: oa.id,
          templateId: template.id,
          sendType: 'SINGLE' satisfies SendType,
          phoneNumber: dto.phoneNumber,
          payloadSnapshot,
          status: 'SUCCESS' satisfies MessageStatus,
          providerMessageId: dispatchResult.providerMessageId,
          costAtTime: unitCost,
          walletTransactionId: walletTransaction.id,
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
}
