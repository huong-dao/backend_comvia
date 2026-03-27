import { registerAs } from '@nestjs/config';

export default registerAs('pay2s', () => ({
  partnerCode: process.env.PAY2S_PARTNER_CODE || 'PAY2SLNASDTFCHN7JVB3',
  apiKey:
    process.env.PAY2S_API_KEY ||
    'bd60c4368cce7b5e33f52de59b27649eb96ee85919ec804734a0f8a722bbcc9c',
  apiSecret:
    process.env.PAY2S_API_SECRET ||
    '19daf7c211804cee4434fc8c1bbe9f4cffc442e7e7c5f72b82fb04bc42606a5c',
  apiUrl:
    process.env.PAY2S_API_URL ||
    'https://sandbox-payment.pay2s.vn/v1/gateway/api/create',
  partnerName: process.env.PAY2S_PARTNER_NAME || 'Comvia',
  webhookTokens: process.env.PAY2S_WEBHOOK_TOKENS?.split(',') || [],
}));
