import {
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPriority,
} from '../../generated/prisma/client';

export type TemplateVars = Record<string, string>;

export interface NotificationTemplate {
  category: NotificationCategory;
  priority: NotificationPriority;
  classification: 'TRANSACTIONAL' | 'PROMOTIONAL' | 'SECURITY';
  /** Delivery channels besides IN_APP (always stored). */
  channels: NotificationChannel[];
  title: (vars: TemplateVars) => string;
  body: (vars: TemplateVars) => string;
}

export const TEMPLATE_VERSION = 1;
export const TEMPLATE_LOCALE = 'en';

const order = (priority: NotificationPriority, title: string, body: (v: TemplateVars) => string) =>
  ({
    category: 'ORDER',
    priority,
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => title,
    body,
  }) satisfies NotificationTemplate;

/**
 * Notification templates (NOTIFICATION_RULES §6–8), version 1, English. Variables come only from
 * backend data. Push bodies avoid sensitive details (§12, REALTIME_SPEC §47).
 */
export const TEMPLATES = {
  ORDER_CREATED: order(
    'NORMAL',
    'Order placed',
    (v) => `Your order #${v.orderNumber} was placed with ${v.restaurantName}.`,
  ),
  ORDER_ACCEPTED: order(
    'NORMAL',
    'Order accepted',
    (v) => `${v.restaurantName} has accepted your order #${v.orderNumber}.`,
  ),
  ORDER_REJECTED: order(
    'HIGH',
    'Order not accepted',
    (v) => `${v.restaurantName} could not accept your order #${v.orderNumber}.`,
  ),
  ORDER_PREPARING: order(
    'NORMAL',
    'Preparing your order',
    (v) => `${v.restaurantName} is preparing your order #${v.orderNumber}.`,
  ),
  ORDER_READY: order(
    'NORMAL',
    'Order ready',
    (v) => `Your order #${v.orderNumber} is ready for pickup by a rider.`,
  ),
  ORDER_RIDER_ASSIGNED: order(
    'NORMAL',
    'Rider assigned',
    (v) => `A rider is on the way to collect order #${v.orderNumber}.`,
  ),
  ORDER_PICKED_UP: order(
    'NORMAL',
    'Order picked up',
    (v) => `Your order #${v.orderNumber} has been picked up.`,
  ),
  ORDER_OUT_FOR_DELIVERY: order(
    'NORMAL',
    'Out for delivery',
    (v) => `Your order #${v.orderNumber} is on its way.`,
  ),
  ORDER_DELIVERED: order(
    'NORMAL',
    'Order delivered',
    (v) => `Your order #${v.orderNumber} was delivered. Enjoy!`,
  ),
  ORDER_CANCELLED: order(
    'HIGH',
    'Order cancelled',
    (v) => `Order #${v.orderNumber} was cancelled.`,
  ),
  RESTAURANT_NEW_ORDER: {
    category: 'RESTAURANT',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'New order',
    body: (v) => `New order #${v.orderNumber} is waiting for you.`,
  },
  RESTAURANT_ORDER_CANCELLED: {
    category: 'RESTAURANT',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'Order cancelled',
    body: (v) => `Order #${v.orderNumber} was cancelled.`,
  },
  PAYMENT_SUCCEEDED: {
    category: 'PAYMENT',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'Payment received',
    body: (v) => `We received your payment for order #${v.orderNumber}.`,
  },
  PAYMENT_FAILED: {
    category: 'PAYMENT',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'Payment failed',
    body: (v) => `Your payment for order #${v.orderNumber} did not go through.`,
  },
  PAYMENT_REFUNDED: {
    category: 'PAYMENT',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH', 'EMAIL'],
    title: () => 'Refund processed',
    body: (v) => `A refund of ${v.currency} ${v.amount} for order #${v.orderNumber} was processed.`,
  },
  DELIVERY_OFFER: {
    category: 'DISPATCH',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'New delivery offer',
    body: (v) => `Pickup from ${v.restaurantName}. Respond before it expires.`,
  },
  DELIVERY_OFFER_EXPIRED: {
    category: 'DISPATCH',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: [],
    title: () => 'Offer expired',
    body: (v) => `The delivery offer for order #${v.orderNumber} has expired.`,
  },
  DELIVERY_ASSIGNED: {
    category: 'DELIVERY',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'Delivery assigned',
    body: (v) => `Order #${v.orderNumber} is assigned to you.`,
  },
  DELIVERY_CANCELLED: {
    category: 'DELIVERY',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'Delivery cancelled',
    body: (v) => `Order #${v.orderNumber} was cancelled. Do not pick it up.`,
  },
  DELIVERY_COMPLETED: {
    category: 'DELIVERY',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: [],
    title: () => 'Delivery completed',
    body: (v) => `Order #${v.orderNumber} is marked delivered.`,
  },
  RESTAURANT_APPLICATION_SUBMITTED: {
    category: 'RESTAURANT',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: [],
    title: () => 'Restaurant application submitted',
    body: (v) => `${v.restaurantName} submitted an application for review.`,
  },
  RESTAURANT_APPLICATION_APPROVED: {
    category: 'RESTAURANT',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH', 'EMAIL'],
    title: () => 'Application approved',
    body: (v) => `${v.restaurantName} is approved. You can set up your menu and go online.`,
  },
  RESTAURANT_APPLICATION_REJECTED: {
    category: 'RESTAURANT',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH', 'EMAIL'],
    title: () => 'Application not approved',
    body: (v) => `The application for ${v.restaurantName} was not approved.`,
  },
  RESTAURANT_RESUBMISSION_REQUIRED: {
    category: 'RESTAURANT',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH', 'EMAIL'],
    title: () => 'Changes needed',
    body: (v) => `Please update the application for ${v.restaurantName} and resubmit.`,
  },
  RIDER_APPLICATION_SUBMITTED: {
    category: 'RIDER',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: [],
    title: () => 'Rider application submitted',
    body: () => 'A rider submitted an application for review.',
  },
  RIDER_ACCOUNT_APPROVED: {
    category: 'RIDER',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH', 'SMS'],
    title: () => 'You are approved',
    body: () => 'Your rider account is approved. Go online to receive deliveries.',
  },
  RIDER_ACCOUNT_REJECTED: {
    category: 'RIDER',
    priority: 'HIGH',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'Application not approved',
    body: () => 'Your rider application was not approved. Check the app for details.',
  },
  REVIEW_RECEIVED: {
    category: 'REVIEW',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'New review',
    body: (v) => `A customer rated order #${v.orderNumber} ${v.rating}/5.`,
  },
  REVIEW_RESPONSE: {
    category: 'REVIEW',
    priority: 'NORMAL',
    classification: 'TRANSACTIONAL',
    channels: ['PUSH'],
    title: () => 'The restaurant replied',
    body: (v) => `${v.restaurantName} replied to your review.`,
  },
} satisfies Record<string, NotificationTemplate>;

export type NotificationType = keyof typeof TEMPLATES;

/** Categories users can never switch off (NOTIFICATION_RULES §14–15). */
export const MANDATORY_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  'AUTHENTICATION',
  'SECURITY',
]);
