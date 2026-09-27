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
  type AdminRestaurantListQuery,
  adminRestaurantListQuerySchema,
  type AdminRestaurantStatusRequest,
  adminRestaurantStatusRequestSchema,
  reasonRequestSchema,
  type RestaurantProfile,
} from '@quickbite/validation';
import { AdminOnly, type AuthContext, CurrentAuth } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { offsetPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  type AdminRestaurantDetail,
  RestaurantReviewService,
} from '../restaurants/restaurant-review.service';

/** /api/v1/admin/restaurants — API_SPEC §96–97, ADMIN_SPEC §8–10. */
@Controller('admin/restaurants')
@AdminOnly()
export class AdminRestaurantsController {
  constructor(private readonly review: RestaurantReviewService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminRestaurantListQuerySchema)) query: AdminRestaurantListQuery,
  ): Promise<ApiPage<RestaurantProfile>> {
    const result = await this.review.list({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
    });
    return offsetPage(result.rows, result.total, query.page, query.pageSize);
  }

  @Get(':restaurantId')
  detail(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<AdminRestaurantDetail> {
    return this.review.detail(restaurantId);
  }

  @Patch(':restaurantId')
  status(
    @CurrentAuth() auth: AuthContext,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body(new ZodValidationPipe(adminRestaurantStatusRequestSchema))
    body: AdminRestaurantStatusRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRestaurantDetail> {
    return this.review.setStatus(restaurantId, body.status, body.reason, auth.userId, meta);
  }

  @Post(':restaurantId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRestaurantDetail> {
    return this.review.approve(restaurantId, auth.userId, meta);
  }

  @Post(':restaurantId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRestaurantDetail> {
    return this.review.reject(restaurantId, body.reason, auth.userId, meta);
  }

  @Post(':restaurantId/request-resubmission')
  @HttpCode(HttpStatus.OK)
  resubmission(
    @CurrentAuth() auth: AuthContext,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRestaurantDetail> {
    return this.review.requestResubmission(restaurantId, body.reason, auth.userId, meta);
  }
}
