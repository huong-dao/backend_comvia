import { ZNS_LINE_ITEM_KEYWORD } from './invoice-pdf-verification.constants';
import type {
  BillingSnapshotJson,
  ExtractedInvoicePdfData,
  InvoicePdfMismatch,
} from './invoice-pdf-verification.types';
import { INVOICE_PDF_MISMATCH_FIELDS } from './invoice-pdf-verification.constants';

export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTaxCode(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

export function normalizePhone(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '').replace(/^84/, '0');
}

export function textMatches(
  expected: string | null | undefined,
  found: string | null | undefined,
): boolean {
  const a = normalizeText(expected);
  const b = normalizeText(found);
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

export function amountMatches(
  expected: number,
  found: number | null | undefined,
  tolerance = 1,
): boolean {
  if (found == null || Number.isNaN(found)) return false;
  return Math.abs(Math.round(expected) - Math.round(found)) <= tolerance;
}

export function parseIsoDateOnly(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function lineItemNameMatches(found: string | null | undefined): boolean {
  const normalized = normalizeText(found);
  if (!normalized) return false;
  return (
    normalized.includes(ZNS_LINE_ITEM_KEYWORD) ||
    normalized.includes('phi dich vu') ||
    normalized.includes('nap tien') ||
    normalized.includes('topup')
  );
}

export function buildInvoicePdfMismatches(params: {
  billingType: 'ORGANIZATION' | 'INDIVIDUAL';
  billingSnapshot: BillingSnapshotJson;
  extracted: ExtractedInvoicePdfData;
  amountExclVat: number;
  vatAmount: number;
  amountInclVat: number;
  vatRate: number;
  submittedInvoiceNumber?: string;
  submittedIssueDate?: string;
}): InvoicePdfMismatch[] {
  const mismatches: InvoicePdfMismatch[] = [];
  const push = (mismatch: InvoicePdfMismatch) => mismatches.push(mismatch);

  if (params.billingType === 'ORGANIZATION') {
    if (
      !textMatches(
        params.billingSnapshot.companyName,
        params.extracted.companyName,
      )
    ) {
      push({
        field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_COMPANY_NAME,
        severity: 'error',
        expected: params.billingSnapshot.companyName ?? null,
        found: params.extracted.companyName ?? null,
        note: 'Tên doanh nghiệp trên PDF không khớp snapshot billing',
      });
    }
    if (
      !textMatches(
        params.billingSnapshot.representativeName,
        params.extracted.representativeName,
      ) &&
      params.billingSnapshot.representativeName
    ) {
      push({
        field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_REPRESENTATIVE_NAME,
        severity: 'warning',
        expected: params.billingSnapshot.representativeName ?? null,
        found: params.extracted.representativeName ?? null,
        note: 'Người đại diện không khớp (cảnh báo)',
      });
    }
  } else {
    if (
      !textMatches(params.billingSnapshot.fullName, params.extracted.fullName)
    ) {
      push({
        field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_FULL_NAME,
        severity: 'error',
        expected: params.billingSnapshot.fullName ?? null,
        found: params.extracted.fullName ?? null,
        note: 'Họ tên cá nhân trên PDF không khớp snapshot billing',
      });
    }
    if (
      params.billingSnapshot.citizenId &&
      normalizeTaxCode(params.billingSnapshot.citizenId) !==
        normalizeTaxCode(params.extracted.citizenId)
    ) {
      push({
        field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_CITIZEN_ID,
        severity: 'error',
        expected: params.billingSnapshot.citizenId ?? null,
        found: params.extracted.citizenId ?? null,
        note: 'CCCD/CMND trên PDF không khớp snapshot billing',
      });
    }
  }

  if (
    normalizeTaxCode(params.billingSnapshot.taxCode) !==
    normalizeTaxCode(params.extracted.taxCode)
  ) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_TAX_CODE,
      severity: 'error',
      expected: params.billingSnapshot.taxCode ?? null,
      found: params.extracted.taxCode ?? null,
      note: 'Mã số thuế trên PDF không khớp snapshot billing',
    });
  }

  if (!textMatches(params.billingSnapshot.address, params.extracted.address)) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_ADDRESS,
      severity: 'error',
      expected: params.billingSnapshot.address ?? null,
      found: params.extracted.address ?? null,
      note: 'Địa chỉ trên PDF không khớp snapshot billing',
    });
  }

  if (
    !textMatches(
      params.billingSnapshot.invoiceEmail,
      params.extracted.invoiceEmail,
    )
  ) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_INVOICE_EMAIL,
      severity: 'error',
      expected: params.billingSnapshot.invoiceEmail ?? null,
      found: params.extracted.invoiceEmail ?? null,
      note: 'Email nhận hóa đơn trên PDF không khớp snapshot billing',
    });
  }

  if (
    params.billingSnapshot.phone &&
    normalizePhone(params.billingSnapshot.phone) !==
      normalizePhone(params.extracted.phone)
  ) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.BILLING_PHONE,
      severity: 'error',
      expected: params.billingSnapshot.phone ?? null,
      found: params.extracted.phone ?? null,
      note: 'Số điện thoại trên PDF không khớp snapshot billing',
    });
  }

  if (
    params.extracted.vatRatePercent != null &&
    Math.round(params.extracted.vatRatePercent) !== Math.round(params.vatRate)
  ) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.COMMERCIAL_VAT_RATE,
      severity: 'error',
      expected: params.vatRate,
      found: params.extracted.vatRatePercent,
      note: 'Thuế suất VAT trên PDF phải là 10%',
    });
  }

  if (!amountMatches(params.amountExclVat, params.extracted.amountExclVat)) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.COMMERCIAL_AMOUNT_EXCL_VAT,
      severity: 'error',
      expected: Math.round(params.amountExclVat),
      found: params.extracted.amountExclVat ?? null,
      note: 'Tiền trước VAT không khớp invoice/order',
    });
  }

  if (!amountMatches(params.vatAmount, params.extracted.vatAmount)) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.COMMERCIAL_VAT_AMOUNT,
      severity: 'error',
      expected: Math.round(params.vatAmount),
      found: params.extracted.vatAmount ?? null,
      note: 'Tiền VAT không khớp invoice/order',
    });
  }

  if (!amountMatches(params.amountInclVat, params.extracted.amountInclVat)) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.COMMERCIAL_AMOUNT_INCL_VAT,
      severity: 'error',
      expected: Math.round(params.amountInclVat),
      found: params.extracted.amountInclVat ?? null,
      note: 'Tổng tiền sau VAT không khớp invoice/order',
    });
  }

  if (!lineItemNameMatches(params.extracted.lineItemName)) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.COMMERCIAL_LINE_ITEM_NAME,
      severity: 'error',
      expected: 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS (hoặc tương đương)',
      found: params.extracted.lineItemName ?? null,
      note: 'Diễn giải dòng hàng trên PDF không khớp mẫu dịch vụ ZNS',
    });
  }

  const expectedInvoiceNumber =
    params.submittedInvoiceNumber?.trim() ||
    params.extracted.invoiceNumber?.trim() ||
    null;
  if (params.submittedInvoiceNumber) {
    const submitted = normalizeText(params.submittedInvoiceNumber);
    const extracted = normalizeText(params.extracted.invoiceNumber);
    if (!submitted || !extracted || submitted !== extracted) {
      push({
        field: INVOICE_PDF_MISMATCH_FIELDS.IDENTIFIERS_INVOICE_NUMBER,
        severity: 'error',
        expected: params.submittedInvoiceNumber,
        found: params.extracted.invoiceNumber ?? null,
        note: 'Số hóa đơn staff nhập không khớp nội dung PDF',
      });
    }
  } else if (expectedInvoiceNumber && !params.extracted.invoiceNumber) {
    push({
      field: INVOICE_PDF_MISMATCH_FIELDS.IDENTIFIERS_INVOICE_NUMBER,
      severity: 'error',
      expected: expectedInvoiceNumber,
      found: null,
      note: 'Không trích xuất được số hóa đơn từ PDF',
    });
  }

  if (params.submittedIssueDate) {
    const submitted = parseIsoDateOnly(params.submittedIssueDate);
    const extracted = parseIsoDateOnly(params.extracted.issueDate);
    if (submitted && extracted && submitted !== extracted) {
      push({
        field: INVOICE_PDF_MISMATCH_FIELDS.IDENTIFIERS_ISSUE_DATE,
        severity: 'error',
        expected: submitted,
        found: extracted,
        note: 'Ngày xuất staff nhập không khớp nội dung PDF',
      });
    }
  }

  return mismatches.filter((m) => m.severity === 'error');
}
