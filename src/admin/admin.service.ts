import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prismaService: PrismaService) {}

  listUsers() {
    return this.prismaService.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
  }

  lockUser(userId: string, locked: boolean) {
    return this.prismaService.user.update({
      where: { id: userId },
      data: { status: locked ? 'LOCKED' : 'ACTIVE' },
      select: { id: true, status: true },
    });
  }

  listWorkspaces() {
    return this.prismaService.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        ownerUserId: true,
        createdAt: true,
      },
    });
  }

  disableWorkspace(workspaceId: string) {
    return this.prismaService.workspace.update({
      where: { id: workspaceId },
      data: { status: 'DISABLED' },
      select: { id: true, status: true },
    });
  }

  listAuditLogs(params: {
    workspaceId?: string;
    action?: string;
    limit?: number;
  }) {
    return this.prismaService.auditLog.findMany({
      where: {
        ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
        ...(params.action ? { action: params.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
    });
  }
}
