import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { OaConnectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ZaloOAuthClient } from '../integrations/zalo/zalo-oauth.client';
import type { ZaloTokenResponse } from '../integrations/zalo/zalo.types';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

@Injectable()
export class OaTokenService {
  private readonly logger = new Logger(OaTokenService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly zaloOAuthClient: ZaloOAuthClient,
  ) {}

  async getValidAccessToken(oaConnectionId: string): Promise<string> {
    const connection =
      await this.prismaService.workspaceOaConnection.findUnique({
        where: { id: oaConnectionId },
        select: {
          id: true,
          status: true,
          accessToken: true,
          refreshToken: true,
          tokenExpiredAt: true,
        },
      });

    if (!connection || connection.status !== 'CONNECTED') {
      throw new BadRequestException('OA is not connected');
    }

    if (!connection.accessToken || !connection.refreshToken) {
      throw new BadRequestException('OA tokens are missing');
    }

    const now = Date.now();
    const expiresAt = connection.tokenExpiredAt?.getTime() ?? 0;
    if (expiresAt - TOKEN_REFRESH_BUFFER_MS > now) {
      return connection.accessToken;
    }

    return this.refreshAndPersistTokens(connection.id, connection.refreshToken);
  }

  async persistTokenResponse(
    oaConnectionId: string,
    tokenResponse: ZaloTokenResponse,
  ): Promise<void> {
    const expiresInSeconds = Number(tokenResponse.expires_in ?? 86400);
    const tokenExpiredAt = new Date(Date.now() + expiresInSeconds * 1000);

    await this.prismaService.workspaceOaConnection.update({
      where: { id: oaConnectionId },
      data: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiredAt,
        status: 'CONNECTED' satisfies OaConnectionStatus,
      },
    });
  }

  private async refreshAndPersistTokens(
    oaConnectionId: string,
    refreshToken: string,
  ): Promise<string> {
    try {
      const tokenResponse =
        await this.zaloOAuthClient.refreshAccessToken(refreshToken);
      await this.persistTokenResponse(oaConnectionId, tokenResponse);
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error(
        `[OA Token] Refresh failed for ${oaConnectionId}: ${String(error)}`,
      );

      await this.prismaService.workspaceOaConnection.update({
        where: { id: oaConnectionId },
        data: {
          status: 'TOKEN_EXPIRED' satisfies OaConnectionStatus,
        },
      });

      throw new BadRequestException(
        'OA token expired. Please reconnect Zalo OA.',
      );
    }
  }
}
