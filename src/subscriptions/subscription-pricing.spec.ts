import {
  addYears,
  calculateSubscriptionAmounts,
  computeSubscriptionPeriod,
  daysRemaining,
  diffDays,
} from './subscription-pricing';

describe('subscription pricing', () => {
  it('computes VAT and total from price and VAT percent', () => {
    expect(calculateSubscriptionAmounts(2_000_000, 10)).toEqual({
      amountExclVat: 2_000_000,
      vatPercent: 10,
      vatAmount: 200_000,
      amountInclVat: 2_200_000,
    });
    expect(calculateSubscriptionAmounts(1_000_000, 8).amountInclVat).toBe(
      1_080_000,
    );
    expect(calculateSubscriptionAmounts(500_000, 0).amountInclVat).toBe(
      500_000,
    );
  });

  it('adds whole years and clamps 29 Feb', () => {
    expect(addYears(new Date('2026-03-15T10:00:00Z'), 2).toISOString()).toBe(
      '2028-03-15T10:00:00.000Z',
    );
    expect(addYears(new Date('2028-02-29T00:00:00Z'), 1).toISOString()).toBe(
      '2029-02-28T00:00:00.000Z',
    );
  });

  it('counts days between start and end (leap year aware)', () => {
    const start = new Date('2027-01-01T00:00:00Z');
    expect(diffDays(start, addYears(start, 1))).toBe(365);
    const leap = new Date('2028-01-01T00:00:00Z');
    expect(diffDays(leap, addYears(leap, 1))).toBe(366);
  });

  it('starts a first purchase now', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const period = computeSubscriptionPeriod({
      now,
      latestEndsAt: null,
      durationYears: 1,
    });
    expect(period.startsAt).toEqual(now);
    expect(period.endsAt.toISOString()).toBe('2027-11-23T00:00:00.000Z');
    expect(period.durationDays).toBe(365);
  });

  it('stacks a purchase after the remaining time', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const period = computeSubscriptionPeriod({
      now,
      latestEndsAt: new Date('2027-03-01T00:00:00Z'),
      durationYears: 2,
    });
    expect(period.startsAt.toISOString()).toBe('2027-03-01T00:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2029-03-01T00:00:00.000Z');
  });

  it('starts now when the previous period already expired', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const period = computeSubscriptionPeriod({
      now,
      latestEndsAt: new Date('2026-01-01T00:00:00Z'),
      durationYears: 1,
    });
    expect(period.startsAt).toEqual(now);
  });

  it('rounds remaining days up and never goes negative', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    expect(daysRemaining(now, new Date('2026-11-25T00:00:00Z'))).toBe(2);
    expect(daysRemaining(now, new Date('2026-11-01T00:00:00Z'))).toBe(0);
  });
});
