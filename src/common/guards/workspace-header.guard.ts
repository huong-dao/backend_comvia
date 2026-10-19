import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

type WorkspaceHeaderRequest = {
  user?: { id?: string; role?: UserRole };
  headers?: { 'x-workspace-id'?: string };
  workspace?: { id: string; status: string; ownerUserId: string };
  workspaceMember?: { id: string; role: string; status?: string };
};

@Injectable()
export class WorkspaceHeaderGuard implements CanActivate {
  constructor(private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorkspaceHeaderRequest>();

    const userId = req.user?.id;
    if (!userId) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const workspaceId: string | undefined = req.headers?.['x-workspace-id'];
    if (!workspaceId) {
      throw new ForbiddenException('Missing x-workspace-id header');
    }

    const [workspaceMember, workspace] = await Promise.all([
      req.user?.role === UserRole.ADMIN
        ? Promise.resolve(null)
        : this.prismaService.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
            select: { id: true, role: true, status: true },
          }),
      this.prismaService.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, status: true, ownerUserId: true },
      }),
    ]);

    if (!workspace || (req.user?.role !== UserRole.ADMIN && !workspaceMember)) {
      throw new ForbiddenException('Access denied: workspace not found');
    }

    if (workspace.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `Workspace is not active (${workspace.status})`,
      );
    }

    if (
      req.user?.role !== UserRole.ADMIN &&
      workspaceMember?.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        `Workspace membership is not active (${workspaceMember?.status})`,
      );
    }

    // Attach workspace context to request
    req.workspace = workspace;
    req.workspaceMember = workspaceMember ?? undefined;

    return true;
  }
}
