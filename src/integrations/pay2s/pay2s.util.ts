import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { Pay2sRequestError } from './pay2s.errors';

export type Pay2sBankAccount = {
  account_number: string;
  bank_id: string;
};

export type Pay2sConfigData = {
  partner_code: string;
  partner_name?: string;
  api_key: string;
  api_secret: string;
  api_url: string;
};

export type CreatePay2sCollectionLinkInput = {
  amount: number | string;
  orderId: string | number;
  orderInfo: string;
  bankAccounts: Pay2sBankAccount[];
  redirectUrl: string;
  ipnUrl: string;
  requestType?: string;
  partnerName?: string;
  pay2sConfigData: Pay2sConfigData;
};

export type Pay2sCollectionLinkResponse = {
  // Standard format
  resultCode?: number;
  resultMessage?: string;
  qrList?: Array<{
    qrCode: string;
    bankId: string;
    bankName: string;
  }>;
  orderId?: string;
  requestId?: string;
  signature?: string;
  // Additional fields from Pay2S documentation
  payUrl?: string;
  transId?: string;
  responseTime?: number;
  // Alternative error format from API
  status?: boolean;
  message?: string;
};

function generatePay2sSignature(
  params: Record<string, string>,
  secretKey: string,
) {
  const sortedKeys = Object.keys(params).sort();
  const rawHash = sortedKeys.map((key) => `${key}=${params[key]}`).join('&');

  return crypto.createHmac('sha256', secretKey).update(rawHash).digest('hex');
}

/** Thời gian chờ tối đa khi gọi Pay2S (người dùng đang đợi QR). */
export const PAY2S_REQUEST_TIMEOUT_MS = 15_000;

const MAX_LOGGED_DETAIL_LENGTH = 500;

const logger = new Logger('Pay2S');

/** Cắt body phản hồi và che các giá trị nhạy cảm trước khi ghi log. */
function sanitizeDetail(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join('[redacted]');
  }
  return result.length > MAX_LOGGED_DETAIL_LENGTH
    ? `${result.slice(0, MAX_LOGGED_DETAIL_LENGTH)}…`
    : result;
}

/**
 * Gọi API tạo Collection Link của Pay2S.
 *
 * Thành công → trả body JSON của Pay2S (caller tự kiểm tra `status`/`resultCode`).
 * Thất bại → ghi log kèm `orderId`, `requestId` rồi ném `Pay2sRequestError` đã
 * phân loại. KHÔNG log `accessKey`, `signature`, `api_secret` hay body request.
 */
export async function createPay2sCollectionLink({
  amount,
  orderId,
  orderInfo,
  bankAccounts,
  redirectUrl,
  ipnUrl,
  requestType = 'pay2s',
  pay2sConfigData,
}: CreatePay2sCollectionLinkInput): Promise<Pay2sCollectionLinkResponse> {
  const requestId = uuid();
  const orderRef = orderId.toString();

  const fail = (error: Pay2sRequestError): never => {
    logger.error(
      `Tạo collection link thất bại: kind=${error.kind} orderId=${orderRef} requestId=${requestId}` +
        (error.httpStatus !== undefined
          ? ` httpStatus=${error.httpStatus}`
          : '') +
        ` message="${error.message}"` +
        (error.detail ? ` detail=${error.detail}` : ''),
    );
    throw error;
  };

  // Validate orderInfo according to Pay2S requirements
  if (!orderInfo || orderInfo.length < 10 || orderInfo.length > 32) {
    return fail(
      new Pay2sRequestError('validation', 'orderInfo phải từ 10-32 ký tự'),
    );
  }

  // Check for invalid characters (only letters and numbers allowed)
  if (!/^[a-zA-Z0-9]+$/.test(orderInfo)) {
    return fail(
      new Pay2sRequestError(
        'validation',
        'orderInfo chỉ được chứa chữ cái và số (không có ký tự đặc biệt)',
      ),
    );
  }

  const {
    partner_code: partnerCode,
    partner_name: partnerName,
    api_key: accessKey,
    api_secret: secretKey,
    api_url: apiUrl,
  } = pay2sConfigData;

  const bankList = bankAccounts.map((account) => ({
    account_number: account.account_number.toString().trim(),
    bank_id: account.bank_id.toString().trim(),
  }));

  // Tham số đưa vào chữ ký (sắp xếp theo key, HMAC-SHA256 bằng api_secret)
  const signatureParams: Record<string, string> = {
    accessKey,
    amount: amount.toString(),
    bankAccounts: 'Array',
    ipnUrl,
    orderId: orderRef,
    orderInfo,
    partnerCode,
    redirectUrl,
    requestId,
    requestType,
  };

  const signature = generatePay2sSignature(signatureParams, secretKey);

  // Body tạo Collection Link của Pay2S
  const requestData = {
    accessKey,
    partnerCode,
    partnerName: partnerName || 'Comvia',
    requestId,
    amount: amount.toString(),
    orderId: orderRef,
    orderInfo,
    bankAccounts: bankList,
    redirectUrl,
    ipnUrl,
    requestType,
    signature,
  };

  const secretsToRedact = [accessKey, secretKey, signature];
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PAY2S_REQUEST_TIMEOUT_MS,
  );

  try {
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return fail(
          new Pay2sRequestError(
            'timeout',
            `Pay2S không phản hồi sau ${PAY2S_REQUEST_TIMEOUT_MS}ms`,
          ),
        );
      }
      return fail(
        new Pay2sRequestError(
          'network',
          error instanceof Error ? error.message : 'Lỗi kết nối tới Pay2S',
        ),
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return fail(
        new Pay2sRequestError(
          'http',
          `Pay2S trả HTTP ${response.status} ${response.statusText}`.trim(),
          response.status,
          sanitizeDetail(body, secretsToRedact),
        ),
      );
    }

    try {
      return (await response.json()) as Pay2sCollectionLinkResponse;
    } catch {
      return fail(
        new Pay2sRequestError(
          'invalid_response',
          'Phản hồi của Pay2S không phải JSON hợp lệ',
          response.status,
        ),
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyPay2sSignature(
  params: Record<string, string>,
  signature: string,
  secretKey: string,
): boolean {
  const expectedSignature = generatePay2sSignature(params, secretKey);
  return signature === expectedSignature;
}

export function generatePay2sSignatureString(
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys.map((key) => `${key}=${params[key]}`).join('&');
}
