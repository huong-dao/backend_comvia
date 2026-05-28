import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ZaloOaInfoResponse, ZaloTokenResponse } from './zalo.types';

@Injectable()
export class ZaloOAuthClient {
  private readonly logger = new Logger(ZaloOAuthClient.name);

  constructor(private readonly configService: ConfigService) {}

  private get appId(): string {
    return this.configService.getOrThrow<string>('zalo.appId');
  }

  private get secretKey(): string {
    return this.configService.getOrThrow<string>('zalo.secretKey');
  }

  get redirectUri(): string {
    return this.configService.getOrThrow<string>('zalo.oauthRedirectUri');
  }

  buildPermissionUrl(params: {
    codeChallenge: string;
    state: string;
  }): string {
    const query = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: this.redirectUri,
      code_challenge: params.codeChallenge,
      state: params.state,
    });

    return `https://oauth.zaloapp.com/v4/oa/permission?${query.toString()}`;
  }

  async exchangeAuthorizationCode(params: {
    authCode: string;
    codeVerifier: string;
  }): Promise<ZaloTokenResponse> {
    const body = new URLSearchParams({
      code: params.authCode,
      app_id: this.appId,
      grant_type: 'authorization_code',
      code_verifier: params.codeVerifier,
    });

    return this.requestToken(body);
  }

  async refreshAccessToken(refreshToken: string): Promise<ZaloTokenResponse> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      app_id: this.appId,
      grant_type: 'refresh_token',
    });

    return this.requestToken(body);
  }

  async getOaInfo(accessToken: string): Promise<ZaloOaInfoResponse> {
    const response = await fetch('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: {
        access_token: accessToken,
      },
    });

    const payload = (await response.json()) as ZaloOaInfoResponse;
    if (!response.ok || payload.error !== 0) {
      this.logger.error(
        `[Zalo OAuth] getOaInfo failed: ${JSON.stringify(payload)}`,
      );
      throw new Error(payload.message || 'Failed to fetch OA info');
    }

    return payload;
  }

  private async requestToken(body: URLSearchParams): Promise<ZaloTokenResponse> {
    const response = await fetch(
      'https://oauth.zaloapp.com/v4/oa/access_token',
      {
        method: 'POST',
        headers: {
          secret_key: this.secretKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    const payload = (await response.json()) as ZaloTokenResponse;
    if (!response.ok || !payload.access_token) {
      this.logger.error(
        `[Zalo OAuth] Token request failed: ${JSON.stringify(payload)}`,
      );
      throw new Error(
        payload.error_description ||
          payload.error_name ||
          'Zalo token request failed',
      );
    }

    return payload;
  }
}
