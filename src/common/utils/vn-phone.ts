/**
 * Normalizes a Vietnamese mobile number to the 84xxxxxxxxx form Zalo expects.
 * Accepts 0xxxxxxxxx, 84xxxxxxxxx, +84xxxxxxxxx, and 9 digits without the
 * leading 0 (a common result of spreadsheets dropping it). Spaces, dots,
 * dashes and parentheses are ignored. Returns null when the number is not a
 * valid 10-digit local number.
 */
export function normalizeVietnamesePhone(input: string): string | null {
  const compact = input
    .trim()
    .replace(/[\s.()-]/g, '')
    .replace(/^\+/, '');

  if (/^0\d{9}$/.test(compact)) return `84${compact.slice(1)}`;
  if (/^84\d{9}$/.test(compact)) return compact;
  if (/^[1-9]\d{8}$/.test(compact)) return `84${compact}`;
  return null;
}
