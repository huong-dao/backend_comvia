import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

describe('WalletService.listTransactions', () => {
  let service: WalletService;
  const findMany = jest
    .fn<Promise<unknown>, [Prisma.WalletTransactionFindManyArgs]>()
    .mockResolvedValue([]);

  beforeEach(async () => {
    findMany.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: { walletTransaction: { findMany } },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('applies offset/limit as skip/take', async () => {
    await service.listTransactions('ws-1', { offset: 5, limit: 5 });

    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      take: 5,
    });
  });

  it('defaults to offset 0 / limit 20 when not provided', async () => {
    await service.listTransactions('ws-1', {});

    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('combines type filter with pagination', async () => {
    await service.listTransactions('ws-1', {
      type: WalletTransactionType.TOPUP_CREDIT,
      offset: 10,
      limit: 5,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        type: WalletTransactionType.TOPUP_CREDIT,
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 5,
    });
  });

  it('filters by a group of types via `in`', async () => {
    await service.listTransactions('ws-1', {
      types: [
        WalletTransactionType.TOPUP_CREDIT,
        WalletTransactionType.MESSAGE_DEBIT,
      ],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          type: {
            in: [
              WalletTransactionType.TOPUP_CREDIT,
              WalletTransactionType.MESSAGE_DEBIT,
            ],
          },
        },
      }),
    );
  });

  it('prefers `types` over `type` when both are sent', async () => {
    await service.listTransactions('ws-1', {
      type: WalletTransactionType.REVERSAL,
      types: [WalletTransactionType.TOPUP_CREDIT],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          type: { in: [WalletTransactionType.TOPUP_CREDIT] },
        },
      }),
    );
  });

  it('falls back to single `type` when `types` is empty', async () => {
    await service.listTransactions('ws-1', {
      type: WalletTransactionType.MESSAGE_DEBIT,
      types: [],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          type: WalletTransactionType.MESSAGE_DEBIT,
        },
      }),
    );
  });

  it('applies the status filter to the where clause when present', async () => {
    await service.listTransactions('ws-1', {
      status: WalletTransactionStatus.PENDING,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          status: WalletTransactionStatus.PENDING,
        },
      }),
    );
  });

  it('omits the status filter when status is not provided', async () => {
    await service.listTransactions('ws-1', {});

    const call = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).not.toHaveProperty('status');
  });

  it('anchors a date-only range to Asia/Ho_Chi_Minh day boundaries', async () => {
    await service.listTransactions('ws-1', {
      fromDate: '2026-01-31',
      toDate: '2026-02-01',
    });

    const call = findMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date; lte: Date } };
    };
    // 2026-01-31 00:00:00.000 +07:00 => 2026-01-30T17:00:00.000Z
    expect(call.where.createdAt.gte.toISOString()).toBe(
      '2026-01-30T17:00:00.000Z',
    );
    // 2026-02-01 23:59:59.999 +07:00 => 2026-02-01T16:59:59.999Z
    expect(call.where.createdAt.lte.toISOString()).toBe(
      '2026-02-01T16:59:59.999Z',
    );
  });

  it('honours full ISO timestamps as sent', async () => {
    await service.listTransactions('ws-1', {
      fromDate: '2026-01-15T08:30:00.000Z',
    });

    const call = findMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date } };
    };
    expect(call.where.createdAt.gte.toISOString()).toBe(
      '2026-01-15T08:30:00.000Z',
    );
  });

  it('combines a date range with type and pagination', async () => {
    await service.listTransactions('ws-1', {
      types: [WalletTransactionType.TOPUP_CREDIT],
      fromDate: '2026-01-01',
      offset: 5,
      limit: 10,
    });

    const call = findMany.mock.calls[0][0] as {
      where: { createdAt?: unknown; type?: unknown };
      skip: number;
      take: number;
    };
    expect(call.where.type).toEqual({
      in: [WalletTransactionType.TOPUP_CREDIT],
    });
    expect(call.where.createdAt).toBeDefined();
    expect(call.skip).toBe(5);
    expect(call.take).toBe(10);
  });
});

