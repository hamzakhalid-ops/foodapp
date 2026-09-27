import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type EarningListQuery,
  earningListQuerySchema,
  type FinanceRangeQuery,
  financeRangeQuerySchema,
  type RestaurantEarning,
  type RestaurantEarningsSummary,
  type RestaurantFeesSummary,
  type RiderEarning,
  type RiderEarningsSummary,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantOwnerOnly,
} from '../restaurants/restaurant-access';
import { RidersService } from '../riders/riders.service';
import { EarningsService } from './earnings.service';

/**
 * API_SPEC §59. Financial screens are owner-only: V1 has no operator financial permission
 * (FINANCIAL_SPEC §41, AUTH_AUTHORIZATION §50).
 */
@Controller('restaurant/earnings')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
@RestaurantOwnerOnly()
export class RestaurantEarningsController {
  constructor(private readonly earnings: EarningsService) {}

  @Get()
  summary(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(financeRangeQuerySchema)) query: FinanceRangeQuery,
  ): Promise<RestaurantEarningsSummary> {
    return this.earnings.restaurantSummary(access.restaurantId, query);
  }

  @Get('transactions')
  async transactions(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(earningListQuerySchema)) query: EarningListQuery,
  ): Promise<ApiPage<RestaurantEarning>> {
    const { rows, nextCursor } = await this.earnings.restaurantList(access.restaurantId, query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get('fees')
  fees(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(financeRangeQuerySchema)) query: FinanceRangeQuery,
  ): Promise<RestaurantFeesSummary> {
    return this.earnings.restaurantFees(access.restaurantId, query);
  }

  @Get(':earningId')
  get(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('earningId', ParseUUIDPipe) earningId: string,
  ): Promise<RestaurantEarning> {
    return this.earnings.restaurantEarning(access.restaurantId, earningId);
  }
}

/** API_SPEC §75: a rider's own earnings only (FINANCIAL_SPEC §42). */
@Controller('rider/earnings')
@Roles('RIDER')
export class RiderEarningsController {
  constructor(
    private readonly earnings: EarningsService,
    private readonly riders: RidersService,
  ) {}

  @Get()
  async summary(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(financeRangeQuerySchema)) query: FinanceRangeQuery,
  ): Promise<RiderEarningsSummary> {
    const rider = await this.riders.requireByUser(auth.userId);
    return this.earnings.riderSummary(rider.id, query);
  }

  @Get('transactions')
  async transactions(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(earningListQuerySchema)) query: EarningListQuery,
  ): Promise<ApiPage<RiderEarning>> {
    const rider = await this.riders.requireByUser(auth.userId);
    const { rows, nextCursor } = await this.earnings.riderList(rider.id, query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get(':earningId')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('earningId', ParseUUIDPipe) earningId: string,
  ): Promise<RiderEarning> {
    const rider = await this.riders.requireByUser(auth.userId);
    return this.earnings.riderEarning(rider.id, earningId);
  }
}
