import { formatMoney, type Money, money } from '../../common/money/money';
import { orderTotals, unitPrice } from './pricing';

const rates = { deliveryFee: money('150'), serviceFee: money('25'), taxPercent: money('16') };
const fmt = (totals: ReturnType<typeof orderTotals>) =>
  Object.fromEntries(
    Object.entries(totals).map(([key, value]: [string, Money]) => [key, formatMoney(value)]),
  );

describe('pricing', () => {
  it('adds variation adjustments and add-ons to the base price', () => {
    expect(
      formatMoney(unitPrice(money('1200.50'), [money('800')], [money('60'), money('0.25')])),
    ).toBe('2060.75');
  });

  it('computes totals with tax on subtotal minus discount', () => {
    expect(fmt(orderTotals(money('1500'), money('100'), rates))).toEqual({
      subtotal: '1500.00',
      discount: '100.00',
      deliveryFee: '150.00',
      tax: '224.00',
      serviceFee: '25.00',
      total: '1799.00',
    });
  });

  it('rounds tax half-up once and keeps the total equal to the sum of its parts', () => {
    // 16% of 10.03 = 1.6048 → 1.60; 16% of 10.05 = 1.608 → 1.61; 5% of 0.10 = 0.005 → 0.01
    expect(formatMoney(orderTotals(money('10.03'), money('0'), rates).tax)).toBe('1.60');
    expect(formatMoney(orderTotals(money('10.05'), money('0'), rates).tax)).toBe('1.61');
    const t = orderTotals(money('0.10'), money('0'), { ...rates, taxPercent: money('5') });
    expect(formatMoney(t.tax)).toBe('0.01');
    expect(
      t.total.equals(t.subtotal.sub(t.discount).add(t.deliveryFee).add(t.tax).add(t.serviceFee)),
    ).toBe(true);
  });

  it('supports zero tax and zero service fee', () => {
    const t = orderTotals(money('99.99'), money('0'), {
      deliveryFee: money('0'),
      serviceFee: money('0'),
      taxPercent: money('0'),
    });
    expect(formatMoney(t.total)).toBe('99.99');
  });
});
