import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditLogService } from './../src/audit-log/audit-log.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { WorkspacesController } from './../src/workspaces/workspaces.controller';
import { WorkspacesService } from './../src/workspaces/workspaces.service';

/**
 * Standalone e2e for PATCH /workspaces/:workspaceId and the no-regression check
 * on DELETE (TICKET-002 / ISSUE-007). It does NOT import AppModule (avoids the
 * known uuid-ESM harness failure). Both real guards run; outcomes are driven
 * through the Prisma mock, so no database is needed.
 *
 * Behaviour locked here:
 *  - OWNER PATCH on ACTIVE / DISABLED / SUSPENDED -> 200 (route opts into those
 *    statuses via @AllowWorkspaceStatuses).
 *  - OWNER PATCH on DELETED -> 403 (DELETED is never opted in; guard blocks it).
 *  - MEMBER PATCH -> 403 (WorkspaceRolesGuard).
 *  - DELETE on DISABLED -> 403: DELETE carries no @AllowWorkspaceStatuses, so it
 *    keeps the ACTIVE-only default — proving the decorator did not widen other
 *    workspace-scoped routes.
 */

type PrismaSelect = { [key: string]: true | { select: PrismaSelect } };

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

let currentWorkspaceRow: Record<string, unknown> | null = null;

const prismaMock = {
  workspaceMember: {
    findUnique: jest.fn(),
  },
  workspace: {
    findUnique: jest.fn((args: { select?: PrismaSelect }) =>
      Promise.resolve(applySelect(currentWorkspaceRow, args.select)),
    ),
    update: jest.fn().mockResolvedValue({
      id: 'ws-1',
      name: 'Renamed',
      slug: 'my-workspace',
      billingProfile: null,
    }),
  },
};

describe('PATCH/DELETE /workspaces/:workspaceId status access (e2e)', () => {
  let app: INestApplication<App>;
  const path = '/workspaces/ws-1';

  const ownerRow = (status: string) => ({
    id: 'ws-1',
    name: 'My Workspace',
    slug: 'my-workspace',
    status,
    ownerUserId: 'owner-1',
  });

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
    prismaMock.workspace.update.mockClear();
  });

  it.each(['ACTIVE', 'DISABLED', 'SUSPENDED'])(
    'OWNER PATCH succeeds when the workspace is %s',
    async (status) => {
      currentWorkspaceRow = ownerRow(status);

      await request(app.getHttpServer())
        .patch(path)
        .send({ name: 'Renamed' })
        .expect(200);

      expect(prismaMock.workspace.update).toHaveBeenCalledTimes(1);
    },
  );

  it('OWNER PATCH gets 403 when the workspace is DELETED', async () => {
    currentWorkspaceRow = ownerRow('DELETED');

    await request(app.getHttpServer())
      .patch(path)
      .send({ name: 'Renamed' })
      .expect(403);

    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it('MEMBER PATCH gets 403 from WorkspaceRolesGuard', async () => {
    currentWorkspaceRow = ownerRow('ACTIVE');
    prismaMock.workspaceMember.findUnique.mockResolvedValue({
      id: 'wm-2',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await request(app.getHttpServer())
      .patch(path)
      .send({ name: 'Renamed' })
      .expect(403);

    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it('DELETE on a DISABLED workspace still gets 403 (no decorator, ACTIVE-only)', async () => {
    currentWorkspaceRow = ownerRow('DISABLED');

    await request(app.getHttpServer()).delete(path).expect(403);

    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });
});
