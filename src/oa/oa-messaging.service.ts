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

    const providerMessageId = response.data?.msg_id;
    if (!providerMessageId) {
      throw new BadRequestException('Zalo ZNS response missing msg_id');
    }

    return {
      providerMessageId,
      providerResponse: response as unknown as Record<string, unknown>,
    };
  }
}
