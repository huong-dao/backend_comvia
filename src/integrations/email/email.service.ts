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
import { buildWorkspaceInvitationTemplate } from './templates/workspace-invitation.template';
import {
  buildSubscriptionExpiryTemplate,
  buildWalletLowBalanceTemplate,
  SubscriptionExpiryTemplateInput,
  WalletLowBalanceTemplateInput,
} from './templates/reminder.templates';

export type SendOtpVerificationEmailInput = OtpVerificationTemplateInput & {
  to: string;
};

export type SendWorkspaceInvitationEmailInput = {
  to: string;
  workspaceId: string;
  workspaceName: string;
  token: string;
  expiresAt: Date;
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
    const clientId = this.configService.get<string>('email.googleClientId');
    const clientSecret = this.configService.get<string>(
      'email.googleClientSecret',
    );
    const refreshToken = this.configService.get<string>(
      'email.googleRefreshToken',
    );

    if (!smtpUser || !clientId || !clientSecret || !refreshToken) {
      throw new InternalServerErrorException('Gmail OAuth2 chưa được cấu hình');
    }

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('email.smtpHost'),
      port: this.configService.get<number>('email.smtpPort'),
      secure: this.configService.get<boolean>('email.smtpSecure'),
      auth: {
        type: 'OAuth2',
        user: smtpUser,
        clientId,
        clientSecret,
        refreshToken,
      },
    });

    return this.transporter;
  }

  async sendOtpVerificationEmail(
    input: SendOtpVerificationEmailInput,
    subjectOverride?: string,
  ): Promise<void> {
    const fromName =
      this.configService.get<string>('email.fromName') || 'COMVIA';
    const fromEmail =
      this.configService.get<string>('email.fromEmail') ||
      this.configService.get<string>('email.smtpUser');
    const subject =
      subjectOverride ||
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
      throw new InternalServerErrorException('Gửi email OTP thất bại');
    }
  }

  async sendPasswordResetOtpEmail(
    input: SendOtpVerificationEmailInput,
  ): Promise<void> {
    return this.sendOtpVerificationEmail(input, 'COMVIA - Password reset OTP');
  }

  async sendWorkspaceInvitationEmail(
    input: SendWorkspaceInvitationEmailInput,
  ): Promise<void> {
    const fromName =
      this.configService.get<string>('email.fromName') || 'COMVIA';
    const fromEmail =
      this.configService.get<string>('email.fromEmail') ||
      this.configService.get<string>('email.smtpUser');
    const subject =
      this.configService.get<string>('email.invitationSubject') ||
      'COMVIA - Workspace invitation';
    const acceptUrl = this.buildWorkspaceInvitationUrl(
      input.workspaceId,
      input.token,
    );

    try {
      await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: input.to,
        subject,
        html: buildWorkspaceInvitationTemplate({
          workspaceName: input.workspaceName,
          acceptUrl,
          expiresAt: input.expiresAt,
        }),
      });
    } catch (error) {
      this.logger.error(
        `[Email] Failed to send workspace invitation to ${input.to}: ${String(error)}`,
      );
      throw new InternalServerErrorException(
        'Workspace invitation email delivery failed',
      );
    }
  }

  /** Đường dẫn FE (app) dùng trong mail nhắc, ví dụ /app/subscription. */
  buildAppUrl(path: string): string {
    const appBaseUrl =
      this.configService.get<string>('email.appBaseUrl') ||
      'https://app.comvia.cloud';
    try {
      return new URL(path, appBaseUrl).toString();
    } catch {
      return appBaseUrl;
    }
  }

  async sendSubscriptionExpiryReminderEmail(
    input: SubscriptionExpiryTemplateInput & { to: string },
  ): Promise<void> {
    await this.sendReminder(
      input.to,
      'COMVIA - Gói subscription sắp hết hạn',
      buildSubscriptionExpiryTemplate(input),
    );
  }

  async sendWalletLowBalanceEmail(
    input: WalletLowBalanceTemplateInput & { to: string },
  ): Promise<void> {
    await this.sendReminder(
      input.to,
      'COMVIA - Số dư ví sắp hết',
      buildWalletLowBalanceTemplate(input),
    );
  }

  private async sendReminder(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const fromName =
      this.configService.get<string>('email.fromName') || 'COMVIA';
    const fromEmail =
      this.configService.get<string>('email.fromEmail') ||
      this.configService.get<string>('email.smtpUser');
    try {
      await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(
        `[Email] Failed to send "${subject}" to ${to}: ${String(error)}`,
      );
      throw new InternalServerErrorException('Gửi email nhắc thất bại');
    }
  }

  private buildWorkspaceInvitationUrl(
    workspaceId: string,
    token: string,
  ): string {
    const appBaseUrl =
      this.configService.get<string>('email.appBaseUrl') ||
      'https://app.comvia.cloud';

    let invitationUrl: URL;
    try {
      invitationUrl = new URL('/app/invitations/accept', appBaseUrl);
    } catch {
      throw new InternalServerErrorException(
        'COMVIA_APP_BASE_URL is invalid for invitation email',
      );
    }
    invitationUrl.searchParams.set('workspaceId', workspaceId);
    invitationUrl.searchParams.set('token', token);
    return invitationUrl.toString();
  }
}
