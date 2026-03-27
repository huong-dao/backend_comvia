import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';

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

export async function createPay2sCollectionLink({
  amount,
  orderId,
  orderInfo,
  bankAccounts,
  redirectUrl,
  ipnUrl,
  requestType = 'pay2s',
  pay2sConfigData,
}: CreatePay2sCollectionLinkInput): Promise<Pay2sCollectionLinkResponse | null> {
  try {
    // Validate orderInfo according to Pay2S requirements
    if (!orderInfo || orderInfo.length < 10 || orderInfo.length > 32) {
      throw new Error('orderInfo must be between 10-32 characters');
    }

    // Check for invalid characters (only letters and numbers allowed)
    const validOrderInfo = /^[a-zA-Z0-9]+$/.test(orderInfo);
    if (!validOrderInfo) {
      throw new Error(
        'orderInfo can only contain letters and numbers (no special characters)',
      );
    }

    const {
      partner_code: partnerCode,
      partner_name: partnerName,
      api_key: accessKey,
      api_secret: secretKey,
      api_url: apiUrl,
    } = pay2sConfigData;

    const requestId = uuid();

    const bankList = bankAccounts.map((account) => ({
      account_number: account.account_number.toString().trim(),
      bank_id: account.bank_id.toString().trim(),
    }));

    // For Pay2S sandbox API, the signature parameters might be different
    const signatureParams: Record<string, string> = {
      accessKey,
      amount: amount.toString(),
      bankAccounts: 'Array',
      ipnUrl,
      orderId: orderId.toString(),
      orderInfo,
      partnerCode,
      redirectUrl,
      requestId,
      requestType,
    };

    const signature = generatePay2sSignature(signatureParams, secretKey);

    // Request structure for Pay2S sandbox API
    const requestData = {
      accessKey,
      partnerCode,
      partnerName: partnerName || 'Comvia',
      requestId,
      amount: amount.toString(),
      orderId: orderId.toString(),
      orderInfo,
      orderType: requestType,
      bankAccounts: bankList,
      redirectUrl,
      ipnUrl,
      requestType,
      signature,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      console.log('Pay2S API Request:', {
        url: apiUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData, null, 2),
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      console.log('Pay2S API Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Pay2S API Error Response:', errorText);
        throw new Error(
          `Pay2S API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();
      console.log('Pay2S API Response Data:', data);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('createPay2sCollectionLink error', {
      orderId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return null;
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
