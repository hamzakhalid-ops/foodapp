import { z } from 'zod';
import { cursorQuerySchema, optionalText, uuidSchema } from './common';
import { orderStatusSchema, paymentMethodSchema, paymentStatusSchema } from './vocabulary';

// ------------------------------------------------------------------ cart (API_SPEC §32–36)

export const addCartItemRequestSchema = z
  .object({
    restaurantId: uuidSchema,
    menuItemId: uuidSchema,
    quantity: z.number().int().min(1).max(99),
    variationIds: z.array(uuidSchema).max(1).default([]),
    addOnIds: z
      .array(uuidSchema)
      .max(20)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate add-on'),
  })
  .strict();

export const updateCartItemRequestSchema = z
  .object({ quantity: z.number().int().min(1).max(99) })
  .strict();

const cartOptionSchema = z.object({ id: z.uuid(), name: z.string(), price: z.string() });

export const cartIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  cartItemId: z.uuid().nullable(),
});

export const cartLineSchema = z.object({
  id: z.uuid(),
  menuItemId: z.uuid(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  quantity: z.number(),
  /** Base price + selected variation + add-ons, per unit. */
  unitPrice: z.string(),
  lineTotal: z.string(),
  variations: z.array(cartOptionSchema),
  addOns: z.array(cartOptionSchema),
  isAvailable: z.boolean(),
});

export const cartSchema = z.object({
  restaurant: z.object({ id: z.uuid(), name: z.string(), isOrderableNow: z.boolean() }).nullable(),
  items: z.array(cartLineSchema),
  subtotal: z.string(),
  deliveryFee: z.string(),
  serviceFee: z.string(),
  tax: z.string(),
  total: z.string(),
  currency: z.string(),
  minimumOrderAmount: z.string().nullable(),
  /** Blocking problems (unavailable items, closed restaurant, minimum not met...). */
  issues: z.array(cartIssueSchema),
  isCheckoutReady: z.boolean(),
});

// ------------------------------------------------------------------ checkout (API_SPEC §37–38)

export const checkoutPreviewRequestSchema = z
  .object({
    addressId: uuidSchema,
    paymentMethod: paymentMethodSchema,
    promotionCode: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const createOrderRequestSchema = checkoutPreviewRequestSchema
  .extend({ instructions: optionalText(500) })
  .strict();

export const checkoutPreviewSchema = z.object({
  restaurantId: z.uuid(),
  addressId: z.uuid(),
  subtotal: z.string(),
  discount: z.string(),
  deliveryFee: z.string(),
  tax: z.string(),
  serviceFee: z.string(),
  total: z.string(),
  currency: z.string(),
  paymentMethod: paymentMethodSchema,
  promotionCode: z.string().nullable(),
});

// ------------------------------------------------------------------ orders (API_SPEC §38–41)

const orderOptionSnapshotSchema = z.object({ name: z.string(), price: z.string() });

export const orderSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  paymentStatus: paymentStatusSchema,
  restaurant: z.object({ id: z.uuid(), name: z.string() }),
  subtotal: z.string(),
  discountAmount: z.string(),
  deliveryFee: z.string(),
  taxAmount: z.string(),
  serviceFee: z.string(),
  totalAmount: z.string(),
  currency: z.string(),
  specialInstructions: z.string().nullable(),
  estimatedPreparationMinutes: z.number(),
  deliveryAddress: z.object({
    recipientName: z.string(),
    recipientPhone: z.string(),
    addressText: z.string(),
    area: z.string().nullable(),
    city: z.string(),
    postalCode: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    deliveryInstructions: z.string().nullable(),
  }),
  items: z.array(
    z.object({
      id: z.uuid(),
      menuItemId: z.uuid().nullable(),
      name: z.string(),
      unitPrice: z.string(),
      quantity: z.number(),
      subtotal: z.string(),
      variations: z.array(orderOptionSnapshotSchema),
      addOns: z.array(orderOptionSnapshotSchema),
    }),
  ),
  placedAt: z.string(),
  acceptedAt: z.string().nullable(),
  preparingAt: z.string().nullable(),
  readyAt: z.string().nullable(),
  pickedUpAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});

export const orderSummarySchema = orderSchema.pick({
  id: true,
  orderNumber: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  restaurant: true,
  totalAmount: true,
  currency: true,
  placedAt: true,
});

export const orderStatusViewSchema = z.object({
  orderId: z.uuid(),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  history: z.array(
    z.object({
      fromStatus: orderStatusSchema.nullable(),
      toStatus: orderStatusSchema,
      reason: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

export const customerOrderListQuerySchema = cursorQuerySchema
  .extend({
    status: orderStatusSchema.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to), {
    message: 'from must not be after to',
    path: ['from'],
  });

export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>;
export type UpdateCartItemRequest = z.infer<typeof updateCartItemRequestSchema>;
export type CartIssue = z.infer<typeof cartIssueSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type CheckoutPreviewRequest = z.infer<typeof checkoutPreviewRequestSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CheckoutPreview = z.infer<typeof checkoutPreviewSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type OrderStatusView = z.infer<typeof orderStatusViewSchema>;
export type CustomerOrderListQuery = z.infer<typeof customerOrderListQuerySchema>;

// ------------------------------------------------------------------ restaurant orders (API_SPEC §51–56)

export const acceptOrderRequestSchema = z
  .object({ estimatedPreparationMinutes: z.number().int().min(1).max(240).optional() })
  .strict();

export const restaurantOrderListQuerySchema = customerOrderListQuerySchema.and(
  z.object({ search: z.string().trim().min(1).max(40).optional() }),
);

// ------------------------------------------------------------------ cancellation (CANCELLATION_RULES §12)

/** Central reason-code list (CANCELLATION_RULES §12). */
export const CANCELLATION_REASON_CODES = [
  'CUSTOMER_CHANGED_MIND',
  'CUSTOMER_ORDERED_BY_MISTAKE',
  'RESTAURANT_ITEM_UNAVAILABLE',
  'RESTAURANT_UNABLE_TO_FULFILL',
  'RESTAURANT_CLOSED',
  'PAYMENT_ISSUE',
  'DUPLICATE_ORDER',
  'SAFETY_REASON',
  'PLATFORM_ERROR',
  'ADMIN_RESOLUTION',
  'OTHER',
] as const;
export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

const cancelRequest = (codes: readonly [CancellationReasonCode, ...CancellationReasonCode[]]) =>
  z
    .object({ reasonCode: z.enum(codes), reason: optionalText(500) })
    .strict()
    .refine((body) => body.reasonCode !== 'OTHER' || Boolean(body.reason), {
      message: 'A reason is required for OTHER',
      path: ['reason'],
    });

export const customerCancelRequestSchema = cancelRequest([
  'CUSTOMER_CHANGED_MIND',
  'CUSTOMER_ORDERED_BY_MISTAKE',
  'OTHER',
]);
export const restaurantCancelRequestSchema = cancelRequest([
  'RESTAURANT_ITEM_UNAVAILABLE',
  'RESTAURANT_UNABLE_TO_FULFILL',
  'RESTAURANT_CLOSED',
  'OTHER',
]);
/** Admin cancellations always carry an explanation (CANCELLATION_RULES §10). */
export const adminCancelRequestSchema = z
  .object({
    reasonCode: z.enum(CANCELLATION_REASON_CODES),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type AcceptOrderRequest = z.infer<typeof acceptOrderRequestSchema>;
export type RestaurantOrderListQuery = z.infer<typeof restaurantOrderListQuerySchema>;
export type CustomerCancelRequest = z.infer<typeof customerCancelRequestSchema>;
export type RestaurantCancelRequest = z.infer<typeof restaurantCancelRequestSchema>;
export type AdminCancelRequest = z.infer<typeof adminCancelRequestSchema>;
