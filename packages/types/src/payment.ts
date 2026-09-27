/**
 * Frozen V1 payment vocabulary.
 *
 * Source: CLAUDE.md §16, docs/payments/PAYMENT_RULES.md.
 * Payment state is backend-authoritative; clients only display it.
 */
export const PAYMENT_METHODS = ['ONLINE_PAYMENT', 'CASH_ON_DELIVERY'] as const;

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
