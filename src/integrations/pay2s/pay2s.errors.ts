import { BadRequestException } from '@nestjs/common';

/**
 * Phân loại lỗi khi gọi API tạo Collection Link của Pay2S:
 * - validation: dữ liệu gửi đi sai (ví dụ `orderInfo`), lỗi phía Comvia
 * - timeout / network: không nhận được phản hồi từ Pay2S
 * - http: Pay2S trả HTTP không thành công (4xx/5xx)
 * - invalid_response: Pay2S trả 2xx nhưng body không phải JSON hợp lệ
 */
export type Pay2sRequestErrorKind =
  | 'validation'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_response';

/** Lỗi nội bộ (không trả cho client): chi tiết chỉ dùng để log. */
export class Pay2sRequestError extends Error {
  constructor(
    readonly kind: Pay2sRequestErrorKind,
    message: string,
    readonly httpStatus?: number,
    /** Phần đầu body phản hồi của Pay2S (đã cắt và che thông tin ký). */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'Pay2sRequestError';
  }
}

/** Mã lỗi ổn định trả cho FE khi không tạo được QR thanh toán. */
export const PAY2S_UNAVAILABLE_CODE = 'PAY2S_UNAVAILABLE';
export const PAY2S_UNAVAILABLE_MESSAGE =
  'Cổng thanh toán đang bận, vui lòng thử lại sau.';

/** Lỗi `400` trả cho client; nguyên nhân thật chỉ nằm trong log. */
export function pay2sUnavailableException(): BadRequestException {
  return new BadRequestException({
    code: PAY2S_UNAVAILABLE_CODE,
    message: PAY2S_UNAVAILABLE_MESSAGE,
  });
}
