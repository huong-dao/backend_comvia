import { Injectable } from '@nestjs/common';
import { OaConnectionStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OaConnectionsService {
  constructor(private readonly prismaService: PrismaService) {}

  async getStatus(workspaceId: string) {
    const connection =
      await this.prismaService.workspaceOaConnection.findUnique({
        where: { workspaceId },
      });

    if (!connection) {
      return {
        workspaceId,
        status: 'NOT_CONNECTED' satisfies OaConnectionStatus,
      };
    }

    return connection;
  }

  async connect(workspaceId: string, actorUserId: string) {
    void actorUserId;
    const now = new Date();
    const oaId = `OA_${randomBytes(6).toString('hex')}`;
    const accessToken = randomBytes(24).toString('hex');
    const refreshToken = randomBytes(24).toString('hex');
    const tokenExpiredAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return this.prismaService.workspaceOaConnection.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        oaId,
        oaName: 'Mock OA',
        accessToken,
        refreshToken,
        tokenExpiredAt,
        status: 'CONNECTED',
        connectedAt: now,
      },
      update: {
        oaId,
        oaName: 'Mock OA',
        accessToken,
        refreshToken,
        tokenExpiredAt,
        status: 'CONNECTED',
        connectedAt: now,
      },
    });
  }

  async disconnect(workspaceId: string, actorUserId: string) {
    void actorUserId;
    const connection =
      await this.prismaService.workspaceOaConnection.findUnique({
        where: { workspaceId },
        select: { id: true, status: true },
      });

    if (!connection) {
      return { ok: true };
    }

    if (connection.status === 'DISCONNECTED') {
      return { ok: true };
    }

    await this.prismaService.workspaceOaConnection.update({
      where: { workspaceId },
      data: {
        status: 'DISCONNECTED' satisfies OaConnectionStatus,
      },
    });

    return { ok: true };
  }
}
