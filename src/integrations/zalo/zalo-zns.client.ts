import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
      this.configService.get<string>('zalo.znsTrackingId') ??
      'send_invoice';

    const response = await fetch(
      'https://business.openapi.zalo.me/message/template',
      {
        method: 'POST',
        headers: {
          access_token: input.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: input.phoneNumber,
          template_id: input.templateId,
          template_data: input.templateData,
          tracking_id: trackingId,
        }),
      },
    );

    const payload = (await response.json()) as ZaloZnsSendResponse;
    if (!response.ok || payload.error !== 0) {
      this.logger.error(
        `[Zalo ZNS] Send failed: ${JSON.stringify(payload)}`,
      );
      throw new Error(payload.message || 'Zalo ZNS send failed');
    }

    return payload;
  }
}
