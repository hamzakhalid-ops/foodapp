import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AcceptOrderRequest,
  acceptOrderRequestSchema,
  type Order,
  type OrderSummary,
  type RestaurantOrderListQuery,
  restaurantOrderListQuerySchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantMember,
} from '../restaurants/restaurant-access';
import { RestaurantOrdersService } from './restaurant-orders.service';

/** /api/v1/restaurant/orders — API_SPEC §51–55 (owner or operator, ORDER_RULES §12). */
@Controller('restaurant/orders')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
export class RestaurantOrdersController {
  constructor(private readonly orders: RestaurantOrdersService) {}

  @Get('new')
  @RestaurantMember()
  listNew(@CurrentRestaurant() access: RestaurantAccess): Promise<OrderSummary[]> {
    return this.orders.listNew(access.restaurantId);
  }

  @Get()
  @RestaurantMember()
  async list(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(restaurantOrderListQuerySchema)) query: RestaurantOrderListQuery,
  ): Promise<ApiPage<OrderSummary>> {
    const { rows, nextCursor } = await this.orders.list(access.restaurantId, query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get(':orderId')
  @RestaurantMember()
  detail(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Order> {
    return this.orders.detail(access.restaurantId, orderId);
  }

  @Post(':orderId/accept')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  accept(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(acceptOrderRequestSchema)) body: AcceptOrderRequest,
  ): Promise<Order> {
    return this.orders.accept(access.restaurantId, orderId, auth.userId, body);
  }

  @Post(':orderId/preparing')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  preparing(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Order> {
    return this.orders.startPreparing(access.restaurantId, orderId, auth.userId);
  }

  @Post(':orderId/ready')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  ready(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Order> {
    return this.orders.markReady(access.restaurantId, orderId, auth.userId);
  }
}
