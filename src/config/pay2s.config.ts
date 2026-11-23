import { registerAs } from '@nestjs/config';

const REQUIRED_PAY2S_ENV = [
  'PAY2S_PARTNER_CODE',
  'PAY2S_API_KEY',
  'PAY2S_API_SECRET',
  'PAY2S_API_URL',
] as const;

/**
 * Cấu hình Pay2S lấy hoàn toàn từ biến môi trường, KHÔNG có giá trị mặc định
 * cho thông tin kết nối: thiếu biến thì dừng ngay lúc khởi động thay vì âm thầm
 * rơi về một môi trường khác (trước đây mặc định là sandbox → QR không có tiền
 * thật, webhook không bao giờ tới, đơn kẹt `PENDING`).
 *
 * Bỏ qua kiểm tra khi `NODE_ENV=test` (jest) vì test không gọi Pay2S thật.
 */
export default registerAs('pay2s', () => {
  const missing = REQUIRED_PAY2S_ENV.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    throw new Error(
      `Thiếu biến môi trường Pay2S: ${missing.join(', ')}. ` +
        'Cần cấu hình đầy đủ (production hoặc môi trường test của Pay2S) trước khi khởi động.',
    );
  }

  return {
    partnerCode: process.env.PAY2S_PARTNER_CODE ?? '',
    apiKey: process.env.PAY2S_API_KEY ?? '',
    apiSecret: process.env.PAY2S_API_SECRET ?? '',
    apiUrl: process.env.PAY2S_API_URL ?? '',
    partnerName: process.env.PAY2S_PARTNER_NAME || 'Comvia',
    webhookTokens: process.env.PAY2S_WEBHOOK_TOKENS?.split(',') || [],
  };
});
