import { registerAs } from '@nestjs/config';

export default registerAs('zalo', () => ({
  appId: process.env.ZALO_APP_ID || '4467726254333837718',
  secretKey: process.env.ZALO_SECRET_KEY || '7H2tLUN3q9666ru14N5j',
  oauthRedirectUri:
    process.env.ZALO_OAUTH_REDIRECT_URI ||
    'https://id.onweb.asia/v1/zalo/auth/call-back',
  oauthSuccessRedirectUrl:
    process.env.ZALO_OAUTH_SUCCESS_REDIRECT_URL ||
    'https://app.comvia.cloud/settings/oa?connected=1',
  znsTrackingId: process.env.ZALO_ZNS_TRACKING_ID || 'send_invoice',
}));
