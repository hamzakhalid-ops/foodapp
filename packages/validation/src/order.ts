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
