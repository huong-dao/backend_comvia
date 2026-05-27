import type { InvoicePdfMismatchField } from './invoice-pdf-verification.constants';

export interface ExtractedInvoicePdfData {
  invoiceNumber?: string | null;
  issueDate?: string | null;
  billingType?: 'organization' | 'individual' | 'unknown' | null;
  companyName?: string | null;
  taxCode?: string | null;
  address?: string | null;
  invoiceEmail?: string | null;
  representativeName?: string | null;
  phone?: string | null;
  fullName?: string | null;
  citizenId?: string | null;
  lineItemName?: string | null;
  vatRatePercent?: number | null;
  amountExclVat?: number | null;
  vatAmount?: number | null;
  amountInclVat?: number | null;
}

export interface InvoicePdfMismatch {
  field: InvoicePdfMismatchField | string;
  severity: 'error' | 'warning';
  expected: string | number | null;
  found: string | number | null;
  note?: string;
}

export interface InvoiceVerificationJson {
  idempotencyKey?: string | null;
  verifiedAt: string;
  result: 'pass' | 'fail';
  model: string;
  promptVersion: string;
  fileSha256: string;
  fileSizeBytes: number;
  actorUserId: string;
  extracted: ExtractedInvoicePdfData;
  mismatches: InvoicePdfMismatch[];
  submittedInvoiceNumber?: string | null;
  submittedIssueDate?: string | null;
}

export interface VerifyIssueInvoicePdfSuccessResponse {
  ok: true;
  invoice: {
    id: string;
    status: 'ISSUED';
    invoiceNumber: string | null;
    issueDate: string | null;
    invoicePdfUrl: string | null;
  };
}

export interface VerifyIssueInvoicePdfFailureResponse {
  ok: false;
  code: typeof import('./invoice-pdf-verification.constants').INVOICE_PDF_VERIFICATION_FAILED_CODE;
  invoiceId: string;
  mismatches: InvoicePdfMismatch[];
  extractedPreview: ExtractedInvoicePdfData;
  message: string;
}

export interface UploadedInvoicePdfFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface BillingSnapshotJson {
  billingType?: 'ORGANIZATION' | 'INDIVIDUAL';
  companyName?: string | null;
  taxCode?: string | null;
  address?: string | null;
  invoiceEmail?: string | null;
  representativeName?: string | null;
  phone?: string | null;
  fullName?: string | null;
  citizenId?: string | null;
}
