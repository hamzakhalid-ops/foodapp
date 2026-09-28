import { Prisma } from '../../generated/prisma/client';

/**
 * Exact decimal money (CLAUDE.md §8, FINANCIAL_SPEC §64).
 *
 * Rounding rule: intermediate values keep full precision; a value is rounded once, when it becomes
 * a stored amount, to 2 decimal places using ROUND_HALF_UP.
 */
export type Money = Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);

export function money(value: string | number | Money): Money {
  return new Prisma.Decimal(value);
}

/** Rounds to a storable amount (2 dp, half-up). */
export function roundMoney(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** API representation (API_SPEC §122): decimal string with exactly 2 places. */
export function formatMoney(value: Money): string {
  return roundMoney(value).toFixed(2);
}

/** `amount × percent / 100`, unrounded. */
export function percentOf(amount: Money, percent: Money): Money {
  return amount.mul(percent).div(100);
}

export function sumMoney(values: Money[]): Money {
  return values.reduce<Money>((total, value) => total.add(value), ZERO);
}
