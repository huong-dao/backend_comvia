import { SetMetadata } from '@nestjs/common';
import { WorkspaceStatus } from '@prisma/client';

export const ALLOW_WORKSPACE_STATUSES_KEY = 'allowWorkspaceStatuses';

/**
 * Widens the set of workspace statuses a route tolerates in WorkspaceContextGuard.
 * Without this decorator the guard only admits ACTIVE workspaces; workspace
 * management routes (PATCH / GET detail) use it so an OWNER can still read and
 * edit a DISABLED or SUSPENDED workspace. DELETED is never listed, so it stays
 * blocked.
 */
export const AllowWorkspaceStatuses = (...statuses: WorkspaceStatus[]) =>
  SetMetadata(ALLOW_WORKSPACE_STATUSES_KEY, statuses);
