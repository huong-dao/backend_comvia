import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExtractedInvoicePdfData } from '../../orders/invoice-pdf-verification.types';

const EXTRACTION_PROMPT = `You extract structured invoice data from a Vietnamese electronic invoice PDF.
Return ONLY valid JSON matching this schema (use null when unknown):
{
  "invoiceNumber": string | null,
  "issueDate": "YYYY-MM-DD" | null,
  "billingType": "organization" | "individual" | "unknown" | null,
  "companyName": string | null,
  "taxCode": string | null,
  "address": string | null,
  "invoiceEmail": string | null,
  "representativeName": string | null,
  "phone": string | null,
  "fullName": string | null,
  "citizenId": string | null,
  "lineItemName": string | null,
  "vatRatePercent": number | null,
  "amountExclVat": number | null,
  "vatAmount": number | null,
  "amountInclVat": number | null
}
Rules:
- Monetary values are VND integers without currency symbols.
- taxCode is digits only if possible.
- issueDate must be ISO date YYYY-MM-DD when found.
- Do not include markdown fences or commentary.`;

@Injectable()
export class GeminiInvoicePdfService {
  constructor(private readonly configService: ConfigService) {}

  private isDemoMode(): boolean {
    const raw = this.configService.get<string>('DEMO_MODE');
    return raw === 'true' || raw === '1';
  }

  async extractInvoiceData(
    pdfBuffer: Buffer,
    fallback?: ExtractedInvoicePdfData,
  ): Promise<ExtractedInvoicePdfData> {
    const apiKey = this.configService.get<string>('gemini.apiKey') ?? '';
    if (!apiKey) {
      if (this.isDemoMode() && fallback) {
        return fallback;
      }
      throw new ServiceUnavailableException(
        'Gemini API is not configured on server',
      );
    }

    const model =
      this.configService.get<string>('gemini.model') ?? 'gemini-2.0-flash';
    const timeoutMs =
      this.configService.get<number>('gemini.timeoutMs') ?? 60_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: EXTRACTION_PROMPT },
                  {
                    inline_data: {
                      mime_type: 'application/pdf',
                      data: pdfBuffer.toString('base64'),
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0,
            },
          }),
        },
      );

      if (!response.ok) {
        console.error(
          `[Gemini Invoice PDF] upstream status=${response.status}`,
        );
        throw new BadGatewayException(
          'Không thể phân tích PDF hóa đơn lúc này. Vui lòng thử lại sau.',
        );
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new BadGatewayException(
          'Gemini không trả về dữ liệu trích xuất từ PDF',
        );
      }

      return this.parseExtractedJson(text);
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException(
          'Phân tích PDF hóa đơn quá thời gian cho phép',
        );
      }
      console.error('[Gemini Invoice PDF] Error:', error);
      throw new BadGatewayException(
        'Không thể phân tích PDF hóa đơn lúc này. Vui lòng thử lại sau.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  getModelName(): string {
    return this.configService.get<string>('gemini.model') ?? 'gemini-2.0-flash';
  }

  getPromptVersion(): string {
    return this.configService.get<string>('gemini.promptVersion') ?? 'v1';
  }

  private parseExtractedJson(raw: string): ExtractedInvoicePdfData {
    try {
      const parsed = JSON.parse(raw) as ExtractedInvoicePdfData;
      return {
        invoiceNumber: parsed.invoiceNumber ?? null,
        issueDate: parsed.issueDate ?? null,
        billingType: parsed.billingType ?? null,
        companyName: parsed.companyName ?? null,
        taxCode: parsed.taxCode ?? null,
        address: parsed.address ?? null,
        invoiceEmail: parsed.invoiceEmail ?? null,
        representativeName: parsed.representativeName ?? null,
        phone: parsed.phone ?? null,
        fullName: parsed.fullName ?? null,
        citizenId: parsed.citizenId ?? null,
        lineItemName: parsed.lineItemName ?? null,
        vatRatePercent:
          parsed.vatRatePercent != null ? Number(parsed.vatRatePercent) : null,
        amountExclVat:
          parsed.amountExclVat != null ? Number(parsed.amountExclVat) : null,
        vatAmount: parsed.vatAmount != null ? Number(parsed.vatAmount) : null,
        amountInclVat:
          parsed.amountInclVat != null ? Number(parsed.amountInclVat) : null,
      };
    } catch {
      throw new BadGatewayException(
        'Gemini trả về JSON không hợp lệ khi trích xuất PDF',
      );
    }
  }
}
