import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AdminUpdatePromotionRequest,
  adminUpdatePromotionRequestSchema,
  type CreatePromotionRequest,
  createPromotionRequestSchema,
  type Promotion,
  type PromotionListQuery,
  promotionListQuerySchema,
  type PromotionValidation,
  type PublicPromotion,
  reasonRequestSchema,
  type UpdatePromotionRequest,
  updatePromotionRequestSchema,
  type ValidatePromotionRequest,
  validatePromotionRequestSchema,
} from '@quickbite/validation';
import {
  AdminOnly,
  type AuthContext,
  CurrentAuth,
  Public,
  Roles,
} from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { offsetPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { CartService } from '../cart/cart.service';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantOwnerOnly,
} from '../restaurants/restaurant-access';
import { PromotionsService } from './promotions.service';

/** /api/v1/restaurant/promotions — API_SPEC §58 (owner: `promotions.manage`, AUTH §42). */
@Controller('restaurant/promotions')
@Roles('RESTAURANT_OWNER')
export class RestaurantPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @RestaurantOwnerOnly()
  async list(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(promotionListQuerySchema)) query: PromotionListQuery,
  ): Promise<ApiPage<Promotion>> {
    const { rows, total } = await this.promotions.list(access.restaurantId, query);
    return offsetPage(rows, total, query.page, query.pageSize);
  }

  @Post()
  @RestaurantOwnerOnly()
  create(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(createPromotionRequestSchema)) body: CreatePromotionRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Promotion> {
    return this.promotions.create(access.restaurantId, body, auth.userId, meta);
  }

  @Get(':promotionId')
  @RestaurantOwnerOnly()
  get(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
  ): Promise<Promotion> {
    return this.promotions.get(access.restaurantId, promotionId);
  }

  @Patch(':promotionId')
  @RestaurantOwnerOnly()
  update(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @Body(new ZodValidationPipe(updatePromotionRequestSchema)) body: UpdatePromotionRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Promotion> {
    return this.promotions.update(access.restaurantId, promotionId, body, auth.userId, meta);
  }

  @Post(':promotionId/disable')
  @HttpCode(HttpStatus.OK)
  @RestaurantOwnerOnly()
  disable(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Promotion> {
    return this.promotions.disable(access.restaurantId, promotionId, auth.userId, meta);
  }
}

/** /api/v1/admin/promotions — API_SPEC §104 */
@Controller('admin/promotions')
@AdminOnly()
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(promotionListQuerySchema)) query: PromotionListQuery,
  ): Promise<ApiPage<Promotion>> {
    const { rows, total } = await this.promotions.list(null, query);
    return offsetPage(rows, total, query.page, query.pageSize);
  }

  @Get(':promotionId')
  get(@Param('promotionId', ParseUUIDPipe) promotionId: string): Promise<Promotion> {
    return this.promotions.get(null, promotionId);
  }

  @Patch(':promotionId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @Body(new ZodValidationPipe(adminUpdatePromotionRequestSchema))
    body: AdminUpdatePromotionRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Promotion> {
    return this.promotions.adminSetStatus(promotionId, body, auth.userId, meta);
  }

  @Post(':promotionId/disable')
  @HttpCode(HttpStatus.OK)
  disable(
    @CurrentAuth() auth: AuthContext,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<Promotion> {
    return this.promotions.disable(null, promotionId, auth.userId, meta, body.reason);
  }
}

/** Customer promotion validation (PROMOTION_RULES §22) and restaurant promotion display (§39). */
@Controller()
export class CustomerPromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly cart: CartService,
  ) {}

  @Post('promotions/validate')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER')
  async validate(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(validatePromotionRequestSchema)) body: ValidatePromotionRequest,
  ): Promise<PromotionValidation> {
    const quote = await this.cart.quote(auth.userId);
    const restaurantId = quote.cart?.restaurantId;
    return this.promotions.validateForCart(
      auth.userId,
      body.code,
      quote.lines.length > 0 && restaurantId ? { restaurantId, subtotal: quote.subtotal } : null,
    );
  }

  @Get('restaurants/:restaurantId/promotions')
  @Public()
  forRestaurant(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<PublicPromotion[]> {
    return this.promotions.publicForRestaurant(restaurantId);
  }
}
