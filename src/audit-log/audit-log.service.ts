import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditAction } from './audit-log.constants';

export interface CreateAuditLogParams {
  actorUserId?: string | null;
  workspaceId?: string | null;
  action: AuditAction | string;
  resourceType: string;
  resourceId?: string | null;
  metadataJson?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prismaService: PrismaService) {}

  async write(params: CreateAuditLogParams) {
    const client = params.tx ?? this.prismaService;

    return client.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        workspaceId: params.workspaceId ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        metadataJson: params.metadataJson,
      },
      select: { id: true },
    });
  }
}
