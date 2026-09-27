import { z } from 'zod';
import { moneyAmountSchema } from './api';
import {
  httpsUrlSchema,
  latitudeSchema,
  longitudeSchema,
  optionalText,
  pageQuerySchema,
  requiredText,
} from './common';
import { restaurantStatusSchema } from './restaurant';

/** Menu prices are never negative (DATABASE.md §72). */
const priceSchema = moneyAmountSchema.refine(
  (value) => !value.startsWith('-'),
  'Must not be negative',
);
const sortOrderSchema = z.number().int().min(0).max(10_000);

// ------------------------------------------------------------------ restaurant menu (API_SPEC §50)

export const createMenuCategoryRequestSchema = z
  .object({
    name: requiredText(120),
    description: optionalText(500),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export const updateMenuCategoryRequestSchema = createMenuCategoryRequestSchema.partial().strict();

export const createMenuItemRequestSchema = z
  .object({
    categoryId: z.uuid(),
    name: requiredText(160),
    description: optionalText(1000),
    imageUrl: httpsUrlSchema.nullable().optional(),
    basePrice: priceSchema,
    isAvailable: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();
export const updateMenuItemRequestSchema = createMenuItemRequestSchema.partial().strict();

export const createVariationRequestSchema = z
  .object({
    name: requiredText(120),
    priceAdjustment: priceSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();
export const updateVariationRequestSchema = createVariationRequestSchema.partial().strict();

export const createAddOnRequestSchema = z
  .object({
    name: requiredText(120),
    price: priceSchema,
    isActive: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();
export const updateAddOnRequestSchema = createAddOnRequestSchema.partial().strict();

export const itemAvailabilityRequestSchema = z.object({ available: z.boolean() }).strict();

export const menuItemListQuerySchema = z.object({ categoryId: z.uuid().optional() });

export const menuCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
});

export const variationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceAdjustment: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
});

export const addOnSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  price: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
});

export const menuItemSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  basePrice: z.string(),
  isAvailable: z.boolean(),
  sortOrder: z.number(),
  variations: z.array(variationSchema),
  addOns: z.array(addOnSchema),
});

// ------------------------------------------------------------------ discovery (API_SPEC §28–31)

/** Customer-visible statuses; SUSPENDED and CLOSED restaurants are never listed. */
export const DISCOVERABLE_STATUSES = ['ONLINE', 'OFFLINE', 'TEMPORARILY_PAUSED'] as const;

const locationQuery = {
  latitude: z.coerce.number().pipe(latitudeSchema).optional(),
  longitude: z.coerce.number().pipe(longitudeSchema).optional(),
  /** Kilometres. */
  radius: z.coerce.number().positive().max(100).optional(),
};

const requireBothCoordinates = (query: {
  latitude?: number | undefined;
  longitude?: number | undefined;
}) => (query.latitude === undefined) === (query.longitude === undefined);

/** Optional caller location for distance and delivery-radius hints (restaurant details). */
export const locationQuerySchema = z
  .object({ latitude: locationQuery.latitude, longitude: locationQuery.longitude })
  .refine(requireBothCoordinates, 'latitude and longitude must be provided together');

export const restaurantListQuerySchema = pageQuerySchema
  .extend({
    ...locationQuery,
    search: z.string().trim().min(1).max(100).optional(),
    cuisine: z.string().trim().min(1).max(100).optional(),
    status: z.enum(DISCOVERABLE_STATUSES).optional(),
    sort: z.enum(['name', 'distance']).default('name'),
  })
  .refine(requireBothCoordinates, 'latitude and longitude must be provided together')
  .refine((query) => query.radius === undefined || query.latitude !== undefined, {
    message: 'radius requires latitude and longitude',
  })
  .refine((query) => query.sort !== 'distance' || query.latitude !== undefined, {
    message: 'sort=distance requires latitude and longitude',
  });

export const searchQuerySchema = pageQuerySchema
  .extend({
    ...locationQuery,
    q: z.string().trim().min(1).max(100),
    type: z.enum(['RESTAURANT', 'MENU_ITEM', 'ALL']).default('ALL'),
  })
  .refine(requireBothCoordinates, 'latitude and longitude must be provided together')
  .refine((query) => query.radius === undefined || query.latitude !== undefined, {
    message: 'radius requires latitude and longitude',
  });

export const restaurantSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  cuisineDescription: z.string().nullable(),
  area: z.string().nullable(),
  city: z.string().nullable(),
  status: restaurantStatusSchema,
  isOrderableNow: z.boolean(),
  minimumOrderAmount: z.string().nullable(),
  estimatedPreparationMinutes: z.number().nullable(),
  /** Platform flat delivery fee (ADR-0014 §1); null until configured. */
  deliveryFee: z.string().nullable(),
  /** Present only when the caller supplied a location. */
  distanceKm: z.number().nullable(),
  deliversToLocation: z.boolean().nullable(),
});

export const restaurantDetailsSchema = restaurantSummarySchema.extend({
  addressLine1: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  deliveryRadius: z.number().nullable(),
  operatingHours: z.array(
    z.object({
      dayOfWeek: z.number(),
      opensAt: z.string().nullable(),
      closesAt: z.string().nullable(),
      isClosed: z.boolean(),
    }),
  ),
});

export const publicMenuSchema = z.object({
  restaurantId: z.uuid(),
  isOrderableNow: z.boolean(),
  categories: z.array(
    menuCategorySchema.omit({ isActive: true }).extend({
      items: z.array(
        menuItemSchema.omit({ categoryId: true }).extend({
          variations: z.array(variationSchema.omit({ isActive: true })),
          addOns: z.array(addOnSchema.omit({ isActive: true })),
        }),
      ),
    }),
  ),
});

export const searchResultSchema = z.object({
  restaurants: z.array(restaurantSummarySchema),
  menuItems: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string().nullable(),
      imageUrl: z.string().nullable(),
      basePrice: z.string(),
      isAvailable: z.boolean(),
      restaurant: restaurantSummarySchema,
    }),
  ),
});

export type CreateMenuCategoryRequest = z.infer<typeof createMenuCategoryRequestSchema>;
export type UpdateMenuCategoryRequest = z.infer<typeof updateMenuCategoryRequestSchema>;
export type CreateMenuItemRequest = z.infer<typeof createMenuItemRequestSchema>;
export type UpdateMenuItemRequest = z.infer<typeof updateMenuItemRequestSchema>;
export type CreateVariationRequest = z.infer<typeof createVariationRequestSchema>;
export type UpdateVariationRequest = z.infer<typeof updateVariationRequestSchema>;
export type CreateAddOnRequest = z.infer<typeof createAddOnRequestSchema>;
export type UpdateAddOnRequest = z.infer<typeof updateAddOnRequestSchema>;
export type ItemAvailabilityRequest = z.infer<typeof itemAvailabilityRequestSchema>;
export type MenuItemListQuery = z.infer<typeof menuItemListQuerySchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type Variation = z.infer<typeof variationSchema>;
export type AddOn = z.infer<typeof addOnSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type RestaurantListQuery = z.infer<typeof restaurantListQuerySchema>;
export type LocationQuery = z.infer<typeof locationQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type RestaurantSummary = z.infer<typeof restaurantSummarySchema>;
export type RestaurantDetails = z.infer<typeof restaurantDetailsSchema>;
export type PublicMenu = z.infer<typeof publicMenuSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
