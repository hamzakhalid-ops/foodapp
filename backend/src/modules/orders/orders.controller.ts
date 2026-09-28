import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type CustomerOrderListQuery,
  customerOrderListQuerySchema,
  type Order,
  type OrderStatusView,
  type OrderSummary,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { OrdersService } from './orders.service';

/** API_SPEC §39, §41 — access is decided per order by the backend (404 when not permitted). */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(':orderId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Order> {
    return this.orders.getForActor(orderId, auth);
  }

  @Get(':orderId/status')
  status(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<OrderStatusView> {
    return this.orders.statusForActor(orderId, auth);
  }
}

/** API_SPEC §40 */
@Controller('customer/orders')
@Roles('CUSTOMER')
export class CustomerOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(customerOrderListQuerySchema)) query: CustomerOrderListQuery,
  ): Promise<ApiPage<OrderSummary>> {
    const { rows, nextCursor } = await this.orders.listForCustomer(auth.userId, query);
    return cursorPage(rows, query.limit, nextCursor);
  }
}
