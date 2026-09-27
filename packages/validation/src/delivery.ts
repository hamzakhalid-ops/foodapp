import { z } from 'zod';
import { cursorQuerySchema, optionalText } from './common';
import { orderStatusSchema, paymentMethodSchema } from './vocabulary';

export const DELIVERY_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'ARRIVING_AT_RESTAURANT',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES);

export const DISPATCH_OFFER_STATUSES = [
  'OFFERED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;

/** API_SPEC §70 */
export const rejectOfferRequestSchema = z
  .object({
    reasonCode: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,49}$/, 'Use an upper-case code, e.g. TOO_FAR'),
  })
  .strict();

/** API_SPEC §73 / ADR-0014 §10–11: the rider's confirmation is the proof; COD confirms cash. */
export const completeDeliveryRequestSchema = z
  .object({ notes: optionalText(500), cashCollected: z.boolean().optional() })
  .strict();

export const riderDeliveryListQuerySchema = cursorQuerySchema.extend({
  status: deliveryStatusSchema.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

const place = z.object({
  name: z.string(),
  addressText: z.string(),
  area: z.string().nullable(),
  city: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

/** What a rider sees before accepting: no customer contact or exact address (MAPS §22–24). */
export const dispatchOfferSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string(),
  status: z.enum(DISPATCH_OFFER_STATUSES),
  offeredAt: z.string(),
  expiresAt: z.string(),
  distanceToRestaurantKm: z.number(),
  restaurant: place,
  deliveryArea: z.string().nullable(),
  deliveryCity: z.string(),
  paymentMethod: paymentMethodSchema,
  /** Cash the rider will collect (COD), else null. */
  amountToCollect: z.string().nullable(),
  currency: z.string(),
});

export const deliverySchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string(),
  orderStatus: orderStatusSchema,
  status: deliveryStatusSchema,
  riderId: z.uuid().nullable(),
  restaurant: place.extend({ phone: z.string().nullable() }),
  destination: z.object({
    recipientName: z.string(),
    recipientPhone: z.string(),
    addressText: z.string(),
    area: z.string().nullable(),
    city: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    instructions: z.string().nullable(),
  }),
  paymentMethod: paymentMethodSchema,
  amountToCollect: z.string().nullable(),
  currency: z.string(),
  pickupAt: z.string().nullable(),
  pickedUpAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  deliveryNotes: z.string().nullable(),
  createdAt: z.string(),
});

export type RejectOfferRequest = z.infer<typeof rejectOfferRequestSchema>;
export type CompleteDeliveryRequest = z.infer<typeof completeDeliveryRequestSchema>;
export type RiderDeliveryListQuery = z.infer<typeof riderDeliveryListQuerySchema>;
export type DispatchOffer = z.infer<typeof dispatchOfferSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
