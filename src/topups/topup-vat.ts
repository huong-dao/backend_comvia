export const TOPUP_VAT_RATE = 10;

export type TopupAmounts = {
  amountExclVat: number;
  vatAmount: number;
  amountInclVat: number;
};

/** VAT is a server-owned commercial rule; callers only provide credit amount. */
export function calculateTopupAmounts(amountExclVat: number): TopupAmounts {
  const vatAmount = Math.round((amountExclVat * TOPUP_VAT_RATE) / 100);

  return {
    amountExclVat,
    vatAmount,
    amountInclVat: amountExclVat + vatAmount,
  };
}
