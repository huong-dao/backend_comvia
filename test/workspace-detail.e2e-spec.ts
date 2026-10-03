import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BillingType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditLogService } from './../src/audit-log/audit-log.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { WorkspacesController } from './../src/workspaces/workspaces.controller';
import { WorkspacesService } from './../src/workspaces/workspaces.service';

/**
 * Standalone e2e for GET /workspaces/:workspaceId (TICKET-014 / ISSUE-008 /
 * BR-WS-06). It does NOT import AppModule (avoids the known uuid-ESM harness
 * failure). Both real guards run — OWNER/MEMBER/non-member outcomes are driven
 * purely through the Prisma mock, so no database is needed.
 */

const workspaceRow = {
  id: 'ws-1',
  name: 'My Workspace',
  slug: 'my-workspace',
  status: 'ACTIVE',
  ownerUserId: 'owner-1',
  billingProfile: {
    billingType: BillingType.INDIVIDUAL,
    companyName: null,
    taxCode: null,
    address: '123 Street, City',
    invoiceEmail: 'a@example.com',
    representativeName: null,
    phone: '0900000000',
    fullName: 'Nguyen Van A',
    citizenId: '012345678901',
    // Fields the endpoint must NOT expose; present on the row to prove the
    // service's select keeps them out of the response.
    id: 'bp-1',
    workspaceId: 'ws-1',
    invoicePdfAddress: '/public/invoices/ws-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  },
};

type PrismaSelect = { [key: string]: true | { select: PrismaSelect } };

// Faithfully apply a Prisma `select` so the e2e proves the service's select
// clause — not a lenient mock — is what trims the response.
function applySelect(
  row: Record<string, unknown> | null,
  select?: PrismaSelect,
): Record<string, unknown> | null {
  if (row === null || !select) return row;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(select)) {
    const value = row[key];
    if (spec === true) {
      out[key] = value;
    } else {
      out[key] = applySelect(
        value as Record<string, unknown> | null,
        spec.select,
      );
    }
  }
  return out;
}

const prismaMock = {
  workspaceMember: {
    // Default: caller is an ACTIVE OWNER member. Overridden per test.
    findUnique: jest.fn().mockResolvedValue({
      id: 'wm-1',
      role: 'OWNER',
      status: 'ACTIVE',
    }),
  },
  workspace: {
    findUnique: jest.fn((args: { select?: PrismaSelect }) =>
      Promise.resolve(applySelect(currentWorkspaceRow, args.select)),
    ),
  },
};

let currentWorkspaceRow: Record<string, unknown> | null = workspaceRow;

describe('GET /workspaces/:workspaceId (e2e)', () => {
  let app: INestApplication<App>;
  const path = '/workspaces/ws-1';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WorkspacesController],
      providers: [
        WorkspacesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Stand in for the auth layer so the real WorkspaceContextGuard sees a user.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: { id: string } }).user = { id: 'owner-1' };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue({
      id: 'wm-1',
      role: 'OWNER',
      status: 'ACTIVE',
    });
    currentWorkspaceRow = workspaceRow;
  });

  it('OWNER gets 200 with core fields, role, and the full billing profile', async () => {
    const res = await request(app.getHttpServer()).get(path).expect(200);

    expect(res.body).toEqual({
      id: 'ws-1',
      name: 'My Workspace',
      slug: 'my-workspace',
      status: 'ACTIVE',
      role: 'OWNER',
      billingProfile: {
        billingType: BillingType.INDIVIDUAL,
        companyName: null,
        taxCode: null,
        address: '123 Street, City',
        invoiceEmail: 'a@example.com',
        representativeName: null,
        phone: '0900000000',
        fullName: 'Nguyen Van A',
        citizenId: '012345678901',
      },
    });
  });

  it('does not leak ownerUserId or sensitive billing fields', async () => {
    const res = await request(app.getHttpServer()).get(path).expect(200);

    const body = res.body as Record<string, unknown> & {
      billingProfile: Record<string, unknown>;
    };
    expect(body.ownerUserId).toBeUndefined();
    expect(body.billingProfile.id).toBeUndefined();
    expect(body.billingProfile.workspaceId).toBeUndefined();
    expect(body.billingProfile.invoicePdfAddress).toBeUndefined();
    expect(body.billingProfile.createdAt).toBeUndefined();
    expect(body.billingProfile.updatedAt).toBeUndefined();
  });

  // ISSUE-007 / TICKET-002: OWNER can still READ a DISABLED or SUSPENDED
  // workspace (detail route opts into these via @AllowWorkspaceStatuses).
  it.each(['DISABLED', 'SUSPENDED'])(
    'OWNER gets 200 when the workspace is %s',
    async (status) => {
      currentWorkspaceRow = { ...workspaceRow, status };

      const res = await request(app.getHttpServer()).get(path).expect(200);

      expect((res.body as { status: string }).status).toBe(status);
    },
  );

  it('MEMBER (ACTIVE) gets 403 from WorkspaceRolesGuard', async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue({
      id: 'wm-2',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await request(app.getHttpServer()).get(path).expect(403);
  });

  it('non-member gets 403 from WorkspaceContextGuard', async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer()).get(path).expect(403);
  });

  // ISSUE-007 / TICKET-002: a DELETED workspace is not readable via GET detail.
  // The existing WorkspaceContextGuard rejects any non-ACTIVE status, so GET
  // detail stays consistent with PATCH without changing getDetail itself.
  it('OWNER gets 403 when the workspace is DELETED', async () => {
    currentWorkspaceRow = { ...workspaceRow, status: 'DELETED' };

    await request(app.getHttpServer()).get(path).expect(403);
  });
});
