import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ZaloZnsSendResult, ZaloZnsSendResponse } from './zalo.types';
import { normalizeVietnamesePhone } from '../../common/utils/vn-phone';

export type SendZnsTemplateInput = {
  accessToken: string;
  phoneNumber: string;
  templateId: string;
  templateData: Record<string, unknown>;
  trackingId?: string;
};

/** A parsed Zalo rejection means the provider did not accept the send. */
export class ZaloZnsRejectedError extends Error {}

@Injectable()
export class ZaloZnsClient {
  private readonly logger = new Logger(ZaloZnsClient.name);

  constructor(private readonly configService: ConfigService) {}

  async sendTemplate(input: SendZnsTemplateInput): Promise<ZaloZnsSendResult> {
    const trackingId =
      input.trackingId !== undefined
        ? this.sanitizeTrackingId(input.trackingId)
        : this.createTrackingId();
    const phone = this.normalizePhoneNumber(input.phoneNumber);

    const response = await fetch(
      'https://business.openapi.zalo.me/message/template',
      {
        method: 'POST',
        headers: {
          access_token: input.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          template_id: input.templateId,
          template_data: input.templateData,
          tracking_id: trackingId,
        }),
      },
    );

    const payload = (await response.json()) as ZaloZnsSendResponse;
    if (!response.ok || payload.error !== 0) {
      this.logger.error(`[Zalo ZNS] Send failed: ${JSON.stringify(payload)}`);
      throw new ZaloZnsRejectedError(payload.message || 'Zalo ZNS send failed');
    }

    return { response: payload, trackingId };
  }

  private createTrackingId(): string {
    const configuredPrefix =
      this.configService.get<string>('zalo.znsTrackingId') ?? 'zns';
    const prefix = this.sanitizeTrackingId(configuredPrefix);
    return `${prefix}${Date.now()}${randomUUID().replaceAll('-', '')}`.slice(
      0,
      48,
    );
  }

  /** Zalo permits at most 48 alphanumeric characters in tracking_id. */
  private sanitizeTrackingId(trackingId: string): string {
    const sanitized = trackingId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
    if (!sanitized) {
      throw new Error(
        'Zalo tracking ID must contain at least one alphanumeric character',
      );
    }
    return sanitized;
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const normalized = normalizeVietnamesePhone(phoneNumber);
    if (normalized) {
      return normalized;
    }

    throw new Error(
      'Phone number must be a Vietnamese mobile number in 0xxxxxxxxx or 84xxxxxxxxx format',
    );
  }
}
