import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  MessageStatus,
  SendType,
  WalletTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendSingleDto } from './dto/send-single.dto';

@Injectable()
export class MessagingService {
  constructor(private readonly prismaService: PrismaService) {}

  async sendSingle(
    workspaceId: string,
    operatorUserId: string,
    dto: SendSingleDto,
  ) {
    const template = await this.prismaService.template.findFirst({
      where: { id: dto.templateId, workspaceId, status: 'APPROVED' },
      select: { id: true, oaConnectionId: true, status: true },
    });

    if (!template) {
      throw new BadRequestException('Template not found or not approved');
    }

    const oa = await this.prismaService.workspaceOaConnection.findUnique({
      where: { id: template.oaConnectionId },
      select: { id: true, status: true },
    });

    if (!oa || oa.status !== 'CONNECTED') {
      throw new BadRequestException('OA is not connected');
    }

    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!workspace || workspace.status !== 'ACTIVE') {
      throw new BadRequestException('Workspace is not active');
    }

    const wallet = await this.prismaService.walletAccount.findUnique({
      where: { ownerUserId: workspace.ownerUserId },
      select: { ownerUserId: true, balance: true },
    });
    if (!wallet) {
      throw new BadRequestException('Wallet not initialized');
    }

    const unitCost = 1000;
    const walletBefore = Number(wallet.balance);
    if (walletBefore < unitCost) {
      throw new BadRequestException('Insufficient credit');
    }

    const providerMessageId = `mock_msg_${Date.now()}`;

    const payloadSnapshot: Prisma.InputJsonValue = {
      templateId: template.id,
      phoneNumber: dto.phoneNumber,
      data: dto.data,
    } as Prisma.InputJsonValue;

    return this.prismaService.$transaction(async (tx) => {
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          transactionCode: `WT_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          ownerUserId: workspace.ownerUserId,
          workspaceId: workspace.id,
          type: 'MESSAGE_DEBIT' satisfies WalletTransactionType,
          amount: unitCost,
          balanceBefore: walletBefore,
          balanceAfter: walletBefore - unitCost,
          sourceType: 'MESSAGE_LOG',
          sourceId: template.id,
          createdBy: operatorUserId,
          note: 'Mock send single',
        },
      });

      await tx.walletAccount.update({
        where: { ownerUserId: workspace.ownerUserId },
        data: {
          balance: { decrement: unitCost },
        },
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
          providerMessageId,
          costAtTime: unitCost,
          walletTransactionId: walletTransaction.id,
          operatorUserId,
          sentAt: new Date(),
        },
      });

      return {
        status: messageLog.status,
        providerMessageId: messageLog.providerMessageId,
        messageLogId: messageLog.id,
      };
    });
  }

  listMessageLogs(
    workspaceId: string,
    status?: MessageStatus,
    sendType?: SendType,
    limit = 50,
  ) {
    return this.prismaService.messageLog.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
        ...(sendType ? { sendType } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  }
}
