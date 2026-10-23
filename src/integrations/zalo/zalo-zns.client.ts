import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ZaloZnsSendResponse } from './zalo.types';

export type SendZnsTemplateInput = {
  accessToken: string;
  phoneNumber: string;
  templateId: string;
  templateData: Record<string, unknown>;
  trackingId?: string;
};

@Injectable()
export class ZaloZnsClient {
  private readonly logger = new Logger(ZaloZnsClient.name);

  constructor(private readonly configService: ConfigService) {}

  async sendTemplate(
    input: SendZnsTemplateInput,
  ): Promise<ZaloZnsSendResponse> {
    const trackingId =
      input.trackingId ??
      `${this.configService.get<string>('zalo.znsTrackingId') ?? 'zns'}${Date.now()}${randomUUID().replaceAll('-', '')}`.slice(
        0,
        48,
      );
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
      throw new Error(payload.message || 'Zalo ZNS send failed');
    }

    return payload;
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const compact = phoneNumber.replace(/[\s.-]/g, '');
    if (/^0\d{9}$/.test(compact)) {
      return `84${compact.slice(1)}`;
    }

    if (/^84\d{9}$/.test(compact)) {
      return compact;
    }

    throw new Error(
      'Phone number must be a Vietnamese mobile number in 0xxxxxxxxx or 84xxxxxxxxx format',
    );
  }
}
