import { OaMessagingService } from './oa-messaging.service';

describe('OaMessagingService', () => {
  it('returns Zalo timing, quota and normalized tracking evidence to each sender', async () => {
    const service = new OaMessagingService(
      {
        getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
      } as never,
      {
        sendTemplate: jest.fn().mockResolvedValue({
          trackingId: 'tracking123',
          response: {
            error: 0,
            message: 'Success',
            data: {
              msg_id: 'provider-msg-1',
              sent_time: '1720000000000',
              quota: { dailyQuota: '500', remainingQuota: '499' },
            },
          },
        }),
      } as never,
    );

    await expect(
      service.dispatchZnsTemplate({
        oaConnectionId: 'oa-1',
        phoneNumber: '0901234567',
        providerTemplateId: 'template-1',
        templateData: {},
      }),
    ).resolves.toMatchObject({
      providerMessageId: 'provider-msg-1',
      providerTrackingId: 'tracking123',
      providerSentAt: new Date(1720000000000),
      providerQuotaDaily: 500,
      providerQuotaRemaining: 499,
    });
  });
});
