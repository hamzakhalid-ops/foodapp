import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  type AdminCancelRequest,
  adminCancelRequestSchema,
  type CustomerCancelRequest,
  customerCancelRequestSchema,
  type Order,
  type RestaurantCancelRequest,
  restaurantCancelRequestSchema,
} from '@quickbite/validation';
import { AdminOnly, type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantMember,
} from '../restaurants/restaurant-access';
import { CancellationService } from './cancellation.service';

/** POST /orders/{id}/cancel — API_SPEC §43 */
@Controller('orders')
@Roles('CUSTOMER')
export class CustomerCancellationController {
  constructor(private readonly cancellation: CancellationService) {}

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(customerCancelRequestSchema)) body: CustomerCancelRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Order> {
    return this.cancellation.cancel(orderId, { kind: 'CUSTOMER', userId: auth.userId }, body, meta);
  }
}

/** Reject (§53) and cancel (§56) are the same restaurant cancellation of a new order. */
@Controller('restaurant/orders')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
export class RestaurantCancellationController {
  constructor(private readonly cancellation: CancellationService) {}

  @Post(':orderId/reject')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  reject(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(restaurantCancelRequestSchema)) body: RestaurantCancelRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Order> {
    return this.cancellation.cancel(orderId, restaurantActor(auth, access), body, meta);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  cancel(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(restaurantCancelRequestSchema)) body: RestaurantCancelRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Order> {
    return this.cancellation.cancel(orderId, restaurantActor(auth, access), body, meta);
  }
}

/** POST /admin/orders/{id}/cancel — API_SPEC §101 */
@Controller('admin/orders')
@AdminOnly()
export class AdminCancellationController {
  constructor(private readonly cancellation: CancellationService) {}

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(adminCancelRequestSchema)) body: AdminCancelRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Order> {
    const role = auth.roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'ADMIN';
    return this.cancellation.cancel(
      orderId,
      { kind: 'ADMIN', userId: auth.userId, role },
      body,
      meta,
    );
  }
}

function restaurantActor(auth: AuthContext, access: RestaurantAccess) {
  return {
    kind: 'RESTAURANT' as const,
    userId: auth.userId,
    restaurantId: access.restaurantId,
    role:
      access.staffRole === 'OWNER'
        ? ('RESTAURANT_OWNER' as const)
        : ('RESTAURANT_OPERATOR' as const),
  };
}
