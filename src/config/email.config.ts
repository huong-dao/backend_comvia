import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  fromName: process.env.SMTP_FROM_NAME || 'COMVIA',
  fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
  otpSubject: process.env.OTP_EMAIL_SUBJECT || 'comvia - OTP xác thực',
}));
