import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type WorkspaceContextRequest = {
  user?: { id?: string };
  params?: { workspaceId?: string };
  workspace?: { id: string; status: string; ownerUserId: string };
  workspaceMember?: { id: string; role: string; status?: string };
};

@Injectable()
export class WorkspaceContextGuard implements CanActivate {
  constructor(private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorkspaceContextRequest>();

    const userId = req.user?.id;
    if (!userId) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const workspaceId: string | undefined = req.params?.workspaceId;
    if (!workspaceId) {
      throw new ForbiddenException('Missing workspaceId in route params');
    }

    const [workspaceMember, workspace] = await Promise.all([
      this.prismaService.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { id: true, role: true, status: true },
      }),
      this.prismaService.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, status: true, ownerUserId: true },
      }),
    ]);

    if (!workspaceMember || !workspace) {
      throw new ForbiddenException('Access denied: workspace not found');
    }

    if (workspace.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `Workspace is not active (${workspace.status})`,
      );
    }

    if (workspaceMember.status && workspaceMember.status !== 'ACTIVE') {
      throw new ForbiddenException('Workspace member is not active');
    }

    req.workspace = workspace;
    req.workspaceMember = workspaceMember;

    return true;
  }
}
