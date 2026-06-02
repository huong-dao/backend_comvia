import { registerAs } from '@nestjs/config';

const DEFAULT_APP_BASE_URL = 'https://app.comvia.cloud';

export default registerAs('zalo', () => ({
  appId: process.env.ZALO_APP_ID || '4467726254333837718',
  secretKey: process.env.ZALO_SECRET_KEY || '7H2tLUN3q9666ru14N5j',
  oauthRedirectUri:
    process.env.ZALO_OAUTH_REDIRECT_URI ||
    'https://id.onweb.asia/v1/zalo/auth/call-back',
  /** Frontend origin — used to build /app/w/{workspaceId}/oa after OAuth. */
  comviaAppBaseUrl:
    process.env.COMVIA_APP_BASE_URL || DEFAULT_APP_BASE_URL,
  /** Fallback only when workspaceId cannot be resolved from OAuth state. */
  oauthSuccessRedirectUrl:
    process.env.ZALO_OAUTH_SUCCESS_REDIRECT_URL ||
    `${DEFAULT_APP_BASE_URL}/app/settings/oa`,
  znsTrackingId: process.env.ZALO_ZNS_TRACKING_ID || 'send_invoice',
}));
