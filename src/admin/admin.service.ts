import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ListOaConnectionsQueryDto } from './dto/list-oa-connections-query.dto';

// Short-lived on purpose: this token lets an ADMIN act as a workspace's
// Owner. Keeping it well under the normal login TTL limits the damage
// window if a browser tab with the impersonated session is left open.
const IMPERSONATION_TOKEN_TTL_MINUTES = 20;

@Injectable()
export class AdminService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly jwtService: JwtService,
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

  /**
   * ISSUE-002: let an ADMIN act as the Owner of a workspace without ever
   * knowing/resetting the owner's password. The returned token carries the
   * owner's real identity (sub/email/role/tokenVersion) so every existing
   * guard treats the session exactly like the owner's own login — only
   * `impersonatedBy` is new, and it rides along purely for audit/UX (see
   * JwtStrategy.validate() and AuthService.me()). No extra restriction is
   * applied to what the impersonated session can do versus a real owner
   * login — a known, intentional scope limit of this first version, flagged
   * in ISSUE-002 for PO follow-up rather than silently decided.
   */
  async impersonateWorkspaceOwner(adminUserId: string, workspaceId: string) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        owner: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            status: true,
            tokenVersion: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new BadRequestException('Workspace not found');
    }
    if (workspace.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot impersonate the owner of a non-active workspace',
      );
    }
    if (workspace.owner.status !== 'ACTIVE') {
      throw new BadRequestException('Workspace owner account is not active');
    }

    const payload: JwtPayload = {
      sub: workspace.owner.id,
      email: workspace.owner.email,
      role: workspace.owner.role,
      tokenVersion: workspace.owner.tokenVersion,
      impersonatedBy: adminUserId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: `${IMPERSONATION_TOKEN_TTL_MINUTES}m`,
    });

    await this.auditLogService.write({
      actorUserId: adminUserId,
      workspaceId: workspace.id,
      action: AUDIT_ACTIONS.WORKSPACE_IMPERSONATED,
      resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE,
      resourceId: workspace.id,
      metadataJson: {
        targetOwnerUserId: workspace.owner.id,
        targetOwnerEmail: workspace.owner.email,
        expiresInMinutes: IMPERSONATION_TOKEN_TTL_MINUTES,
      },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInMinutes: IMPERSONATION_TOKEN_TTL_MINUTES,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      owner: {
        id: workspace.owner.id,
        email: workspace.owner.email,
        fullName: workspace.owner.fullName,
      },
    };
  }
}
