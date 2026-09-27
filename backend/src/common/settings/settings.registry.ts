import { z } from 'zod';

const moneyAmount = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Expected a non-negative amount');
const percent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Expected a percentage')
  .refine((value) => Number(value) <= 100, 'Must be at most 100');

/**
 * Platform settings managed by administrators (DATABASE.md §60, ADR-0014).
 * Business values have no defaults in code: an unset required setting fails the operation that
 * needs it instead of silently using an invented number.
 */
export const SETTINGS = {
  'pricing.delivery_fee': {
    schema: moneyAmount,
    description: 'Flat delivery fee charged per order (ADR-0014 §1).',
  },
  'pricing.service_fee': {
    schema: moneyAmount,
    description: 'Flat service fee charged per order (ADR-0014 §1).',
  },
  'pricing.tax_percent': {
    schema: percent,
    description: 'Tax % applied to subtotal minus discount (ADR-0014 §1).',
  },
  'finance.commission_percent': {
    schema: percent,
    description: 'Platform commission % of restaurant gross (ADR-0014 §2).',
  },
  'finance.rider_delivery_earning': {
    schema: moneyAmount,
    description: 'Flat rider earning per completed delivery (ADR-0014 §2).',
  },
  'orders.accepted_cancellation_window_seconds': {
    schema: z.number().int().min(0),
    description:
      'Seconds after restaurant acceptance during which a customer may still cancel (ADR-0014 §12; unset or 0 = not allowed).',
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}
