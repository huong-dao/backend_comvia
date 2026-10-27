import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZaloDeliveryWebhookService } from './zalo-delivery-webhook.service';

describe('ZaloDeliveryWebhookService', () => {
  type DeliveryEventData = {
    providerMessageId: string;
    trackingId: string;
    messageLogId: string;
  };
  let createdEventData: DeliveryEventData | undefined;
  const tx = {
    messageLog: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    zaloDeliveryEvent: {
      create: jest.fn((args: { data: DeliveryEventData }) => {
        createdEventData = args.data;
        return Promise.resolve({ id: 'event-1' });
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async <T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> =>
        callback(tx),
    ),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'zalo.appId': 'zalo-app',
        'zalo.deliveryWebhookToken': 'relay-secret',
      };
      return values[key];
    }),
  };
  const service = new ZaloDeliveryWebhookService(
    prisma as never,
    config as never,
  );
  const payload = {
    sender: { id: 'oa-1' },
    recipient: { id: '84901234567' },
    event_name: 'user_received_message',
    message: {
      msg_id: 'provider-msg-1',
      tracking_id: 'tracking-1',
      delivery_time: '1720000000000',
    },
    app_id: 'zalo-app',
    timestamp: '1720000001000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createdEventData = undefined;
    tx.messageLog.findFirst.mockResolvedValue({
      id: 'log-1',
      providerTrackingId: 'tracking-1',
      oaConnection: { connection: { oaId: 'oa-1' } },
    });
    tx.messageLog.update.mockResolvedValue({});
  });

  it('persists a matching delivery event and updates the message log', async () => {
    await expect(
      service.handleDelivery(payload, 'Bearer relay-secret'),
    ).resolves.toEqual({ ok: true, duplicate: false, eventId: 'event-1' });

    expect(createdEventData?.providerMessageId).toBe('provider-msg-1');
    expect(createdEventData?.trackingId).toBe('tracking-1');
    expect(createdEventData?.messageLogId).toBe('log-1');
    expect(tx.messageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { providerDeliveredAt: new Date(1720000000000) },
      }),
    );
  });

  it('rejects an unauthenticated payload before it reaches the database', async () => {
    await expect(service.handleDelivery(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects payloads that do not match the original OA or tracking ID', async () => {
    await expect(
      service.handleDelivery(
        { ...payload, message: { ...payload.message, tracking_id: 'other' } },
        'Bearer relay-secret',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.zaloDeliveryEvent.create).not.toHaveBeenCalled();
  });

  it('treats a duplicate provider message/event pair as idempotent', async () => {
    tx.zaloDeliveryEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.handleDelivery(payload, 'Bearer relay-secret'),
    ).resolves.toEqual({ ok: true, duplicate: true });
  });
});
