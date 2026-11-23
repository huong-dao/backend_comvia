import { Prisma } from '@prisma/client';
import { SubscriptionPaymentsService } from './subscription-payments.service';

const PURCHASE = {
  id: 'purchase-1',
  purchaseCode: 'COMVIA_SUB_AB12CD34',
  workspaceId: 'ws-1',
  ownerUserId: 'owner-1',
  planId: 'plan-1',
  planName: 'ZBS PRO',
  durationYears: 1,
  status: 'PENDING',
  amountExclVat: new Prisma.Decimal(2_000_000),
  vatPercent: new Prisma.Decimal(10),
  vatAmount: new Prisma.Decimal(200_000),
  amountInclVat: new Prisma.Decimal(2_200_000),
};

function build(
  opts: { latestEndsAt?: Date | null; updateCount?: number } = {},
) {
  const tx = {
    paymentCallbackLog: { create: jest.fn().mockResolvedValue({}) },
    subscriptionPurchase: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
    },
    workspaceSubscription: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _max: { endsAt: opts.latestEndsAt ?? null } }),
      create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    },
    order: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'order-1', orderCode: 'ORD_1' }),
    },
    walletAccount: { update: jest.fn() },
    walletTransaction: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    subscriptionPurchase: {
      findUnique: jest.fn().mockResolvedValue(PURCHASE),
    },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const audit = { write: jest.fn() };
  const service = new SubscriptionPaymentsService(
    prisma as never,
    audit as never,
  );
  return { service, tx, prisma, audit };
}

const bankTx = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    transferType: 'IN',
    transferAmount: 2_200_000,
    transactionNumber: 'FT123',
    content: 'COMVIASUBAB12CD34',
    ...overrides,
  }) as never;

describe('SubscriptionPaymentsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-23T00:00:00Z'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('activates a subscription and creates a SUBSCRIPTION order without touching the wallet', async () => {
    const { service, tx } = build();

    await service.handleBankTransaction(bankTx(), 'COMVIASUBAB12CD34');

    expect(tx.subscriptionPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'purchase-1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PAID', paymentRef: 'FT123' }),
    });
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'SUBSCRIPTION',
        orderCode: 'ORD_COMVIA_SUB_AB12CD34',
        subscriptionPurchaseId: 'purchase-1',
      }),
    });
    expect(tx.workspaceSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        planId: 'plan-1',
        purchaseId: 'purchase-1',
        durationDays: 365,
        startsAt: new Date('2026-11-23T00:00:00Z'),
        endsAt: new Date('2027-11-23T00:00:00Z'),
      }),
    });
    expect(tx.walletAccount.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('stacks the new period after the current one when time remains', async () => {
    const { service, tx } = build({
      latestEndsAt: new Date('2027-01-01T00:00:00Z'),
    });

    await service.handleBankTransaction(bankTx(), 'COMVIASUBAB12CD34');

    expect(tx.workspaceSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startsAt: new Date('2027-01-01T00:00:00Z'),
        endsAt: new Date('2028-01-01T00:00:00Z'),
      }),
    });
  });

  it('ignores a payment whose amount does not match the order', async () => {
    const { service, prisma } = build();

    await service.handleBankTransaction(
      bankTx({ transferAmount: 2_000_000 }),
      'COMVIASUBAB12CD34',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does nothing on a duplicate callback (already paid)', async () => {
    const { service, tx } = build({ updateCount: 0 });

    await service.handleBankTransaction(bankTx(), 'COMVIASUBAB12CD34');

    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.workspaceSubscription.create).not.toHaveBeenCalled();
  });

  it('does nothing when the callback event was already logged', async () => {
    const { service, tx } = build();
    tx.paymentCallbackLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await service.handleBankTransaction(bankTx(), 'COMVIASUBAB12CD34');

    expect(tx.subscriptionPurchase.updateMany).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });
});
