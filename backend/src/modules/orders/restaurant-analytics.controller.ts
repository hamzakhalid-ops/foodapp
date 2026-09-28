import { Controller, Get, Query } from '@nestjs/common';
import {
  type AnalyticsCancellations,
  type AnalyticsOrders,
  type AnalyticsOverview,
  type AnalyticsPopularItems,
  type AnalyticsRangeQuery,
  analyticsRangeQuerySchema,
  type AnalyticsRatings,
  type AnalyticsSales,
  type PopularItemsQuery,
  popularItemsQuerySchema,
} from '@quickbite/validation';
import { Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantOwnerOnly,
} from '../restaurants/restaurant-access';
import { RestaurantAnalyticsService } from './restaurant-analytics.service';

const range = new ZodValidationPipe(analyticsRangeQuerySchema);

/**
 * API_SPEC §61. Owner-only: analytics expose sales amounts, and V1 has no operator financial
 * permission (FINANCIAL_SPEC §41, AUTH_AUTHORIZATION §50).
 */
@Controller('restaurant/analytics')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
@RestaurantOwnerOnly()
export class RestaurantAnalyticsController {
  constructor(private readonly analytics: RestaurantAnalyticsService) {}

  @Get('overview')
  overview(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(range) query: AnalyticsRangeQuery,
  ): Promise<AnalyticsOverview> {
    return this.analytics.overview(access.restaurantId, query);
  }

  @Get('sales')
  sales(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(range) query: AnalyticsRangeQuery,
  ): Promise<AnalyticsSales> {
    return this.analytics.sales(access.restaurantId, query);
  }

  @Get('orders')
  orders(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(range) query: AnalyticsRangeQuery,
  ): Promise<AnalyticsOrders> {
    return this.analytics.orders(access.restaurantId, query);
  }

  @Get('popular-items')
  popularItems(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(popularItemsQuerySchema)) query: PopularItemsQuery,
  ): Promise<AnalyticsPopularItems> {
    return this.analytics.popularItems(access.restaurantId, query);
  }

  @Get('ratings')
  ratings(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(range) query: AnalyticsRangeQuery,
  ): Promise<AnalyticsRatings> {
    return this.analytics.ratings(access.restaurantId, query);
  }

  @Get('cancellations')
  cancellations(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(range) query: AnalyticsRangeQuery,
  ): Promise<AnalyticsCancellations> {
    return this.analytics.cancellations(access.restaurantId, query);
  }
}
