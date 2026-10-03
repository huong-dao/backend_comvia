import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceContextGuard } from './workspace-context.guard';

/**
 * Locks the status gate of WorkspaceContextGuard (TICKET-002 / ISSUE-007):
 * routes default to ACTIVE-only; @AllowWorkspaceStatuses widens the set, and
 * DELETED is never admitted. Prisma and Reflector are mocked — no DB needed.
 */
describe('WorkspaceContextGuard status gate', () => {
  const userId = 'owner-1';
  const workspaceId = 'ws-1';

  let prisma: {
    workspaceMember: { findUnique: jest.Mock };
    workspace: { findUnique: jest.Mock };
  };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: WorkspaceContextGuard;

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: userId },
        params: { workspaceId },
      }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  const setWorkspaceStatus = (status: WorkspaceStatus) => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: workspaceId,
      status,
      ownerUserId: userId,
    });
  };

  beforeEach(() => {
    prisma = {
      workspaceMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'wm-1', role: 'OWNER', status: 'ACTIVE' }),
      },
      workspace: { findUnique: jest.fn() },
    };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new WorkspaceContextGuard(
      prisma as unknown as PrismaService,
      reflector as unknown as Reflector,
    );
  });

  it('admits ACTIVE by default (no decorator)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    setWorkspaceStatus(WorkspaceStatus.ACTIVE);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects DISABLED by default (no decorator)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    setWorkspaceStatus(WorkspaceStatus.DISABLED);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([WorkspaceStatus.DISABLED, WorkspaceStatus.SUSPENDED])(
    'admits %s when the route opts into it',
    async (status) => {
      reflector.getAllAndOverride.mockReturnValue([
        WorkspaceStatus.ACTIVE,
        WorkspaceStatus.DISABLED,
        WorkspaceStatus.SUSPENDED,
      ]);
      setWorkspaceStatus(status);

      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );

  it('still rejects DELETED even when ACTIVE/DISABLED/SUSPENDED are opted in', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      WorkspaceStatus.ACTIVE,
      WorkspaceStatus.DISABLED,
      WorkspaceStatus.SUSPENDED,
    ]);
    setWorkspaceStatus(WorkspaceStatus.DELETED);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
