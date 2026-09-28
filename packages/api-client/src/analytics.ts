import {
  type AnalyticsCancellations,
  analyticsCancellationsSchema,
  type AnalyticsOrders,
  analyticsOrdersSchema,
  type AnalyticsOverview,
  analyticsOverviewSchema,
  type AnalyticsPopularItems,
  analyticsPopularItemsSchema,
  type AnalyticsRangeQuery,
  type AnalyticsRatings,
  analyticsRatingsSchema,
  type AnalyticsSales,
  analyticsSalesSchema,
} from '@quickbite/validation';
import { type z } from 'zod';
import { type ApiClient } from './client';

/** Restaurant owner analytics (docs/api/API_SPEC.md §61). Operators receive 403. */
export function createRestaurantAnalyticsApi(client: ApiClient) {
  const get = async <S extends z.ZodType>(
    path: string,
    schema: S,
    query: Record<string, string | number | undefined>,
  ): Promise<z.infer<S>> =>
    (await client.request({ method: 'GET', path: `/restaurant/analytics/${path}`, schema, query }))
      .data;
  return {
    overview: (query: AnalyticsRangeQuery = {}): Promise<AnalyticsOverview> =>
      get('overview', analyticsOverviewSchema, query),
    sales: (query: AnalyticsRangeQuery = {}): Promise<AnalyticsSales> =>
      get('sales', analyticsSalesSchema, query),
    orders: (query: AnalyticsRangeQuery = {}): Promise<AnalyticsOrders> =>
      get('orders', analyticsOrdersSchema, query),
    popularItems: (
      query: AnalyticsRangeQuery & { limit?: number } = {},
    ): Promise<AnalyticsPopularItems> => get('popular-items', analyticsPopularItemsSchema, query),
    ratings: (query: AnalyticsRangeQuery = {}): Promise<AnalyticsRatings> =>
      get('ratings', analyticsRatingsSchema, query),
    cancellations: (query: AnalyticsRangeQuery = {}): Promise<AnalyticsCancellations> =>
      get('cancellations', analyticsCancellationsSchema, query),
  };
}
