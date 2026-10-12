import { ConfigService } from '@nestjs/config';
import { ZaloOAuthClient } from './zalo-oauth.client';

describe('ZaloOAuthClient', () => {
  it('marks permission callbacks for the Comvia OAuth relay', () => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'zalo.appId': 'zalo-app',
          'zalo.secretKey': 'secret',
          'zalo.oauthRedirectUri':
            'https://id.onweb.asia/v1/zalo/auth/call-back',
          'zalo.oauthRelaySource': 'comvia',
        };
        return values[key];
      }),
    };
    const client = new ZaloOAuthClient(
      configService as unknown as ConfigService,
    );

    const url = new URL(
      client.buildPermissionUrl({
        codeChallenge: 'challenge',
        state: 'state',
      }),
    );
    const callbackUrl = new URL(url.searchParams.get('redirect_uri') ?? '');

    expect(callbackUrl.origin).toBe('https://id.onweb.asia');
    expect(callbackUrl.pathname).toBe('/v1/zalo/auth/call-back');
    expect(callbackUrl.searchParams.get('source')).toBe('comvia');
    expect(url.searchParams.get('state')).toBe('state');
  });
});
