export const INVOICE_PDF_VERIFICATION_FAILED_CODE =
  'INVOICE_PDF_VERIFICATION_FAILED';

export const INVOICE_ALREADY_ISSUED_CODE = 'INVOICE_ALREADY_ISSUED';
export const INVOICE_CANCELLED_CODE = 'INVOICE_CANCELLED';
export const INVOICE_INVALID_STATUS_CODE = 'INVOICE_INVALID_STATUS';

export const INVOICE_PDF_MAX_BYTES = 10 * 1024 * 1024;

export const INVOICE_PDF_MISMATCH_FIELDS = {
  BILLING_COMPANY_NAME: 'billing.company_name',
  BILLING_TAX_CODE: 'billing.tax_code',
  BILLING_ADDRESS: 'billing.address',
  BILLING_INVOICE_EMAIL: 'billing.invoice_email',
  BILLING_REPRESENTATIVE_NAME: 'billing.representative_name',
  BILLING_PHONE: 'billing.phone',
  BILLING_FULL_NAME: 'billing.full_name',
  BILLING_CITIZEN_ID: 'billing.citizen_id',
  COMMERCIAL_VAT_RATE: 'commercial.vat_rate',
  COMMERCIAL_AMOUNT_EXCL_VAT: 'commercial.amount_excl_vat',
  COMMERCIAL_VAT_AMOUNT: 'commercial.vat_amount',
  COMMERCIAL_AMOUNT_INCL_VAT: 'commercial.amount_incl_vat',
  COMMERCIAL_LINE_ITEM_NAME: 'commercial.line_item_name',
  IDENTIFIERS_INVOICE_NUMBER: 'identifiers.invoice_number',
  IDENTIFIERS_ISSUE_DATE: 'identifiers.issue_date',
} as const;

export type InvoicePdfMismatchField =
  (typeof INVOICE_PDF_MISMATCH_FIELDS)[keyof typeof INVOICE_PDF_MISMATCH_FIELDS];

export const ZNS_LINE_ITEM_KEYWORD = 'zalo zns';
