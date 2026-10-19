import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListOaConnectionsQueryDto } from './dto/list-oa-connections-query.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
    return this.auditLogService.list(params);
  }

  async listOaConnections(query: ListOaConnectionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = {
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { connection: { status: query.status } } : {}),
      ...(query.keyword
        ? {
            OR: [
              {
                name: { contains: query.keyword, mode: 'insensitive' as const },
              },
              {
                code: { contains: query.keyword, mode: 'insensitive' as const },
              },
              {
                workspace: {
                  name: {
                    contains: query.keyword,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                connection: {
                  oaName: {
                    contains: query.keyword,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                connection: {
                  oaId: {
                    contains: query.keyword,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prismaService.$transaction([
      this.prismaService.workspaceOa.count({ where }),
      this.prismaService.workspaceOa.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          code: true,
          workspace: {
            select: {
              id: true,
              name: true,
              owner: { select: { id: true, email: true, fullName: true } },
            },
          },
          connection: {
            select: {
              oaId: true,
              oaName: true,
              status: true,
              connectedAt: true,
              tokenExpiredAt: true,
            },
          },
        },
      }),
    ]);
    return { items, page, limit, total };
  }
}
