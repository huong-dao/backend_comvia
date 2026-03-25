import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole } from '@prisma/client';
import { WORKSPACE_ROLES_KEY } from '../decorators/workspace-roles.decorator';

@Injectable()
export class WorkspaceRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MemberRole[]>(
      WORKSPACE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    type WorkspaceRolesRequest = {
      workspaceMember?: { role?: MemberRole };
    };

    const req = context.switchToHttp().getRequest<WorkspaceRolesRequest>();
    const memberRole = req.workspaceMember?.role;

    if (!memberRole || !requiredRoles.includes(memberRole)) {
      throw new ForbiddenException(
        'You do not have permission for this workspace operation',
      );
    }

    return true;
  }
}
