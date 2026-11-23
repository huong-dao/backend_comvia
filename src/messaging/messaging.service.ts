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
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { SendSingleDto } from './dto/send-single.dto';
import { assertOtpPayloadData } from '../templates/otp-template.util';
import {
  SEND_ERROR_CODES,
  SEND_SUCCESS_MESSAGE,
  sendErrorBody,
  toSendErrorBody,
} from './send-error-messages';
import { recordFailedMessage, withMessageLogId } from './message-failure-log';

type SendTemplate = {
  type: string;
  status: string;
  providerTemplateId: string | null;
  oaConnectionId: string;
  unitPricePerMessage: Prisma.Decimal | null;
  ctaButtons: { unitPrice: number | null; defaultUnitPrice: number | null }[];
};

@Injectable()
export class MessagingService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly oaMessagingService: OaMessagingService,
    private readonly systemConfigService: SystemConfigService,
    private readonly walletLedgerService: WalletLedgerService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  async sendSingle(
    workspaceId: string,
    operatorUserId: string,
    dto: SendSingleDto,
  ) {
    // Scoped by workspace only: an unapproved template must still resolve so
    // the rejection can be logged against it (MessageLog needs a templateId).
    const template = await this.prismaService.template.findFirst({
      where: { id: dto.templateId, workspaceId },
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
      // No template row means no FK target for a MessageLog: nothing to log against.
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.TEMPLATE_NOT_APPROVED),
      );
    }

    const payloadSnapshot: Prisma.InputJsonValue = {
      templateId: template.id,
      phoneNumber: dto.phoneNumber,
      data: dto.data,
    } as Prisma.InputJsonValue;

    let preflight: Awaited<ReturnType<MessagingService['preflight']>>;
    try {
      preflight = await this.preflight(workspaceId, template, dto);
    } catch (error) {
      const failedLogId = await recordFailedMessage(this.prismaService, {
        workspaceId,
        oaConnectionId: template.oaConnectionId,
        templateId: template.id,
        sendType: 'SINGLE' satisfies SendType,
        phoneNumber: dto.phoneNumber,
        payloadSnapshot,
        error,
        operatorUserId,
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
      const failedLogId = await recordFailedMessage(this.prismaService, {
        workspaceId: workspace.id,
        oaConnectionId: template.oaConnectionId,
        templateId: template.id,
        sendType: 'SINGLE' satisfies SendType,
        phoneNumber: dto.phoneNumber,
        payloadSnapshot,
        error,
        operatorUserId,
      });

      throw new BadRequestException({
        ...toSendErrorBody(error),
        messageLogId: failedLogId,
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

  /**
   * Every check that can reject a send before Zalo is called. Throws on the
   * first failure; the caller records it as a FAILED MessageLog.
   */
  private async preflight(
    workspaceId: string,
    template: SendTemplate,
    dto: SendSingleDto,
  ): Promise<{
    workspace: { id: string; ownerUserId: string };
    unitCost: number;
  }> {
    if (template.status !== 'APPROVED') {
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

    // Subscription phải còn hạn mới được gửi (kiểm tra trước khi đụng tới ví).
    await this.subscriptionAccessService.assertCanSend(workspaceId);

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
    if (Number(wallet.balance) < unitCost) {
      throw new BadRequestException(
        sendErrorBody(SEND_ERROR_CODES.INSUFFICIENT_CREDIT),
      );
    }

    return { workspace, unitCost };
  }

  listMessageLogs(
    workspaceId: string,
    status?: MessageStatus,
    sendType?: SendType,
    limit = 50,
    phoneNumber?: string,
  ) {
    const phoneFragment = this.toPhoneSearchFragment(phoneNumber);
    return this.prismaService.messageLog.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
        ...(sendType ? { sendType } : {}),
        ...(phoneFragment ? { phoneNumber: { contains: phoneFragment } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Chuẩn hóa chuỗi tìm kiếm SĐT: chỉ giữ chữ số, bỏ đầu số quốc gia 84 / số 0
   * đầu để khớp cả dạng +84… lẫn 0…, và giới hạn 9 số cuối.
   */
  private toPhoneSearchFragment(input?: string): string | undefined {
    const digits = input?.replace(/\D/g, '') ?? '';
    if (!digits) return undefined;
    let core = digits;
    if (core.startsWith('84') && core.length > 9) core = core.slice(2);
    else if (core.startsWith('0')) core = core.slice(1);
    if (!core) core = digits;
    return core.length > 9 ? core.slice(-9) : core;
  }
}
