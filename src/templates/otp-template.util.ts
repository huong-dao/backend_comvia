import { BadRequestException } from '@nestjs/common';

export const OTP_PLACEHOLDER_KEYS = ['otp', 'phut'] as const;

export function assertOtpPlaceholderDefinition(
  placeholders: Record<string, unknown> | null | undefined,
): void {
  const keys = Object.keys(placeholders ?? {}).sort();
  const expected = [...OTP_PLACEHOLDER_KEYS].sort();

  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new BadRequestException(
      'OTP placeholdersJson must contain exactly: otp, phut',
    );
  }
}

export function assertOtpPayloadData(data: Record<string, unknown>): void {
  for (const key of OTP_PLACEHOLDER_KEYS) {
    const value = data[key];
    const isEmptyString = typeof value === 'string' && value.trim() === '';
    const isInvalidNumber =
      typeof value === 'number' && !Number.isFinite(value);
    if (
      value === undefined ||
      value === null ||
      isEmptyString ||
      isInvalidNumber ||
      (typeof value !== 'string' && typeof value !== 'number')
    ) {
      throw new BadRequestException(`OTP payload requires ${key}`);
    }
  }
}
