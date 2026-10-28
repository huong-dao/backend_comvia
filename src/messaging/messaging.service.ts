import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  MessageStatus,
  SendType,
  WalletTransactionType,
} from '@prisma/client';
import { OaMessagingService } from '../oa/oa-messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import { SendSingleDto } from './dto/send-single.dto';
import { assertOtpPayloadData } from '../templates/otp-template.util';
import {
  SEND_ERROR_CODES,
  SEND_SUCCESS_MESSAGE,
  sendErrorBody,
  toSendErrorBody,
} from './send-error-messages';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly oaMessagingService: OaMessagingService,
    private readonly systemConfigService: SystemConfigService,
    private readonly walletLedgerService: WalletLedgerService,
  ) {}

  async sendSingle(
    workspaceId: string,
    operatorUserId: string,
    dto: SendSingleDto,
  ) {
    const template = await this.prismaService.template.findFirst({
      where: { id: dto.templateId, workspaceId, status: 'APPROVED' },
      select: {
        id: true,
        type: true,
        placeholdersJson: true,
        oaConnectionId: true,
        status: true,
        providerTemplateId: true,
        unitPricePerMessage: true,
        ctaButtons: {
          select: { unitPrice: true, defaultUnitPrice: true },
        },
      },
    });

    if (!template) {
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.TEMPLATE_NOT_APPROVED),
      );
    }

    if (!template.providerTemplateId) {
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.TEMPLATE_NOT_SYNCED),
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
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.OA_NOT_CONNECTED),
      );
    }

    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!workspace || workspace.status !== 'ACTIVE') {
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.WORKSPACE_INACTIVE),
      );
    }

    const wallet = await this.prismaService.walletAccount.findUnique({
      where: { ownerUserId: workspace.ownerUserId },
      select: { ownerUserId: true, balance: true },
    });
    if (!wallet) {
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.WALLET_NOT_INITIALIZED),
      );
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
    const walletBefore = Number(wallet.balance);
    if (walletBefore < unitCost) {
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.INSUFFICIENT_CREDIT),
      );
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
          operatorUserId,
        },
      });

      throw new BadRequestException({
        ...toSendErrorBody(error),
        messageLogId: failedLog.id,
      });
    }

    return this.prismaService.$transaction(async (tx) => {
      const walletTransactionId = await this.walletLedgerService.debit(tx, {
        ownerUserId: workspace.ownerUserId,
        workspaceId: workspace.id,
        amount: unitCost,
        type: 'MESSAGE_DEBIT' satisfies WalletTransactionType,
        sourceType: 'MESSAGE_LOG',
        sourceId: template.id,
        createdBy: operatorUserId,
        note: 'ZNS send single',
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
          operatorUserId,
          sentAt: new Date(),
        },
      });

      return {
        status: messageLog.status,
        message: SEND_SUCCESS_MESSAGE,
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
