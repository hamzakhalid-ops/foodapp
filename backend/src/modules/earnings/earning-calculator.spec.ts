import { formatMoney, type Money, money } from '../../common/money/money';
import { restaurantEarningAmounts } from './earning-calculator';

/** FINANCIAL_SPEC §65 precision cases. */
describe('restaurantEarningAmounts', () => {
  const calc = (subtotal: string, discount: string, percent: string) => {
    const amounts = restaurantEarningAmounts(money(subtotal), money(discount), money(percent));
    return Object.fromEntries(
      Object.entries(amounts).map(([k, v]: [string, Money]) => [k, formatMoney(v)]),
    );
  };

  it('takes commission from the discounted subtotal', () => {
    expect(calc('1000.00', '100.00', '20')).toMatchObject({
      grossAmount: '900.00',
      commissionAmount: '180.00',
      netAmount: '720.00',
    });
  });

  it('rounds commission half-up once and keeps net + commission = gross', () => {
    for (const [subtotal, percent, commission] of [
      ['0.01', '20', '0.00'],
      ['0.10', '15', '0.02'],
      ['0.99', '17.5', '0.17'],
      ['999.99', '12.3456', '123.45'],
      ['9999999999.99', '20', '2000000000.00'],
    ] as const) {
      const result = calc(subtotal, '0', percent);
      expect(result.commissionAmount).toBe(commission);
      expect(
        money(result.netAmount ?? '')
          .add(result.commissionAmount ?? '')
          .toFixed(2),
      ).toBe(result.grossAmount);
    }
  });

  it('handles zero commission and full discounts', () => {
    expect(calc('250.00', '0', '0').netAmount).toBe('250.00');
    expect(calc('250.00', '250.00', '20').netAmount).toBe('0.00');
    expect(() => calc('10.00', '10.01', '20')).toThrow();
  });
});
