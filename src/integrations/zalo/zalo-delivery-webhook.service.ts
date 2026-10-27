import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

export type ZaloDeliveryWebhookPayload = {
  sender?: { id?: unknown };
  recipient?: { id?: unknown };
  event_name?: unknown;
  message?: {
    delivery_time?: unknown;
    msg_id?: unknown;
    tracking_id?: unknown;
  };
  app_id?: unknown;
  timestamp?: unknown;
};

@Injectable()
export class ZaloDeliveryWebhookService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async handleDelivery(
    payload: ZaloDeliveryWebhookPayload,
    authorization?: string,
  ) {
    this.assertRelayAuthorized(authorization);

    const appId = this.requiredString(payload.app_id, 'app_id');
    const configuredAppId = this.configService.getOrThrow<string>('zalo.appId');
    if (appId !== configuredAppId) {
      throw new BadRequestException('Unexpected Zalo app_id');
    }
    if (payload.event_name !== 'user_received_message') {
      throw new BadRequestException('Unsupported Zalo delivery event');
    }

    const providerMessageId = this.requiredString(
      payload.message?.msg_id,
      'message.msg_id',
    );
    const senderOaId = this.requiredString(payload.sender?.id, 'sender.id');
    const trackingId = this.optionalString(payload.message?.tracking_id);
    const deliveryTime = this.parseProviderTimestamp(
      payload.message?.delivery_time,
      'message.delivery_time',
    );

    try {
      return await this.prismaService.$transaction(async (tx) => {
        const messageLog = await tx.messageLog.findFirst({
          where: { providerMessageId },
          include: {
            oaConnection: {
              include: { connection: { select: { oaId: true } } },
            },
          },
        });
        if (!messageLog) {
          throw new BadRequestException('Unknown Zalo provider message');
        }
        if (messageLog.oaConnection.connection?.oaId !== senderOaId) {
          throw new BadRequestException(
            'Zalo sender OA does not match message',
          );
        }
        if (
          trackingId &&
          messageLog.providerTrackingId &&
          trackingId !== messageLog.providerTrackingId
        ) {
          throw new BadRequestException(
            'Zalo tracking ID does not match message',
          );
        }

        const event = await tx.zaloDeliveryEvent.create({
          data: {
            providerMessageId,
            trackingId,
            eventName: 'user_received_message',
            deliveryTime,
            appId,
            payloadJson: payload as Prisma.InputJsonValue,
            messageLogId: messageLog.id,
          },
        });
        await tx.messageLog.update({
          where: { id: messageLog.id },
          data: { providerDeliveredAt: deliveryTime },
        });

        return { ok: true, duplicate: false, eventId: event.id };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { ok: true, duplicate: true };
      }
      throw error;
    }
  }

  private assertRelayAuthorized(authorization?: string) {
    const configuredToken = this.configService.getOrThrow<string>(
      'zalo.deliveryWebhookToken',
    );
    const token = authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException(
        'Invalid Zalo delivery webhook authorization',
      );
    }

    const expected = Buffer.from(configuredToken);
    const received = Buffer.from(token);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException(
        'Invalid Zalo delivery webhook authorization',
      );
    }
  }

  private requiredString(value: unknown, field: string): string {
    const parsed = this.optionalString(value);
    if (!parsed) throw new BadRequestException(`Missing Zalo ${field}`);
    return parsed;
  }

  private optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private parseProviderTimestamp(value: unknown, field: string): Date {
    const raw =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    if (!/^\d+$/.test(raw)) {
      throw new BadRequestException(`Invalid Zalo ${field}`);
    }
    const timestamp = Number(raw);
    const milliseconds =
      timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
    const parsed = new Date(milliseconds);
    if (!Number.isSafeInteger(timestamp) || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid Zalo ${field}`);
    }
    return parsed;
  }
}
