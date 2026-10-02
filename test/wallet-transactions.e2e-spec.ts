import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { WorkspaceContextGuard } from './../src/common/guards/workspace-context.guard';
import { PrismaService } from './../src/prisma/prisma.service';
import { WalletController } from './../src/wallet/wallet.controller';
import { WalletService } from './../src/wallet/wallet.service';

type FakeTransaction = {
  id: string;
  workspaceId: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  createdAt: Date;
};

const STATUS_CYCLE: WalletTransactionStatus[] = [
  WalletTransactionStatus.SUCCESS,
  WalletTransactionStatus.PENDING,
  WalletTransactionStatus.FAILED,
];

// Fixed dataset ordered newest-first (id-30 .. id-1), one record per second
// starting at 2026-01-01T00:00:00Z (UTC, deterministic across machines).
// Status cycles SUCCESS/PENDING/FAILED so status filtering is observable.
const dataset: FakeTransaction[] = Array.from({ length: 30 }, (_, i) => ({
  id: `tx-${30 - i}`,
  workspaceId: 'ws-1',
  type:
    i % 2 === 0
      ? WalletTransactionType.TOPUP_CREDIT
      : WalletTransactionType.MESSAGE_DEBIT,
  status: STATUS_CYCLE[i % 3],
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 30 - i)),
}));

