import { BadRequestException } from '@nestjs/common';
import { ZaloZnsRejectedError } from '../integrations/zalo/zalo-zns.client';
import {
  SEND_ERROR_CODES,
  sendErrorBody,
  toSendErrorBody,
} from './send-error-messages';

describe('toSendErrorBody', () => {
  it('maps a coded BadRequest to its Vietnamese message', () => {
    const error = new BadRequestException(
      sendErrorBody(SEND_ERROR_CODES.OA_TOKEN_EXPIRED),
    );

    expect(toSendErrorBody(error)).toEqual({
      code: SEND_ERROR_CODES.OA_TOKEN_EXPIRED,
      message: 'OA token đã hết hạn. Vui lòng kết nối lại Zalo OA.',
    });
  });

  it('maps a Zalo rejection to a generic message and keeps the raw text as detail', () => {
    const error = new ZaloZnsRejectedError('Template is not approved');

    expect(toSendErrorBody(error)).toEqual({
      code: SEND_ERROR_CODES.ZALO_REJECTED,
      message:
        'Zalo từ chối gửi tin. Vui lòng kiểm tra lại mẫu tin và thử lại sau.',
      detail: 'Template is not approved',
    });
  });

  it('falls back to SEND_FAILED for unknown errors', () => {
    expect(toSendErrorBody(new Error('socket hang up'))).toEqual({
      code: SEND_ERROR_CODES.SEND_FAILED,
      message: 'Gửi tin thất bại. Vui lòng thử lại sau.',
      detail: 'socket hang up',
    });
  });
});
