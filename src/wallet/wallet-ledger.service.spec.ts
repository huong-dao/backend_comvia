import { Prisma, WalletTransactionType } from '@prisma/client';
import { WalletLedgerService } from './wallet-ledger.service';

describe('WalletLedgerService', () => {
  const params = {
    ownerUserId: 'owner-1',
    workspaceId: 'workspace-1',
    amount: 60,
    type: WalletTransactionType.MESSAGE_DEBIT,
    sourceType: 'MESSAGE_LOG',
    sourceId: 'message-1',
  };

  it('serializes concurrent debits so the second cannot overdraw the wallet', async () => {
    let balance = new Prisma.Decimal(100);
    let waitForLock = Promise.resolve();
    const activeReleases: Array<() => void> = [];
    const entries: Array<{
      balanceBefore: Prisma.Decimal;
      balanceAfter: Prisma.Decimal;
    }> = [];
    type LedgerData = {
      balanceBefore: Prisma.Decimal;
      balanceAfter: Prisma.Decimal;
    };
    type WalletUpdate = { data: { balance: Prisma.Decimal } };

    const tx = {
      $queryRaw: jest.fn<Promise<Array<{ balance: Prisma.Decimal }>>, []>(
        async () => {
          const previousLock = waitForLock;
          let release: () => void = () => undefined;
          waitForLock = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previousLock;
          activeReleases.push(release);
          return [{ balance }];
        },
      ),
      walletTransaction: {
        create: jest.fn<Promise<{ id: string }>, [{ data: LedgerData }]>(
          ({ data }) => {
            entries.push(data);
            return Promise.resolve({ id: `transaction-${entries.length}` });
          },
        ),
      },
      walletAccount: {
        update: jest.fn<Promise<{ balance: Prisma.Decimal }>, [WalletUpdate]>(
          ({ data }) => {
            balance = data.balance;
            activeReleases.shift()?.();
            return Promise.resolve({ balance });
          },
        ),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new WalletLedgerService();

    const results = await Promise.allSettled([
      service.debit(tx, params),
      service.debit(tx, params),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results[1]?.status).toBe('rejected');
    expect(entries).toEqual([
      expect.objectContaining({
        balanceBefore: new Prisma.Decimal(100),
        balanceAfter: new Prisma.Decimal(40),
      }),
    ]);
    expect(balance).toEqual(new Prisma.Decimal(40));
  });

  it('writes the locked balance before and after a credit', async () => {
    const create = jest
      .fn<Promise<{ id: string }>, [{ data: unknown; select: { id: true } }]>()
      .mockResolvedValue({ id: 'topup-transaction' });
    const update = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ balance: new Prisma.Decimal(40) }]),
      walletTransaction: { create },
      walletAccount: { update },
    } as unknown as Prisma.TransactionClient;
    const service = new WalletLedgerService();

    await service.credit(
      tx,
      {
        ...params,
        amount: 25,
        type: WalletTransactionType.TOPUP_CREDIT,
        sourceType: 'TOPUP_REQUEST',
        sourceId: 'topup-1',
      },
      'totalTopup',
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { ownerUserId: 'owner-1' },
      data: {
        balance: new Prisma.Decimal(65),
        totalTopup: { increment: new Prisma.Decimal(25) },
      },
    });
  });

  it('reduces cumulative spending when refunding failed campaign rows', async () => {
    const update = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ balance: new Prisma.Decimal(40) }]),
      walletTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'refund-1' }),
      },
      walletAccount: { update },
    } as unknown as Prisma.TransactionClient;

    await new WalletLedgerService().credit(
      tx,
      { ...params, amount: 10, type: WalletTransactionType.CAMPAIGN_REFUND },
      'totalRefund',
    );

    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('WalletLedgerService.adjust (ISSUE-006 manual adjustment)', () => {
  const adjustParams = {
    ownerUserId: 'owner-1',
    workspaceId: 'workspace-1',
    amount: 40,
    type: WalletTransactionType.MANUAL_ADJUSTMENT,
    sourceType: 'ADMIN_ADJUSTMENT',
    sourceId: 'admin-1',
    createdBy: 'admin-1',
    note: 'Bank transfer received off-platform',
  };

  function buildTx(balance: Prisma.Decimal) {
    const create = jest
      .fn<Promise<{ id: string }>, [{ data: unknown; select: { id: true } }]>()
      .mockResolvedValue({ id: 'adjust-transaction' });
    const update = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ balance }]),
      walletTransaction: { create },
      walletAccount: { update },
    } as unknown as Prisma.TransactionClient;
    return { tx, create, update };
  }

  it('CREDIT increases only balance and leaves cumulative counters untouched', async () => {
    const { tx, create, update } = buildTx(new Prisma.Decimal(100));

    const result = await new WalletLedgerService().adjust(
      tx,
      adjustParams,
      'CREDIT',
    );

    expect(create).toHaveBeenCalledTimes(1);
    const createArg = create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).toMatchObject({
      type: WalletTransactionType.MANUAL_ADJUSTMENT,
      balanceBefore: new Prisma.Decimal(100),
      balanceAfter: new Prisma.Decimal(140),
    });
    expect(update).toHaveBeenCalledTimes(1);
    const updateArg = update.mock.calls[0][0] as {
      where: { ownerUserId: string };
      data: Record<string, unknown>;
    };
    expect(updateArg).toEqual({
      where: { ownerUserId: 'owner-1' },
      data: { balance: new Prisma.Decimal(140) },
    });
    // Core of ADR-004: no cumulative counter may be written.
    expect(updateArg.data).not.toHaveProperty('totalTopup');
    expect(updateArg.data).not.toHaveProperty('totalSpent');
    expect(updateArg.data).not.toHaveProperty('totalRefund');
    expect(result).toEqual({
      walletTransactionId: 'adjust-transaction',
      balanceBefore: new Prisma.Decimal(100),
      balanceAfter: new Prisma.Decimal(140),
    });
  });

  it('DEBIT with enough balance decreases only balance, no counters touched', async () => {
    const { tx, create, update } = buildTx(new Prisma.Decimal(100));

    const result = await new WalletLedgerService().adjust(
      tx,
      adjustParams,
      'DEBIT',
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    const updateArg = update.mock.calls[0][0] as {
      where: { ownerUserId: string };
      data: Record<string, unknown>;
    };
    expect(updateArg).toEqual({
      where: { ownerUserId: 'owner-1' },
      data: { balance: new Prisma.Decimal(60) },
    });
    expect(updateArg.data).not.toHaveProperty('totalTopup');
    expect(updateArg.data).not.toHaveProperty('totalSpent');
    expect(updateArg.data).not.toHaveProperty('totalRefund');
    expect(result.balanceBefore).toEqual(new Prisma.Decimal(100));
    expect(result.balanceAfter).toEqual(new Prisma.Decimal(60));
  });

  it('DEBIT past the balance rejects without writing a ledger entry or updating', async () => {
    const { tx, create, update } = buildTx(new Prisma.Decimal(30));

    await expect(
      new WalletLedgerService().adjust(tx, adjustParams, 'DEBIT'),
    ).rejects.toThrow('Insufficient credit');

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects when the wallet has not been initialized', async () => {
    const create = jest.fn();
    const update = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      walletTransaction: { create },
      walletAccount: { update },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new WalletLedgerService().adjust(tx, adjustParams, 'CREDIT'),
    ).rejects.toThrow('Wallet not initialized');

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
