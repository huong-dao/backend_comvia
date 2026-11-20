import { registerAs } from '@nestjs/config';

export default registerAs('email', () => {
  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  return {
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort,
    smtpSecure:
      process.env.SMTP_SECURE === undefined
        ? smtpPort === 465
        : process.env.SMTP_SECURE === 'true',
    // Gmail account that authorized the OAuth2 refresh token.
    smtpUser: process.env.SMTP_USER || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    fromName: process.env.SMTP_FROM_NAME || 'COMVIA',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
    otpSubject: process.env.OTP_EMAIL_SUBJECT || 'comvia - OTP xác thực',
    invitationSubject:
      process.env.INVITATION_EMAIL_SUBJECT || 'COMVIA - Workspace invitation',
    appBaseUrl: process.env.COMVIA_APP_BASE_URL || 'https://app.comvia.cloud',
  };
});
