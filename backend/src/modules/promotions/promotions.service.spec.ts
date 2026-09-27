import { formatMoney, money } from '../../common/money/money';
import { computeDiscount } from './promotions.service';

const pct = (value: string, max: string | null = null) => ({
  type: 'PERCENTAGE' as const,
  value: money(value),
  maximumDiscountAmount: max ? money(max) : null,
});

describe('computeDiscount', () => {
  it('applies a percentage of the item subtotal', () => {
    expect(formatMoney(computeDiscount(pct('20'), money('1000')))).toBe('200.00');
  });

  it('caps a percentage at the maximum discount (PROMOTION_RULES §18 example)', () => {
    expect(formatMoney(computeDiscount(pct('20', '300'), money('2000')))).toBe('300.00');
  });

  it('rounds half-up to 2 dp', () => {
    expect(formatMoney(computeDiscount(pct('12.5'), money('0.99')))).toBe('0.12');
    expect(formatMoney(computeDiscount(pct('15'), money('10.10')))).toBe('1.52');
  });

  it('never discounts more than the subtotal', () => {
    const fixed = {
      type: 'FIXED_AMOUNT' as const,
      value: money('500'),
      maximumDiscountAmount: null,
    };
    expect(formatMoney(computeDiscount(fixed, money('350')))).toBe('350.00');
    expect(formatMoney(computeDiscount(fixed, money('900')))).toBe('500.00');
  });
});
