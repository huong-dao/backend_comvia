import { ZaloZnsClient } from './zalo-zns.client';

describe('ZaloZnsClient', () => {
  const configService = {
    get: jest.fn().mockReturnValue('zns'),
  };
  const client = new ZaloZnsClient(configService as never);

  beforeEach(() => {
    jest.restoreAllMocks();
    configService.get.mockReturnValue('zns');
  });

  it.each([
    ['0987654321', '84987654321'],
    ['84 987 654 321', '84987654321'],
  ])(
    'sends the recipient number in Zalo country-code format',
    async (input, expected) => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: 0,
          message: 'Success',
          data: { msg_id: 'msg-1' },
        }),
      } as unknown as Response);

      await client.sendTemplate({
        accessToken: 'access-token',
        phoneNumber: input,
        templateId: 'template-id',
        templateData: { customer_name: 'Nguyen Van A' },
        trackingId: 'track123',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://business.openapi.zalo.me/message/template',
        expect.objectContaining({
          body: `{"phone":"${expected}","template_id":"template-id","template_data":{"customer_name":"Nguyen Van A"},"tracking_id":"track123"}`,
        }),
      );
    },
  );

  it('rejects a recipient number that Zalo cannot accept', async () => {
    await expect(
      client.sendTemplate({
        accessToken: 'access-token',
        phoneNumber: '12345',
        templateId: 'template-id',
        templateData: {},
      }),
    ).rejects.toThrow('Phone number must be a Vietnamese mobile number');
  });
});
