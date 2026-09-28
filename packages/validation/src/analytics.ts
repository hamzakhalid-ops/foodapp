import { z } from 'zod';
import { ratingSummarySchema } from './review';

const instant = z.iso.datetime({ offset: true });

/** API_SPEC §61: every restaurant analytics endpoint takes an optional `from`/`to` range. */
export const analyticsRangeQuerySchema = z
  .object({ from: instant.optional(), to: instant.optional() })
  .refine((query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to), {
    message: 'from must not be after to',
    path: ['from'],
  });

export const popularItemsQuerySchema = analyticsRangeQuerySchema.and(
  z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
);

const range = { from: z.string().nullable(), to: z.string().nullable() };

export const analyticsOverviewSchema = z.object({
  ...range,
  currency: z.string(),
  orderCount: z.number().int(),
  deliveredCount: z.number().int(),
  cancelledCount: z.number().int(),
  salesAmount: z.string(),
  averageOrderValue: z.string().nullable(),
  averageRating: z.number().nullable(),
  reviewCount: z.number().int(),
});

export const analyticsSalesSchema = z.object({
  ...range,
  currency: z.string(),
  days: z.array(
    z.object({ date: z.string(), deliveredCount: z.number().int(), salesAmount: z.string() }),
  ),
});

export const analyticsOrdersSchema = z.object({
  ...range,
  total: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
});

export const analyticsPopularItemsSchema = z.object({
  ...range,
  currency: z.string(),
  items: z.array(
    z.object({
      menuItemId: z.uuid().nullable(),
      itemName: z.string(),
      quantity: z.number().int(),
      salesAmount: z.string(),
    }),
  ),
});

export const analyticsRatingsSchema = ratingSummarySchema.extend(range);

export const analyticsCancellationsSchema = z.object({
  ...range,
  total: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
  byReason: z.array(z.object({ reasonCode: z.string(), count: z.number().int() })),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;
export type PopularItemsQuery = z.infer<typeof popularItemsQuerySchema>;
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;
export type AnalyticsSales = z.infer<typeof analyticsSalesSchema>;
export type AnalyticsOrders = z.infer<typeof analyticsOrdersSchema>;
export type AnalyticsPopularItems = z.infer<typeof analyticsPopularItemsSchema>;
export type AnalyticsRatings = z.infer<typeof analyticsRatingsSchema>;
export type AnalyticsCancellations = z.infer<typeof analyticsCancellationsSchema>;
