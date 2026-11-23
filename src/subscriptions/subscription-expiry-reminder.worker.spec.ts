import { SubscriptionExpiryReminderWorker } from './subscription-expiry-reminder.worker';

const NOW = new Date('2026-11-23T00:00:00Z');

const candidate = {
  id: 'sub-1',
  workspaceId: 'ws-1',
  endsAt: new Date('2026-11-28T00:00:00Z'),
  plan: { name: 'ZBS PRO' },
  workspace: { name: 'Acme', owner: { email: 'owner@example.com' } },
};

function build(opts: { continued?: boolean; claimCount?: number } = {}) {
  const prisma = {
    workspaceSubscription: {
      findMany: jest.fn().mockResolvedValue([candidate]),
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.continued ? { id: 'next' } : null),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
      update: jest.fn(),
    },
  };
  const config = {
    getGeneralConfig: jest.fn().mockResolvedValue({
      subscriptionExpiryReminderDays: 7,
      walletLowBalanceThreshold: null,
    }),
  };
  const email = {
    sendSubscriptionExpiryReminderEmail: jest.fn().mockResolvedValue(undefined),
    buildAppUrl: jest.fn().mockReturnValue('https://app/subscription'),
  };
  const worker = new SubscriptionExpiryReminderWorker(
    prisma as never,
    config as never,
    email as never,
  );
  return { worker, prisma, email };
}

describe('SubscriptionExpiryReminderWorker', () => {
  it('looks ahead by the configured number of days', async () => {
    const { worker, prisma } = build();
    await worker.sendDueReminders(NOW);
    expect(prisma.workspaceSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiryReminderSentAt: null,
          endsAt: { gt: NOW, lte: new Date('2026-11-30T00:00:00Z') },
        }),
      }),
    );
  });

  it('emails the owner once and marks the period as reminded', async () => {
    const { worker, prisma, email } = build();
    await worker.sendDueReminders(NOW);
    expect(prisma.workspaceSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', expiryReminderSentAt: null },
      data: { expiryReminderSentAt: NOW },
    });
    expect(email.sendSubscriptionExpiryReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        planName: 'ZBS PRO',
        daysRemaining: 5,
      }),
    );
  });

  it('skips a period that is already continued by a stacked purchase', async () => {
    const { worker, email } = build({ continued: true });
    await worker.sendDueReminders(NOW);
    expect(email.sendSubscriptionExpiryReminderEmail).not.toHaveBeenCalled();
  });

  it('does not email when another instance claimed the reminder', async () => {
    const { worker, email } = build({ claimCount: 0 });
    await worker.sendDueReminders(NOW);
    expect(email.sendSubscriptionExpiryReminderEmail).not.toHaveBeenCalled();
  });

  it('releases the claim when sending fails', async () => {
    const { worker, prisma, email } = build();
    email.sendSubscriptionExpiryReminderEmail.mockRejectedValue(
      new Error('smtp down'),
    );
    await worker.sendDueReminders(NOW);
    expect(prisma.workspaceSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { expiryReminderSentAt: null },
    });
  });
});