describe('WalletService.getBalance monthly stats', () => {
  let service: WalletService;
  const workspaceFindUnique = jest.fn();
  const walletAccountFindUnique = jest.fn();
  const groupBy = jest.fn<
    Promise<unknown>,
    [Prisma.WalletTransactionGroupByArgs]
  >();

  const accountFields = {
    ownerUserId: 'owner-1',
    balance: 1000,
    totalTopup: 5000,
    totalSpent: 4000,
    totalRefund: 0,
  };

  beforeAll(() => {
    jest.useFakeTimers();
    // 2026-02-15T10:00:00Z => 2026-02-15 17:00 VN (February).
    jest.setSystemTime(new Date('2026-02-15T10:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    workspaceFindUnique.mockReset();
    walletAccountFindUnique.mockReset();
    groupBy.mockReset();
    workspaceFindUnique.mockResolvedValue({ ownerUserId: 'owner-1' });
    walletAccountFindUnique.mockResolvedValue(accountFields);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: {
            workspace: { findUnique: workspaceFindUnique },
            walletAccount: { findUnique: walletAccountFindUnique },
            walletTransaction: { groupBy },
          },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('keeps cumulative fields and adds monthly block with change percent', async () => {
    // First groupBy call = this month, second = last month (Promise.all order).
    groupBy
      .mockResolvedValueOnce([
        { type: WalletTransactionType.TOPUP_CREDIT, _sum: { amount: 300 } },
        { type: WalletTransactionType.MESSAGE_DEBIT, _sum: { amount: 50 } },
        { type: WalletTransactionType.CAMPAIGN_REFUND, _sum: { amount: 10 } },
      ])
      .mockResolvedValueOnce([
        { type: WalletTransactionType.TOPUP_CREDIT, _sum: { amount: 100 } },
        { type: WalletTransactionType.MESSAGE_DEBIT, _sum: { amount: 20 } },
      ]);

    const result = await service.getBalance('ws-1');

    expect(result).toMatchObject(accountFields);
    expect(result?.monthly).toEqual({
      toppedUp: { value: 300, changePercent: 200 },
      // used = 50 - 10 = 40 this month; 20 last month => (40-20)/20*100 = 100
      used: { value: 40, changePercent: 100 },
    });
  });

  it('returns changePercent null when last month had no activity', async () => {
    groupBy
      .mockResolvedValueOnce([
        { type: WalletTransactionType.TOPUP_CREDIT, _sum: { amount: 500 } },
        { type: WalletTransactionType.MESSAGE_DEBIT, _sum: { amount: 80 } },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.getBalance('ws-1');

    expect(result?.monthly).toEqual({
      toppedUp: { value: 500, changePercent: null },
      used: { value: 80, changePercent: null },
    });
  });

  it('queries month ranges using Asia/Ho_Chi_Minh boundaries', async () => {
    groupBy.mockResolvedValue([]);

    await service.getBalance('ws-1');

    const thisMonthWhere = groupBy.mock.calls[0][0] as {
      where: {
        status: WalletTransactionStatus;
        createdAt: { gte: Date; lt: Date };
      };
    };
    const lastMonthWhere = groupBy.mock.calls[1][0] as {
      where: {
        status: WalletTransactionStatus;
        createdAt: { gte: Date; lt: Date };
      };
    };

    // Balance aggregates only count SUCCESS transactions (BR-WALLET-05).
    expect(thisMonthWhere.where.status).toBe(WalletTransactionStatus.SUCCESS);
    expect(lastMonthWhere.where.status).toBe(WalletTransactionStatus.SUCCESS);

    // Feb 2026 in VN: start = 2026-02-01 00:00 +07 => 2026-01-31T17:00:00Z.
    expect(thisMonthWhere.where.createdAt.gte.toISOString()).toBe(
      '2026-01-31T17:00:00.000Z',
    );
    // Next month start = 2026-03-01 00:00 +07 => 2026-02-28T17:00:00Z.
    expect(thisMonthWhere.where.createdAt.lt.toISOString()).toBe(
      '2026-02-28T17:00:00.000Z',
    );
    // Last month start = 2026-01-01 00:00 +07 => 2025-12-31T17:00:00Z.
    expect(lastMonthWhere.where.createdAt.gte.toISOString()).toBe(
      '2025-12-31T17:00:00.000Z',
    );
    // Previous month window matches the elapsed length of the current month so
    // far (now = Feb 15 17:00 VN => 14d17h in), anchored to last month's start:
    // 2025-12-31T17:00Z + 14d17h = 2026-01-15T10:00:00Z (not the full month).
    expect(lastMonthWhere.where.createdAt.lt.toISOString()).toBe(
      '2026-01-15T10:00:00.000Z',
    );
  });

  it('treats a TOPUP_CREDIT without a summed amount as zero', async () => {
    groupBy
      .mockResolvedValueOnce([
        { type: WalletTransactionType.TOPUP_CREDIT, _sum: { amount: null } },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.getBalance('ws-1');

    expect(result?.monthly.toppedUp.value).toBe(0);
  });

  it('returns null and skips aggregation when no wallet account exists', async () => {
    walletAccountFindUnique.mockResolvedValue(null);

    const result = await service.getBalance('ws-1');

    expect(result).toBeNull();
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe('WalletService monthly stats clamps the previous-month window', () => {
  let service: WalletService;
  const workspaceFindUnique = jest.fn();
  const walletAccountFindUnique = jest.fn();
  const groupBy = jest.fn<
    Promise<unknown>,
    [Prisma.WalletTransactionGroupByArgs]
  >();

  beforeAll(() => {
    jest.useFakeTimers();
    // 2026-03-31T05:00:00Z => 2026-03-31 12:00 VN. March is 30d11h in; last
    // month (February) only has 28 days, so the previous window must clamp.
    jest.setSystemTime(new Date('2026-03-31T05:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    workspaceFindUnique.mockReset();
    walletAccountFindUnique.mockReset();
    groupBy.mockReset();
    groupBy.mockResolvedValue([]);
    workspaceFindUnique.mockResolvedValue({ ownerUserId: 'owner-1' });
    walletAccountFindUnique.mockResolvedValue({
      ownerUserId: 'owner-1',
      balance: 0,
      totalTopup: 0,
      totalSpent: 0,
      totalRefund: 0,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: {
            workspace: { findUnique: workspaceFindUnique },
            walletAccount: { findUnique: walletAccountFindUnique },
            walletTransaction: { groupBy },
          },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('clamps the previous window to the end of a shorter February', async () => {
    await service.getBalance('ws-1');

    const thisMonthWhere = groupBy.mock.calls[0][0] as {
      where: { createdAt: { gte: Date; lt: Date } };
    };
    const lastMonthWhere = groupBy.mock.calls[1][0] as {
      where: { createdAt: { gte: Date; lt: Date } };
    };

    // March 2026 in VN: start = 2026-03-01 00:00 +07 => 2026-02-28T17:00:00Z.
    expect(thisMonthWhere.where.createdAt.gte.toISOString()).toBe(
      '2026-02-28T17:00:00.000Z',
    );
    // Last month start = 2026-02-01 00:00 +07 => 2026-01-31T17:00:00Z.
    expect(lastMonthWhere.where.createdAt.gte.toISOString()).toBe(
      '2026-01-31T17:00:00.000Z',
    );
    // Elapsed in March exceeds February's length, so the previous window clamps
    // to the start of this month (whole of February), not into March.
    expect(lastMonthWhere.where.createdAt.lt.toISOString()).toBe(
      '2026-02-28T17:00:00.000Z',
    );
    expect(lastMonthWhere.where.createdAt.lt.toISOString()).toBe(
      thisMonthWhere.where.createdAt.gte.toISOString(),
    );
  });
});
