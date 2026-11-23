import { BadRequestException } from '@nestjs/common';
import { SubscriptionAccessService } from './subscription-access.service';

const NOW = new Date('2026-11-23T00:00:00Z');
const PLAN = { id: 'plan-1', code: 'ZBS-PRO', name: 'ZBS PRO' };

function build(
  periods: { startsAt: Date; endsAt: Date }[],
  anyActive = periods.length > 0,
) {
  const prisma = {
    workspaceSubscription: {
      findMany: jest
        .fn()
        .mockResolvedValue(periods.map((p) => ({ ...p, plan: PLAN }))),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.startsAt) {
          const hit = periods.some((p) => p.startsAt <= NOW && p.endsAt > NOW);
          return Promise.resolve(hit ? { id: 'x' } : null);
        }
        return Promise.resolve(anyActive ? { id: 'x' } : null);
      }),
    },
  };
  return new SubscriptionAccessService(prisma as never);
}

describe('SubscriptionAccessService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('reports NONE when the workspace never had a plan', async () => {
    const status = await build([]).getStatus('ws-1', NOW);
    expect(status).toMatchObject({ status: 'NONE', canSend: false });
  });

  it('reports EXPIRED with the expiry date', async () => {
    const endsAt = new Date('2026-10-01T00:00:00Z');
    const status = await build([
      { startsAt: new Date('2025-10-01T00:00:00Z'), endsAt },
    ]).getStatus('ws-1', NOW);
    expect(status).toMatchObject({
      status: 'EXPIRED',
      canSend: false,
      expiredAt: endsAt,
    });
  });

  it('reports ACTIVE and joins stacked periods into one end date', async () => {
    const status = await build([
      {
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2027-01-01T00:00:00Z'),
      },
      {
        startsAt: new Date('2027-01-01T00:00:00Z'),
        endsAt: new Date('2028-01-01T00:00:00Z'),
      },
    ]).getStatus('ws-1', NOW);
    expect(status.status).toBe('ACTIVE');
    expect(status.canSend).toBe(true);
    expect(status.endsAt?.toISOString()).toBe('2028-01-01T00:00:00.000Z');
    expect(status.plan).toEqual(PLAN);
  });

  it('blocks sending with SUBSCRIPTION_REQUIRED when there is no plan', async () => {
    const error = await build([])
      .assertCanSend('ws-1')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('blocks sending with SUBSCRIPTION_EXPIRED when the plan expired', async () => {
    const error = await build([
      {
        startsAt: new Date('2025-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-01T00:00:00Z'),
      },
    ])
      .assertCanSend('ws-1')
      .catch((e: unknown) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'SUBSCRIPTION_EXPIRED',
    });
  });

  it('allows sending while a period is running', async () => {
    await expect(
      build([
        {
          startsAt: new Date('2026-01-01T00:00:00Z'),
          endsAt: new Date('2027-01-01T00:00:00Z'),
        },
      ]).assertCanSend('ws-1'),
    ).resolves.toBeUndefined();
  });
});
