import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

export const WORKSPACE_ROLES_KEY = 'workspaceRoles';
export const WorkspaceRoles = (...roles: MemberRole[]) =>
  SetMetadata(WORKSPACE_ROLES_KEY, roles);
