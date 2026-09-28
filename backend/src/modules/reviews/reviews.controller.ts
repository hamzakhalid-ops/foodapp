import {
  Body,
  Controller,
  Delete,
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
  type AdminReviewListQuery,
  adminReviewListQuerySchema,
  type AdminReviewReportListQuery,
  adminReviewReportListQuerySchema,
  type CreateReviewRequest,
  createReviewRequestSchema,
  type PublicReview,
  type PublicReviewListQuery,
  publicReviewListQuerySchema,
  type RatingSummary,
  reasonRequestSchema,
  type ReportReviewRequest,
  reportReviewRequestSchema,
  type ResolveReviewReportRequest,
  resolveReviewReportRequestSchema,
  type RestaurantReviewListQuery,
  restaurantReviewListQuerySchema,
  type Review,
  type ReviewEligibility,
  type ReviewReplyRequest,
  reviewReplyRequestSchema,
  type ReviewReport,
  type UpdateReviewRequest,
  updateReviewRequestSchema,
} from '@quickbite/validation';
import {
  AdminOnly,
  type AuthContext,
  CurrentAuth,
  Public,
  Roles,
} from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage, offsetPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantMember,
} from '../restaurants/restaurant-access';
import { ReviewsService } from './reviews.service';

/** Customer reviews — API_SPEC §88–89, REVIEW_SPEC §25. */
@Controller()
export class CustomerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('orders/:orderId/review-eligibility')
  @Roles('CUSTOMER')
  eligibility(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<ReviewEligibility> {
    return this.reviews.eligibility(auth.userId, orderId);
  }

  @Post('orders/:orderId/review')
  @Roles('CUSTOMER')
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(createReviewRequestSchema)) body: CreateReviewRequest,
  ): Promise<Review> {
    return this.reviews.create(auth.userId, orderId, body);
  }

  @Get('orders/:orderId/review')
  @Roles('CUSTOMER')
  getForOrder(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Review> {
    return this.reviews.getForOrder(auth.userId, orderId);
  }

  @Patch('reviews/:reviewId')
  @Roles('CUSTOMER')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(updateReviewRequestSchema)) body: UpdateReviewRequest,
  ): Promise<Review> {
    return this.reviews.update(auth.userId, reviewId, body);
  }

  @Delete('reviews/:reviewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('CUSTOMER')
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.reviews.removeOwn(auth.userId, reviewId, meta);
  }

  @Post('reviews/:reviewId/report')
  @Roles('CUSTOMER')
  report(
    @CurrentAuth() auth: AuthContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(reportReviewRequestSchema)) body: ReportReviewRequest,
  ): Promise<ReviewReport> {
    return this.reviews.report(auth.userId, reviewId, body);
  }

  @Get('restaurants/:restaurantId/reviews')
  @Public()
  async publicList(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query(new ZodValidationPipe(publicReviewListQuerySchema)) query: PublicReviewListQuery,
  ): Promise<ApiPage<PublicReview>> {
    const { rows, total } = await this.reviews.publicList(restaurantId, query);
    return offsetPage(rows, total, query.page, query.pageSize);
  }

  @Get('restaurants/:restaurantId/rating-summary')
  @Public()
  summary(@Param('restaurantId', ParseUUIDPipe) restaurantId: string): Promise<RatingSummary> {
    return this.reviews.ratingSummary(restaurantId);
  }
}

/** Restaurant reviews — API_SPEC §62 (owner or operator, REVIEW_RULES §32–33). */
@Controller('restaurant/reviews')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
export class RestaurantReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @RestaurantMember()
  async list(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(restaurantReviewListQuerySchema)) query: RestaurantReviewListQuery,
  ): Promise<ApiPage<Review>> {
    const { rows, nextCursor } = await this.reviews.restaurantList(access.restaurantId, query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get(':reviewId')
  @RestaurantMember()
  get(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ): Promise<Review> {
    return this.reviews.restaurantGet(access.restaurantId, reviewId);
  }

  @Post(':reviewId/reply')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  reply(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(reviewReplyRequestSchema)) body: ReviewReplyRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Review> {
    return this.reviews.reply(access.restaurantId, reviewId, auth.userId, body.response, meta);
  }

  @Post(':reviewId/report')
  @RestaurantMember()
  report(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(reportReviewRequestSchema)) body: ReportReviewRequest,
  ): Promise<ReviewReport> {
    return this.reviews.report(auth.userId, reviewId, body, access.restaurantId);
  }
}

/** Review moderation — API_SPEC §105, REVIEW_SPEC §27 (audited). */
@Controller('admin')
@AdminOnly()
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('reviews')
  async list(
    @Query(new ZodValidationPipe(adminReviewListQuerySchema)) query: AdminReviewListQuery,
  ): Promise<ApiPage<Review>> {
    const { rows, nextCursor } = await this.reviews.adminList(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get('reviews/:reviewId')
  get(@Param('reviewId', ParseUUIDPipe) reviewId: string) {
    return this.reviews.adminGet(reviewId);
  }

  @Post('reviews/:reviewId/hide')
  @HttpCode(HttpStatus.OK)
  hide(
    @CurrentAuth() auth: AuthContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<Review> {
    return this.reviews.moderate(reviewId, 'hide', body.reason, auth.userId, meta);
  }

  @Post('reviews/:reviewId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentAuth() auth: AuthContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<Review> {
    return this.reviews.moderate(reviewId, 'restore', body.reason, auth.userId, meta);
  }

  @Post('reviews/:reviewId/remove')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<Review> {
    return this.reviews.moderate(reviewId, 'remove', body.reason, auth.userId, meta);
  }

  @Get('review-reports')
  async reports(
    @Query(new ZodValidationPipe(adminReviewReportListQuerySchema))
    query: AdminReviewReportListQuery,
  ): Promise<ApiPage<ReviewReport>> {
    const { rows, nextCursor } = await this.reviews.adminReports(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Post('review-reports/:reportId/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentAuth() auth: AuthContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body(new ZodValidationPipe(resolveReviewReportRequestSchema)) body: ResolveReviewReportRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ReviewReport> {
    return this.reviews.resolveReport(reportId, body.outcome, body.reason, auth.userId, meta);
  }
}
