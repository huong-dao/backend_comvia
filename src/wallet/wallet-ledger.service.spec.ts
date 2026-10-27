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
});
