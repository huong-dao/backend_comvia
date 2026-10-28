import { HttpException } from '@nestjs/common';
import { ZaloZnsRejectedError } from '../integrations/zalo/zalo-zns.client';

export const SEND_ERROR_CODES = {
  TEMPLATE_NOT_APPROVED: 'TEMPLATE_NOT_APPROVED',
  TEMPLATE_NOT_SYNCED: 'TEMPLATE_NOT_SYNCED',
  OA_NOT_CONNECTED: 'OA_NOT_CONNECTED',
  OA_TOKEN_MISSING: 'OA_TOKEN_MISSING',
  OA_TOKEN_EXPIRED: 'OA_TOKEN_EXPIRED',
  WORKSPACE_INACTIVE: 'WORKSPACE_INACTIVE',
  WALLET_NOT_INITIALIZED: 'WALLET_NOT_INITIALIZED',
  INSUFFICIENT_CREDIT: 'INSUFFICIENT_CREDIT',
  ZALO_REJECTED: 'ZALO_REJECTED',
  SEND_FAILED: 'SEND_FAILED',
} as const;

export type SendErrorCode =
  (typeof SEND_ERROR_CODES)[keyof typeof SEND_ERROR_CODES];

export const SEND_SUCCESS_MESSAGE = 'Đã gửi tin thành công.';

export const SEND_ERROR_MESSAGES: Record<SendErrorCode, string> = {
  TEMPLATE_NOT_APPROVED: 'Mẫu tin không tồn tại hoặc chưa được duyệt.',
  TEMPLATE_NOT_SYNCED:
    'Mẫu tin chưa được đồng bộ với Zalo. Vui lòng liên hệ quản trị viên.',
  OA_NOT_CONNECTED:
    'Official Account chưa kết nối với Zalo. Vui lòng kết nối OA trong phần Cài đặt.',
  OA_TOKEN_MISSING:
    'Thiếu thông tin xác thực của Zalo OA. Vui lòng kết nối lại OA.',
  OA_TOKEN_EXPIRED: 'OA token đã hết hạn. Vui lòng kết nối lại Zalo OA.',
  WORKSPACE_INACTIVE: 'Workspace đang tạm khóa. Vui lòng liên hệ hỗ trợ.',
  WALLET_NOT_INITIALIZED: 'Ví chưa được khởi tạo. Vui lòng liên hệ hỗ trợ.',
  INSUFFICIENT_CREDIT: 'Số dư không đủ để gửi tin. Vui lòng nạp thêm tiền.',
  ZALO_REJECTED:
    'Zalo từ chối gửi tin. Vui lòng kiểm tra lại mẫu tin và thử lại sau.',
  SEND_FAILED: 'Gửi tin thất bại. Vui lòng thử lại sau.',
};

export interface SendErrorBody {
  code: SendErrorCode;
  message: string;
  /** Raw provider or internal message, for support. Not for end users. */
  detail?: string;
}

export function sendErrorBody(
  code: SendErrorCode,
  detail?: string,
): SendErrorBody {
  return {
    code,
    message: SEND_ERROR_MESSAGES[code],
    ...(detail ? { detail } : {}),
  };
}

/** Map any dispatch failure to a stable code and a Vietnamese message. */
export function toSendErrorBody(error: unknown): SendErrorBody {
  if (error instanceof ZaloZnsRejectedError) {
    return sendErrorBody(SEND_ERROR_CODES.ZALO_REJECTED, error.message);
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (
      typeof response === 'object' &&
      response !== null &&
      'code' in response
    ) {
      const code = (response as { code: unknown }).code;
      if (typeof code === 'string' && code in SEND_ERROR_MESSAGES) {
        return sendErrorBody(code as SendErrorCode);
      }
    }
  }

  return sendErrorBody(
    SEND_ERROR_CODES.SEND_FAILED,
    error instanceof Error ? error.message : undefined,
  );
}
