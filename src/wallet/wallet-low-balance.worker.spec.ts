import { Prisma } from '@prisma/client';
import {
  startOfVietnamDay,
  WalletLowBalanceWorker,
} from './wallet-low-balance.worker';

const NOW = new Date('2026-11-23T05:00:00Z'); // 12:00 giờ VN

function build(opts: {
  threshold: number | null;
  wallets: Record<string, unknown>[];
  hasTransaction?: boolean;
  claimCount?: number;
}) {
  const prisma = {
    walletAccount: {
      findMany: jest.fn().mockResolvedValue(opts.wallets),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
      update: jest.fn(),
    },
    walletTransaction: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.hasTransaction === false ? null : { id: 't' }),
    },
  };
  const config = {
    getGeneralConfig: jest.fn().mockResolvedValue({
      subscriptionExpiryReminderDays: 7,
      walletLowBalanceThreshold: opts.threshold,
    }),
  };
  const email = {
    sendWalletLowBalanceEmail: jest.fn().mockResolvedValue(undefined),
    buildAppUrl: jest.fn().mockReturnValue('https://app/wallet'),
  };
  const worker = new WalletLowBalanceWorker(
    prisma as never,
    config as never,
    email as never,
  );
  return { worker, prisma, email };
}

const wallet = (extra: Record<string, unknown> = {}) => ({
  id: 'w-1',
  ownerUserId: 'owner-1',
  balance: new Prisma.Decimal(80_000),
  lowBalanceEmailSentAt: null,
  owner: { email: 'owner@example.com' },
  ...extra,
});

describe('startOfVietnamDay', () => {
  it('returns 00:00 Vietnam time of the current VN day', () => {
    expect(startOfVietnamDay(NOW).toISOString()).toBe(
      '2026-11-22T17:00:00.000Z',
    );
    // 20:00 UTC = 03:00 ngày hôm sau theo giờ VN
    expect(
      startOfVietnamDay(new Date('2026-11-23T20:00:00Z')).toISOString(),
    ).toBe('2026-11-23T17:00:00.000Z');
  });
});

describe('WalletLowBalanceWorker', () => {
  it('sends nothing when the threshold is not configured', async () => {
    const { worker, prisma, email } = build({ threshold: null, wallets: [] });
    await worker.sendDueReminders(NOW);
    expect(prisma.walletAccount.findMany).not.toHaveBeenCalled();
    expect(email.sendWalletLowBalanceEmail).not.toHaveBeenCalled();
  });

  it('emails the owner of a wallet at or below the threshold', async () => {
    const { worker, prisma, email } = build({
      threshold: 100_000,
      wallets: [wallet()],
    });

    await worker.sendDueReminders(NOW);

    expect(prisma.walletAccount.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'w-1' }),
      data: { lowBalanceEmailSentAt: NOW },
    });
    expect(email.sendWalletLowBalanceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        balance: 80_000,
        threshold: 100_000,
      }),
    );
  });

  it('does not email a wallet that has no transaction since the last reminder', async () => {
    const { worker, email } = build({
      threshold: 100_000,
      wallets: [wallet()],
      hasTransaction: false,
    });
    await worker.sendDueReminders(NOW);
    expect(email.sendWalletLowBalanceEmail).not.toHaveBeenCalled();
  });

  it('does not email twice when another instance already claimed the wallet today', async () => {
    const { worker, email } = build({
      threshold: 100_000,
      wallets: [wallet()],
      claimCount: 0,
    });
    await worker.sendDueReminders(NOW);
    expect(email.sendWalletLowBalanceEmail).not.toHaveBeenCalled();
  });

  it('releases the claim when the email fails so the next tick retries', async () => {
    const { worker, prisma, email } = build({
      threshold: 100_000,
      wallets: [wallet()],
    });
    email.sendWalletLowBalanceEmail.mockRejectedValue(new Error('smtp down'));

    await worker.sendDueReminders(NOW);

    expect(prisma.walletAccount.update).toHaveBeenCalledWith({
      where: { id: 'w-1' },
      data: { lowBalanceEmailSentAt: null },
    });
  });
});
