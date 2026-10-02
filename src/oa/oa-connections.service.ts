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

    const { accessToken, refreshToken, oauthCodeVerifier, ...safeConnection } =
      workspaceOa.connection;
    void oauthCodeVerifier;

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
    // "Create OA" flow (TICKET-010); connecting only arms the OAuth state.
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
    const oauthStateExpiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS);

    const connection = await this.prismaService.workspaceOaConnection.update({
      where: { workspaceOaId: workspaceOa.id },
      data: {
        oauthState: state,
        oauthCodeVerifier: codeVerifier,
        oauthStateExpiresAt,
        status: 'NOT_CONNECTED',
      },
    });

    const authorizationUrl = this.zaloOAuthClient.buildPermissionUrl({
      codeChallenge,
      state,
    });

    return {
      authorizationUrl,
      state,
      connectionId: connection.id,
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

    const connection = await this.prismaService.workspaceOaConnection.findFirst(
      {
        where: { oauthState: state },
        select: { workspaceOa: { select: { workspaceId: true } } },
      },
    );

    return connection?.workspaceOa.workspaceId ?? null;
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

    const connection = await this.prismaService.workspaceOaConnection.findFirst(
      {
        where: {
          oauthState: state,
          oauthStateExpiresAt: { gt: new Date() },
        },
        include: { workspaceOa: { select: { workspaceId: true } } },
      },
    );

    if (!connection || !connection.oauthCodeVerifier) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const workspaceId = connection.workspaceOa.workspaceId;

    const tokenResponse = await this.zaloOAuthClient.exchangeAuthorizationCode({
      authCode: code,
      codeVerifier: connection.oauthCodeVerifier,
    });

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

    const updated = await this.prismaService.workspaceOaConnection.update({
      where: { id: connection.id },
      data: {
        oaId,
        oaName,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiredAt,
        status: 'CONNECTED',
        connectedAt: now,
        oauthState: null,
        oauthCodeVerifier: null,
        oauthStateExpiresAt: null,
      },
      include: { workspaceOa: { select: { workspaceId: true } } },
    });

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
          oauthState: null,
          oauthCodeVerifier: null,
          oauthStateExpiresAt: null,
        },
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
