import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';
import {
  buildOtpVerificationTemplate,
  OtpVerificationTemplateInput,
} from './templates/otp-verification.template';

export type SendOtpVerificationEmailInput = OtpVerificationTemplateInput & {
  to: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const smtpUser = this.configService.get<string>('email.smtpUser');
    const smtpPass = this.configService.get<string>('email.smtpPass');

    if (!smtpUser || !smtpPass) {
      throw new InternalServerErrorException('SMTP is not configured');
    }

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('email.smtpHost'),
      port: this.configService.get<number>('email.smtpPort'),
      secure: this.configService.get<boolean>('email.smtpSecure'),
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    return this.transporter;
  }

  async sendOtpVerificationEmail(
    input: SendOtpVerificationEmailInput,
  ): Promise<void> {
    const fromName =
      this.configService.get<string>('email.fromName') || 'COMVIA';
    const fromEmail =
      this.configService.get<string>('email.fromEmail') ||
      this.configService.get<string>('email.smtpUser');
    const subject =
      this.configService.get<string>('email.otpSubject') ||
      'comvia - OTP xác thực';

    const { html, attachments } = buildOtpVerificationTemplate({
      otpCode: input.otpCode,
      expiresInMinutes: input.expiresInMinutes,
    });

    try {
      await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: input.to,
        subject,
        html,
        attachments,
      });
    } catch (error) {
      this.logger.error(
        `[Email] Failed to send OTP to ${input.to}: ${String(error)}`,
      );
      throw new InternalServerErrorException('Failed to send OTP email');
    }
  }
}
