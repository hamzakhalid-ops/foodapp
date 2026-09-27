import { type Money, money, percentOf, roundMoney, sumMoney, ZERO } from '../../common/money/money';
import { type Prisma } from '../../generated/prisma/client';
import { SettingsService } from '../../common/settings/settings.service';

/** Platform pricing settings in force for one calculation (ADR-0014 §1). */
export interface PricingRates {
  deliveryFee: Money;
  serviceFee: Money;
  taxPercent: Money;
}

export interface OrderTotals {
  subtotal: Money;
  discount: Money;
  deliveryFee: Money;
  tax: Money;
  serviceFee: Money;
  total: Money;
}

/** Per-unit price: base + selected variation adjustments + add-ons (PRD §11). */
export function unitPrice(base: Money, variationAdjustments: Money[], addOnPrices: Money[]): Money {
  return base.add(sumMoney(variationAdjustments)).add(sumMoney(addOnPrices));
}

/**
 * ORDER_RULES §5 / PAYMENT_RULES §5: subtotal − discount + delivery fee + tax + service fee.
 * Tax applies to `subtotal − discount` (ADR-0014 §1) and is rounded once, half-up, to 2 dp; the
 * total is the exact sum of the stored amounts (the database checks this invariant).
 */
export function orderTotals(subtotal: Money, discount: Money, rates: PricingRates): OrderTotals {
  const taxable = subtotal.sub(discount);
  const tax = roundMoney(percentOf(taxable, rates.taxPercent));
  const deliveryFee = roundMoney(rates.deliveryFee);
  const serviceFee = roundMoney(rates.serviceFee);
  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    deliveryFee,
    tax,
    serviceFee,
    total: roundMoney(subtotal).sub(roundMoney(discount)).add(deliveryFee).add(tax).add(serviceFee),
  };
}

export const NO_TOTALS: OrderTotals = {
  subtotal: ZERO,
  discount: ZERO,
  deliveryFee: ZERO,
  tax: ZERO,
  serviceFee: ZERO,
  total: ZERO,
};

/** Reads the required pricing settings; unset settings fail closed with 503 (ADR-0014). */
export async function loadPricingRates(
  settings: SettingsService,
  tx?: Prisma.TransactionClient,
): Promise<PricingRates> {
  const [deliveryFee, serviceFee, taxPercent] = await Promise.all([
    settings.require('pricing.delivery_fee', tx),
    settings.require('pricing.service_fee', tx),
    settings.require('pricing.tax_percent', tx),
  ]);
  return {
    deliveryFee: money(deliveryFee),
    serviceFee: money(serviceFee),
    taxPercent: money(taxPercent),
  };
}
