import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OaAuthController } from './oa-auth.controller';
import { OaConnectionsService } from './oa-connections.service';

describe('OaAuthController token webhook', () => {
  const oaConnectionsService = {
    handleOAuthCallback: jest.fn(),
    handleTokenWebhook: jest.fn(),
    resolveWorkspaceIdByOAuthState: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'zalo.appId': 'zalo-app',
        'zalo.oauthWebhookToken': 'relay-secret',
      };
      return values[key];
    }),
  };

  const controller = new OaAuthController(
    oaConnectionsService as unknown as OaConnectionsService,
    configService as unknown as ConfigService,
  );

  const body = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    app_id: 'zalo-app',
    state: 'pending-state',
    expires_in: 3600,
  };

  beforeEach(() => jest.clearAllMocks());

  it('accepts the trusted relay and forwards the token payload without returning it', async () => {
    oaConnectionsService.handleTokenWebhook.mockResolvedValue({ id: 'conn-1' });

    await expect(
      controller.tokenWebhook(body, 'Bearer relay-secret'),
    ).resolves.toEqual({ ok: true });

    expect(oaConnectionsService.handleTokenWebhook).toHaveBeenCalledWith(body);
  });

  it('rejects a missing or invalid relay credential before looking up state', async () => {
    await expect(controller.tokenWebhook(body, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.tokenWebhook(body, 'Bearer wrong-secret'),
    ).rejects.toThrow(UnauthorizedException);
    expect(oaConnectionsService.handleTokenWebhook).not.toHaveBeenCalled();
  });

  it('rejects an app id other than the configured Zalo application', async () => {
    await expect(
      controller.tokenWebhook(
        { ...body, app_id: 'another-app' },
        'Bearer relay-secret',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(oaConnectionsService.handleTokenWebhook).not.toHaveBeenCalled();
  });
});
