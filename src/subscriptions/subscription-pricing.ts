import { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionAmounts = {
  amountExclVat: number;
  vatPercent: number;
  vatAmount: number;
  amountInclVat: number;
};

/** Giá chưa VAT + % VAT do admin nhập => tiền VAT và tổng thanh toán (VND, số nguyên). */
export function calculateSubscriptionAmounts(
  priceExclVat: Prisma.Decimal | number,
  vatPercent: Prisma.Decimal | number,
): SubscriptionAmounts {
  const excl = Math.round(Number(priceExclVat));
  const percent = Number(vatPercent);
  const vatAmount = Math.round((excl * percent) / 100);
  return {
    amountExclVat: excl,
    vatPercent: percent,
    vatAmount,
    amountInclVat: excl + vatAmount,
  };
}

/** Cộng `years` năm theo lịch (UTC); 29/02 + n năm không nhuận => 28/02. */
export function addYears(date: Date, years: number): Date {
  const target = new Date(date.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCFullYear(target.getUTCFullYear() + years);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function daysRemaining(now: Date, endsAt: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}

/**
 * Kỳ mới của lần mua: bắt đầu từ lúc thanh toán, hoặc từ lúc kỳ cuối cùng hết
 * hạn nếu workspace còn hạn (mua cộng dồn).
 */
export function computeSubscriptionPeriod(params: {
  now: Date;
  latestEndsAt: Date | null;
  durationYears: number;
}) {
  const startsAt =
    params.latestEndsAt && params.latestEndsAt.getTime() > params.now.getTime()
      ? params.latestEndsAt
      : params.now;
  const endsAt = addYears(startsAt, params.durationYears);
  return { startsAt, endsAt, durationDays: diffDays(startsAt, endsAt) };
}
