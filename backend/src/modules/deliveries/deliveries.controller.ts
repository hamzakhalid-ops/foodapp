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
  type CompleteDeliveryRequest,
  completeDeliveryRequestSchema,
  type Delivery,
  type RiderDeliveryListQuery,
  riderDeliveryListQuerySchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { DeliveriesService } from './deliveries.service';

/** Rider delivery flow — API_SPEC §73–74. */
@Controller('rider')
@Roles('RIDER')
export class RiderDeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('delivery/current')
  current(@CurrentAuth() auth: AuthContext): Promise<Delivery | null> {
    return this.deliveries.current(auth.userId);
  }

  @Get('deliveries')
  async history(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(riderDeliveryListQuerySchema)) query: RiderDeliveryListQuery,
  ): Promise<ApiPage<Delivery>> {
    const { rows, nextCursor } = await this.deliveries.history(auth.userId, query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Post('deliveries/:deliveryId/arriving')
  @HttpCode(HttpStatus.OK)
  arriving(
    @CurrentAuth() auth: AuthContext,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<Delivery> {
    return this.deliveries.arriving(auth.userId, deliveryId);
  }

  @Post('deliveries/:deliveryId/pickup')
  @HttpCode(HttpStatus.OK)
  pickup(
    @CurrentAuth() auth: AuthContext,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<Delivery> {
    return this.deliveries.pickup(auth.userId, deliveryId);
  }

  @Post('deliveries/:deliveryId/out-for-delivery')
  @HttpCode(HttpStatus.OK)
  outForDelivery(
    @CurrentAuth() auth: AuthContext,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<Delivery> {
    return this.deliveries.outForDelivery(auth.userId, deliveryId);
  }

  @Post('deliveries/:deliveryId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentAuth() auth: AuthContext,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body(new ZodValidationPipe(completeDeliveryRequestSchema)) body: CompleteDeliveryRequest,
  ): Promise<Delivery> {
    return this.deliveries.complete(auth.userId, deliveryId, body);
  }
}

/** GET /deliveries/{id} — API_SPEC §73 (access decided per delivery). */
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get(':deliveryId')
  detail(
    @CurrentAuth() auth: AuthContext,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<Delivery> {
    return this.deliveries.detailForActor(deliveryId, auth);
  }
}
