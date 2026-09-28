import { type Money, money, percentOf, roundMoney } from '../../common/money/money';

export interface RestaurantEarningAmounts {
  grossAmount: Money;
  commissionAmount: Money;
  feeAmount: Money;
  refundAmount: Money;
  netAmount: Money;
}

/**
 * ADR-0014 §2: `gross = subtotal − discount` (promotions are restaurant-funded, §3),
 * `commission = gross × commission %` rounded once, `net = gross − commission`. Customer delivery
 * fee, service fee and tax are not restaurant revenue. Fees and refund allocation are zero in V1;
 * corrections use explicit financial adjustments (FINANCIAL_SPEC §17).
 */
export function restaurantEarningAmounts(
  subtotal: Money,
  discount: Money,
  commissionPercent: Money,
): RestaurantEarningAmounts {
  const grossAmount = roundMoney(subtotal.sub(discount));
  if (grossAmount.isNegative()) throw new Error('Discount exceeds subtotal');
  const commissionAmount = roundMoney(percentOf(grossAmount, commissionPercent));
  return {
    grossAmount,
    commissionAmount,
    feeAmount: money(0),
    refundAmount: money(0),
    netAmount: grossAmount.sub(commissionAmount),
  };
}
