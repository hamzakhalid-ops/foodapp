/**
 * Frozen V1 order lifecycle vocabulary.
 *
 * Source: CLAUDE.md §12, docs/business-rules/ORDER_RULES.md,
 * docs/ARCHITECTURE_CONSISTENCY_REVIEW.md §38.
 *
 * These are names only. Valid transitions are owned exclusively by the backend
 * order state machine; clients must never derive or decide transitions.
 */
export const PRIMARY_ORDER_STATUSES = [
  'PENDING',
  'RESTAURANT_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export const CANCELLATION_ORDER_STATUSES = [
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_RESTAURANT',
  'CANCELLED_BY_ADMIN',
] as const;

export const ORDER_STATUSES = [...PRIMARY_ORDER_STATUSES, ...CANCELLATION_ORDER_STATUSES] as const;

export type PrimaryOrderStatus = (typeof PRIMARY_ORDER_STATUSES)[number];
export type CancellationOrderStatus = (typeof CANCELLATION_ORDER_STATUSES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
