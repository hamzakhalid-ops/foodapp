import { formatMoney, money, percentOf, roundMoney, sumMoney } from './money';

describe('money', () => {
  it('never uses floating point (0.1 + 0.2 = 0.30)', () => {
    expect(formatMoney(sumMoney([money('0.1'), money('0.2')]))).toBe('0.30');
  });

  it('rounds half-up once at 2 decimal places', () => {
    expect(formatMoney(money('1.005'))).toBe('1.01');
    expect(formatMoney(money('1.004'))).toBe('1.00');
    expect(roundMoney(money('-1.005')).toFixed(2)).toBe('-1.01');
  });

  it('computes percentages exactly', () => {
    expect(formatMoney(percentOf(money('1000.00'), money('20')))).toBe('200.00');
    expect(formatMoney(percentOf(money('333.33'), money('17.5')))).toBe('58.33');
  });
});
