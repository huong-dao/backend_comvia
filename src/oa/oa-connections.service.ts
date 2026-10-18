import { BadRequestException, Injectable } from '@nestjs/common';
import { OaConnectionStatus } from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  createOAuthState,
  createPkcePair,
} from '../integrations/zalo/zalo-pkce.util';
import { ZaloOAuthClient } from '../integrations/zalo/zalo-oauth.client';
import type { ZaloTokenResponse } from '../integrations/zalo/zalo.types';
import { PrismaService } from '../prisma/prisma.service';

const OAUTH_STATE_TTL_MS = 60 * 60 * 1000;
const PENDING_OA_ID = 'pending';

@Injectable()
export class OaConnectionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly zaloOAuthClient: ZaloOAuthClient,
  ) {}

  async getStatus(workspaceId: string) {
    const workspaceOa = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      include: { connection: true },
    });

    if (!workspaceOa?.connection) {
      return {
        workspaceId,
        status: 'NOT_CONNECTED' satisfies OaConnectionStatus,
      };
    }

    const { accessToken, refreshToken, ...safeConnection } =
      workspaceOa.connection;

    return {
      workspaceId,
      ...safeConnection,
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
    };
  }

  async startConnect(workspaceId: string, actorUserId: string) {
    void actorUserId;

    // The OA profile and its empty connection row are provisioned by the
    // "Create OA" flow (TICKET-010); connecting only arms a new OAuth attempt.
    const workspaceOa = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      select: { id: true, connection: { select: { id: true } } },
    });

    if (!workspaceOa?.connection) {
      throw new BadRequestException('OA must be created before connecting');
    }

    const now = new Date();
    const state = createOAuthState();
    const { codeVerifier, codeChallenge } = createPkcePair();
    const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS);

    // Mỗi lần gọi tạo 1 row attempt riêng (không ghi đè) — các authorizationUrl
    // cũ (state cũ) vẫn còn dùng được độc lập cho tới khi hết hạn hoặc được
    // dùng để kết nối thành công.
    await this.prismaService.oaOAuthAttempt.create({
      data: {
        workspaceOaId: workspaceOa.id,
        state,
        codeVerifier,
        expiresAt,
      },
    });

    const authorizationUrl = this.zaloOAuthClient.buildPermissionUrl({
      codeChallenge,
      codeVerifier,
      state,
    });

    return {
      authorizationUrl,
      state,
      connectionId: workspaceOa.connection.id,
    };
  }

  /** @deprecated Use startConnect — kept for backward compatibility. */
  async connect(workspaceId: string, actorUserId: string) {
    return this.startConnect(workspaceId, actorUserId);
  }

  /** Resolve workspace from OAuth state (includes expired state for error redirects). */
  async resolveWorkspaceIdByOAuthState(
    state: string | undefined,
  ): Promise<string | null> {
    if (!state) {
      return null;
    }

    const attempt = await this.prismaService.oaOAuthAttempt.findFirst({
      where: { state },
      select: { workspaceOa: { select: { workspaceId: true } } },
    });

    return attempt?.workspaceOa.workspaceId ?? null;
  }

  /** Finds the still-valid attempt for `state` and the connection row it belongs to. */
  private async resolveActiveAttempt(state: string) {
    const attempt = await this.prismaService.oaOAuthAttempt.findFirst({
      where: {
        state,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { workspaceOa: { select: { workspaceId: true } } },
    });

    if (!attempt) {
      return null;
    }

    const connection =
      await this.prismaService.workspaceOaConnection.findUnique({
        where: { workspaceOaId: attempt.workspaceOaId },
      });

    if (!connection) {
      return null;
    }

    return { attempt, connection };
  }

  async handleOAuthCallback(params: {
    code?: string;
    state?: string;
    oa_id?: string;
  }) {
    const { code, state, oa_id: oaIdFromQuery } = params;
    if (!code || !state) {
      throw new BadRequestException('Missing OAuth code or state');
    }

    const resolved = await this.resolveActiveAttempt(state);
    if (!resolved) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    const { attempt, connection } = resolved;

    const tokenResponse = await this.zaloOAuthClient.exchangeAuthorizationCode({
      authCode: code,
      codeVerifier: attempt.codeVerifier,
    });

    return this.completeOAuthConnection({
      connection: {
        id: connection.id,
        oaId: connection.oaId,
        oaName: connection.oaName,
        workspaceOa: { workspaceId: attempt.workspaceOa.workspaceId },
      },
      attemptId: attempt.id,
      tokenResponse,
      oaIdFromQuery,
    });
  }

  /** Complete an OAuth flow whose token exchange was performed by id.onweb.asia. */
  async handleTokenWebhook(params: {
    access_token: string;
    refresh_token: string;
    state: string;
    oa_id?: string;
    expires_in?: number;
  }) {
    const resolved = await this.resolveActiveAttempt(params.state);
    if (!resolved) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    const { attempt, connection } = resolved;

    return this.completeOAuthConnection({
      connection: {
        id: connection.id,
        oaId: connection.oaId,
        oaName: connection.oaName,
        workspaceOa: { workspaceId: attempt.workspaceOa.workspaceId },
      },
      attemptId: attempt.id,
      tokenResponse: {
        access_token: params.access_token,
        refresh_token: params.refresh_token,
        expires_in: params.expires_in,
      },
      oaIdFromQuery: params.oa_id,
    });
  }

  private async completeOAuthConnection(params: {
    connection: {
      id: string;
      oaId: string;
      oaName: string | null;
      workspaceOa: { workspaceId: string };
    };
    attemptId: string;
    tokenResponse: ZaloTokenResponse;
    oaIdFromQuery?: string;
  }) {
    const { connection, attemptId, tokenResponse, oaIdFromQuery } = params;
    const workspaceId = connection.workspaceOa.workspaceId;

    // Zalo-provided oaId/oaName live only on the connection row; the manually
    // managed WorkspaceOa profile is never overwritten here (ADR-001).
    let oaId = oaIdFromQuery ?? connection.oaId;
    let oaName = connection.oaName;

    try {
      const oaInfo = await this.zaloOAuthClient.getOaInfo(
        tokenResponse.access_token,
      );
      oaId = oaInfo.data?.oa_id ?? oaId;
      oaName = oaInfo.data?.name ?? oaName;
    } catch {
      if (oaId === PENDING_OA_ID) {
        oaId = `OA_${workspaceId.slice(-8)}`;
      }
    }

    const expiresInSeconds = Number(tokenResponse.expires_in ?? 86400);
    const tokenExpiredAt = new Date(Date.now() + expiresInSeconds * 1000);
    const now = new Date();

    const [updated] = await this.prismaService.$transaction([
      this.prismaService.workspaceOaConnection.update({
        where: { id: connection.id },
        data: {
          oaId,
          oaName,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenExpiredAt,
          status: 'CONNECTED',
          connectedAt: now,
        },
        include: { workspaceOa: { select: { workspaceId: true } } },
      }),
      // Đánh dấu attempt này đã dùng — không xóa, để giữ vết; các attempt
      // khác (nếu user bấm "Kết nối" nhiều lần) vẫn còn dùng được riêng.
      this.prismaService.oaOAuthAttempt.update({
        where: { id: attemptId },
        data: { consumedAt: now },
      }),
    ]);

    await this.auditLogService.write({
      actorUserId: null,
      workspaceId,
      action: AUDIT_ACTIONS.OA_CONNECTED,
      resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_OA_CONNECTION,
      resourceId: connection.id,
      metadataJson: {
        step: 'oauth_completed',
        oaId: updated.oaId,
        oaName: updated.oaName,
      },
    });

    return updated;
  }

  async disconnect(workspaceId: string, actorUserId: string) {
    const workspaceOa = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      select: {
        id: true,
        connection: {
          select: { id: true, status: true, oaId: true, oaName: true },
        },
      },
    });

    if (!workspaceOa?.connection) {
      return { ok: true };
    }

    const connection = workspaceOa.connection;
    if (connection.status === 'DISCONNECTED') {
      return { ok: true };
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.workspaceOaConnection.update({
        where: { workspaceOaId: workspaceOa.id },
        data: {
          status: 'DISCONNECTED' satisfies OaConnectionStatus,
          accessToken: null,
          refreshToken: null,
          tokenExpiredAt: null,
        },
      });

      // Dọn các attempt OAuth còn pending của workspaceOa này — tránh 1 link
      // "Kết nối" cũ (chưa hết hạn) vô tình kết nối lại sau khi đã disconnect.
      await tx.oaOAuthAttempt.updateMany({
        where: { workspaceOaId: workspaceOa.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await this.auditLogService.write({
        actorUserId,
        workspaceId,
        action: AUDIT_ACTIONS.OA_DISCONNECTED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_OA_CONNECTION,
        resourceId: connection.id,
        metadataJson: {
          oaId: connection.oaId,
          oaName: connection.oaName,
        },
        tx,
      });
    });

    return { ok: true };
  }
}