const prismaMock = {
  walletTransaction: {
    findMany: jest.fn(
      (args: Prisma.WalletTransactionFindManyArgs): Promise<unknown> => {
        const where = args.where ?? {};
        const typeFilter = (
          where as {
            type?: WalletTransactionType | { in?: WalletTransactionType[] };
          }
        ).type;
        const statusFilter = (where as { status?: WalletTransactionStatus })
          .status;
        const createdAt = (where as { createdAt?: { gte?: Date; lte?: Date } })
          .createdAt;

        const filtered = dataset
          .filter((tx) => {
            if (typeFilter) {
              if (typeof typeFilter === 'object' && typeFilter.in) {
                if (!typeFilter.in.includes(tx.type)) return false;
              } else if (tx.type !== typeFilter) {
                return false;
              }
            }
            if (statusFilter && tx.status !== statusFilter) return false;
            if (createdAt?.gte && tx.createdAt < createdAt.gte) return false;
            if (createdAt?.lte && tx.createdAt > createdAt.lte) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const skip = args.skip ?? 0;
        const take = args.take ?? filtered.length;
        return Promise.resolve(filtered.slice(skip, skip + take));
      },
    ),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  workspace: {
    findUnique: jest.fn().mockResolvedValue({ ownerUserId: 'owner-1' }),
  },
  walletAccount: {
    findUnique: jest.fn().mockResolvedValue({
      ownerUserId: 'owner-1',
      balance: 1000,
      totalTopup: 5000,
      totalSpent: 4000,
      totalRefund: 0,
    }),
  },
};

describe('Wallet endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const txPath = '/workspaces/ws-1/wallet/transactions';
  const balancePath = '/workspaces/ws-1/wallet/balance';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    })
      .overrideGuard(WorkspaceContextGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global pipe configured in main.ts so query coercion matches prod.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /transactions pagination (TICKET-004)', () => {
    it('?limit=5 returns at most 5 records', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({ limit: 5 })
        .expect(200);

      expect(res.body).toHaveLength(5);
    });

    it('?offset=5&limit=5 returns page 2 (different rows than page 1)', async () => {
      const page1 = await request(app.getHttpServer())
        .get(txPath)
        .query({ limit: 5 })
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get(txPath)
        .query({ offset: 5, limit: 5 })
        .expect(200);

      const ids1 = (page1.body as FakeTransaction[]).map((t) => t.id);
      const ids2 = (page2.body as FakeTransaction[]).map((t) => t.id);
      expect(ids2).toHaveLength(5);
      expect(ids1).not.toEqual(ids2);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    });

    it('no offset/limit defaults to offset 0 / limit 20', async () => {
      const res = await request(app.getHttpServer()).get(txPath).expect(200);

      expect(res.body).toHaveLength(20);
      // Newest-first: first row is the latest tx id.
      expect((res.body as FakeTransaction[])[0].id).toBe('tx-30');
    });

    it('?type=TOPUP_CREDIT filters and still paginates', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({ type: 'TOPUP_CREDIT', limit: 5 })
        .expect(200);

      const rows = res.body as FakeTransaction[];
      expect(rows).toHaveLength(5);
      expect(rows.every((t) => t.type === 'TOPUP_CREDIT')).toBe(true);
    });
  });

  describe('GET /transactions date + type-group filter (TICKET-005)', () => {
    it('?types=A&types=B returns both types', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({ types: ['TOPUP_CREDIT', 'MESSAGE_DEBIT'], limit: 100 })
        .expect(200);

      const types = new Set((res.body as FakeTransaction[]).map((t) => t.type));
      expect(types.has('TOPUP_CREDIT')).toBe(true);
      expect(types.has('MESSAGE_DEBIT')).toBe(true);
      expect(res.body).toHaveLength(30);
    });

    it('?fromDate&toDate (full ISO) returns only rows in the inclusive range', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({
          fromDate: '2026-01-01T00:00:10.000Z',
          toDate: '2026-01-01T00:00:20.000Z',
          limit: 100,
        })
        .expect(200);

      const rows = res.body as FakeTransaction[];
      // Seconds 10..20 inclusive = 11 records.
      expect(rows).toHaveLength(11);
      for (const row of rows) {
        const t = new Date(row.createdAt).getTime();
        expect(t).toBeGreaterThanOrEqual(Date.parse('2026-01-01T00:00:10Z'));
        expect(t).toBeLessThanOrEqual(Date.parse('2026-01-01T00:00:20Z'));
      }
    });

    it('date range combines with type group and pagination', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({
          types: 'TOPUP_CREDIT',
          fromDate: '2026-01-01T00:00:00.000Z',
          toDate: '2026-01-01T00:00:30.000Z',
          limit: 3,
        })
        .expect(200);

      const rows = res.body as FakeTransaction[];
      expect(rows).toHaveLength(3);
      expect(rows.every((t) => t.type === 'TOPUP_CREDIT')).toBe(true);
    });

    it('rejects an invalid date with 400', async () => {
      await request(app.getHttpServer())
        .get(txPath)
        .query({ fromDate: 'not-a-date' })
        .expect(400);
    });
  });

  describe('GET /transactions status field + filter (TICKET-015)', () => {
    it('includes a status field on every returned record', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({ limit: 100 })
        .expect(200);

      const rows = res.body as FakeTransaction[];
      expect(rows).toHaveLength(30);
      expect(
        rows.every((t) =>
          (['SUCCESS', 'PENDING', 'FAILED'] as string[]).includes(t.status),
        ),
      ).toBe(true);
    });

    it('?status=SUCCESS returns only SUCCESS records', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({ status: 'SUCCESS', limit: 100 })
        .expect(200);

      const rows = res.body as FakeTransaction[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((t) => t.status === 'SUCCESS')).toBe(true);
    });

    it('no status filter returns records of every status', async () => {
      const res = await request(app.getHttpServer())
        .get(txPath)
        .query({ limit: 100 })
        .expect(200);

      const statuses = new Set(
        (res.body as FakeTransaction[]).map((t) => t.status),
      );
      expect(statuses.has('SUCCESS')).toBe(true);
      expect(statuses.has('PENDING')).toBe(true);
      expect(statuses.has('FAILED')).toBe(true);
    });

    it('rejects an invalid status with 400', async () => {
      await request(app.getHttpServer())
        .get(txPath)
        .query({ status: 'not-a-status' })
        .expect(400);
    });
  });

  describe('GET /balance monthly block (TICKET-006)', () => {
    it('returns cumulative fields plus the monthly block', async () => {
      prismaMock.walletTransaction.groupBy
        .mockResolvedValueOnce([
          { type: WalletTransactionType.TOPUP_CREDIT, _sum: { amount: 300 } },
          { type: WalletTransactionType.MESSAGE_DEBIT, _sum: { amount: 50 } },
        ])
        .mockResolvedValueOnce([
          { type: WalletTransactionType.TOPUP_CREDIT, _sum: { amount: 100 } },
          { type: WalletTransactionType.MESSAGE_DEBIT, _sum: { amount: 25 } },
        ]);

      const res = await request(app.getHttpServer())
        .get(balancePath)
        .expect(200);

      expect(res.body).toMatchObject({
        balance: 1000,
        totalTopup: 5000,
        totalSpent: 4000,
        totalRefund: 0,
        monthly: {
          toppedUp: { value: 300, changePercent: 200 },
          used: { value: 50, changePercent: 100 },
        },
      });
    });
  });
});
