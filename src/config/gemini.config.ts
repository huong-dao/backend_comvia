import { registerAs } from '@nestjs/config';

export default registerAs('gemini', () => ({
  apiKey: process.env.GEMINI_API_KEY ?? '',
  model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
  timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 60_000),
  promptVersion: process.env.GEMINI_INVOICE_PROMPT_VERSION ?? 'v1',
}));
