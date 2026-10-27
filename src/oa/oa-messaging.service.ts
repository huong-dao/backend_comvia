import { BadRequestException, Injectable } from '@nestjs/common';
import { ZaloZnsClient } from '../integrations/zalo/zalo-zns.client';
import { OaTokenService } from './oa-token.service';

export type DispatchZnsInput = {
  oaConnectionId: string;
  phoneNumber: string;
  providerTemplateId: string;
  templateData: Record<string, unknown>;
  trackingId?: string;
};

export type DispatchZnsResult = {
  providerMessageId: string;
  providerTrackingId: string;
  providerSentAt: Date | null;
  providerQuotaDaily: number | null;
  providerQuotaRemaining: number | null;
  providerResponse: Record<string, unknown>;
};

@Injectable()
export class OaMessagingService {
  constructor(
    private readonly oaTokenService: OaTokenService,
    private readonly zaloZnsClient: ZaloZnsClient,
  ) {}

  async dispatchZnsTemplate(
    input: DispatchZnsInput,
  ): Promise<DispatchZnsResult> {
    if (!input.providerTemplateId) {
      throw new BadRequestException(
        'Template is missing Zalo providerTemplateId',
      );
    }

    const accessToken = await this.oaTokenService.getValidAccessToken(
      input.oaConnectionId,
    );

    const response = await this.zaloZnsClient.sendTemplate({
      accessToken,
      phoneNumber: input.phoneNumber,
      templateId: input.providerTemplateId,
      templateData: input.templateData,
      trackingId: input.trackingId,
    });

    const providerMessageId = response.response.data?.msg_id;
    if (!providerMessageId) {
      throw new BadRequestException('Zalo ZNS response missing msg_id');
    }

    return {
      providerMessageId,
      providerTrackingId: response.trackingId,
      providerSentAt: this.parseProviderTimestamp(
        response.response.data?.sent_time,
      ),
      providerQuotaDaily: this.parseQuotaValue(
        response.response.data?.quota?.dailyQuota,
      ),
      providerQuotaRemaining: this.parseQuotaValue(
        response.response.data?.quota?.remainingQuota,
      ),
      providerResponse: response.response as unknown as Record<string, unknown>,
    };
  }

  private parseProviderTimestamp(value: string | undefined): Date | null {
    if (!value || !/^\d+$/.test(value)) return null;
    const timestamp = Number(value);
    if (!Number.isSafeInteger(timestamp)) return null;
    const milliseconds =
      timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseQuotaValue(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const quota = Number(value);
    return Number.isSafeInteger(quota) && quota >= 0 ? quota : null;
  }
}
