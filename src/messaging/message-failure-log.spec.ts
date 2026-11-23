import { BadRequestException } from '@nestjs/common';
import { ZaloZnsRejectedError } from '../integrations/zalo/zalo-zns.client';
import {
  failureReasonFromError,
  recordFailedMessage,
  withMessageLogId,
} from './message-failure-log';
import { SEND_ERROR_CODES, sendErrorBody } from './send-error-messages';

describe('failureReasonFromError', () => {
  it('prefixes the stable code to the Vietnamese message for coded errors', () => {
    const reason = failureReasonFromError(
      new BadRequestException(sendErrorBody(SEND_ERROR_CODES.OA_NOT_CONNECTED)),
    );
    expect(reason).toMatch(/^OA_NOT_CONNECTED: Official Account chưa kết nối/);
  });

  it('keeps the raw Zalo text for provider rejections', () => {
    expect(
      failureReasonFromError(
        new ZaloZnsRejectedError('Template is not approved'),
      ),
    ).toBe('ZALO_REJECTED: Template is not approved');
  });

  it('truncates to the requested length', () => {
    expect(
      failureReasonFromError(new Error('x'.repeat(500)), 255),
    ).toHaveLength(255);
  });
});

describe('recordFailedMessage', () => {
  const input = {
    workspaceId: 'ws-1',
    oaConnectionId: 'oa-1',
    templateId: 'tpl-1',
    sendType: 'SINGLE' as const,
    phoneNumber: '0900000000',
    payloadSnapshot: {},
    error: new BadRequestException(
      sendErrorBody(SEND_ERROR_CODES.OA_NOT_CONNECTED),
    ),
  };

  it('stores FAILED with the reason and the attempt time', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });

    const id = await recordFailedMessage(
      { messageLog: { create } } as never,
      input,
    );

    expect(id).toBe('log-1');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        errorCode: expect.stringMatching(/^OA_NOT_CONNECTED: /),
        sentAt: expect.any(Date),
      }),
    });
  });

  it('never throws when the log write itself fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(
      recordFailedMessage({ messageLog: { create } } as never, input),
    ).resolves.toBeUndefined();
  });
});

describe('withMessageLogId', () => {
  it('keeps the HTTP status and adds the log id', () => {
    const result = withMessageLogId(
      new BadRequestException(sendErrorBody(SEND_ERROR_CODES.OA_NOT_CONNECTED)),
      'log-1',
    ) as BadRequestException;

    expect(result.getStatus()).toBe(400);
    expect(result.getResponse()).toMatchObject({
      code: 'OA_NOT_CONNECTED',
      messageLogId: 'log-1',
    });
  });

  it('returns the original error when there is no log id', () => {
    const error = new BadRequestException('x');
    expect(withMessageLogId(error, undefined)).toBe(error);
  });
});
