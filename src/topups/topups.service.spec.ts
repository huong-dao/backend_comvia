import { Prisma, TopupStatus } from '@prisma/client';

jest.mock('../integrations/pay2s/pay2s.util', () => ({
  createPay2sCollectionLink: jest.fn(),
  verifyPay2sSignature: jest.fn(),
}));

import { TopupsService } from './topups.service';

describe('TopupsService callback lifecycle', () => {
  const topup = {
    id: 'topup-1',
    topupCode: 'COMVIA_TOPUP_1',
    ownerUserId: 'owner-1',
    workspaceId: 'workspace-1',
    status: TopupStatus.PENDING,
    amountExclVat: new Prisma.Decimal(100),
    vatAmount: new Prisma.Decimal(10),
    amountInclVat: new Prisma.Decimal(110),
  };

  function createService() {
    const tx = {
      paymentCallbackLog: {
        create: jest.fn().mockResolvedValue({ id: 'callback-1' }),
      },
      topupRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      walletAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ balance: new Prisma.Decimal(0) }),
        update: jest.fn(),
      },
      walletTransaction: { create: jest.fn() },
      order: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', orderCode: 'ORD_1' }),
      },
      workspaceBillingProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      invoice: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const walletLedger = { lock: jest.fn() };
    const service = new TopupsService(
      prisma as never,
      {} as never,
      { write: jest.fn() } as never,
      walletLedger as never,
    );
    return { service, tx, walletLedger };
  }

  it('records the callback and only transitions a pending topup to paid', async () => {
    const { service, tx } = createService();

    await (service as any).creditTopupIfPending(
      topup,
      new Prisma.Decimal(110),
      'pay2s-event-1',
      'pay2s_ipn',
      { orderId: topup.topupCode },
    );

    expect(tx.paymentCallbackLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'pay2s-event-1',
          status: 'PAID',
        }),
      }),
    );
    expect(tx.topupRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: topup.id, status: 'PENDING' } }),
    );
  });

  it('records a verified failed callback and only fails a pending topup', async () => {
    const { service, tx } = createService();

    await (service as any).markTopupFailedIfPending(
      topup,
      'pay2s-event-2',
      'pay2s_ipn',
      { orderId: topup.topupCode, resultCode: 1 },
    );

    expect(tx.paymentCallbackLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'pay2s-event-2',
          status: 'FAILED',
        }),
      }),
    );
    expect(tx.topupRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: topup.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      }),
    );
  });

  it('does not process a duplicate provider event twice', async () => {
    const { service, tx } = createService();
    const duplicate = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype,
    ) as { code: string };
    duplicate.code = 'P2002';
    tx.paymentCallbackLog.create.mockRejectedValueOnce(duplicate);

    await (service as any).creditTopupIfPending(
      topup,
      new Prisma.Decimal(110),
      'pay2s-event-duplicate',
      'pay2s_ipn',
      { orderId: topup.topupCode },
    );

    expect(tx.topupRequest.updateMany).not.toHaveBeenCalled();
  });
});
