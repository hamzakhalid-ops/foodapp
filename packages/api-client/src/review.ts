import {
  type AdminReviewListQuery,
  type AdminReviewReportListQuery,
  type CreateReviewRequest,
  type PublicReview,
  type PublicReviewListQuery,
  publicReviewSchema,
  type RatingSummary,
  ratingSummarySchema,
  type ReportReviewRequest,
  type ResolveReviewReportRequest,
  type RestaurantReviewListQuery,
  type Review,
  type ReviewEligibility,
  reviewEligibilitySchema,
  type ReviewReport,
  reviewReportSchema,
  reviewSchema,
  type UpdateReviewRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/** Customer and public review endpoints (API_SPEC §88–89, REVIEW_SPEC §25–26). */
export function createReviewApi(client: ApiClient) {
  return {
    eligibility: async (orderId: string): Promise<ReviewEligibility> =>
      (
        await client.request({
          method: 'GET',
          path: `/orders/${id(orderId)}/review-eligibility`,
          schema: reviewEligibilitySchema,
        })
      ).data,
    create: async (orderId: string, body: CreateReviewRequest): Promise<Review> =>
      (
        await client.request({
          method: 'POST',
          path: `/orders/${id(orderId)}/review`,
          body,
          schema: reviewSchema,
        })
      ).data,
    getForOrder: async (orderId: string): Promise<Review> =>
      (
        await client.request({
          method: 'GET',
          path: `/orders/${id(orderId)}/review`,
          schema: reviewSchema,
        })
      ).data,
    update: async (reviewId: string, body: UpdateReviewRequest): Promise<Review> =>
      (
        await client.request({
          method: 'PATCH',
          path: `/reviews/${id(reviewId)}`,
          body,
          schema: reviewSchema,
        })
      ).data,
    remove: async (reviewId: string): Promise<void> => {
      await client.request({
        method: 'DELETE',
        path: `/reviews/${id(reviewId)}`,
        schema: z.null(),
      });
    },
    report: async (reviewId: string, body: ReportReviewRequest): Promise<ReviewReport> =>
      (
        await client.request({
          method: 'POST',
          path: `/reviews/${id(reviewId)}/report`,
          body,
          schema: reviewReportSchema,
        })
      ).data,
    listForRestaurant: (
      restaurantId: string,
      query: Partial<PublicReviewListQuery> = {},
    ): Promise<ApiResult<PublicReview[]>> =>
      client.request({
        method: 'GET',
        path: `/restaurants/${id(restaurantId)}/reviews`,
        schema: z.array(publicReviewSchema),
        query,
      }),
    ratingSummary: async (restaurantId: string): Promise<RatingSummary> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurants/${id(restaurantId)}/rating-summary`,
          schema: ratingSummarySchema,
        })
      ).data,
  };
}

/** Restaurant App reviews (API_SPEC §62). */
export function createRestaurantReviewApi(client: ApiClient) {
  return {
    list: (query: Partial<RestaurantReviewListQuery> = {}): Promise<ApiResult<Review[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurant/reviews',
        schema: z.array(reviewSchema),
        query,
      }),
    get: async (reviewId: string): Promise<Review> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurant/reviews/${id(reviewId)}`,
          schema: reviewSchema,
        })
      ).data,
    reply: async (reviewId: string, response: string): Promise<Review> =>
      (
        await client.request({
          method: 'POST',
          path: `/restaurant/reviews/${id(reviewId)}/reply`,
          body: { response },
          schema: reviewSchema,
        })
      ).data,
    report: async (reviewId: string, body: ReportReviewRequest): Promise<ReviewReport> =>
      (
        await client.request({
          method: 'POST',
          path: `/restaurant/reviews/${id(reviewId)}/report`,
          body,
          schema: reviewReportSchema,
        })
      ).data,
  };
}

/** Admin review moderation (API_SPEC §105). */
export function createAdminReviewApi(client: ApiClient) {
  const moderate = async (
    reviewId: string,
    action: 'hide' | 'restore' | 'remove',
    reason: string,
  ) =>
    (
      await client.request({
        method: 'POST',
        path: `/admin/reviews/${id(reviewId)}/${action}`,
        body: { reason },
        schema: reviewSchema,
      })
    ).data;
  return {
    list: (query: Partial<AdminReviewListQuery> = {}): Promise<ApiResult<Review[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/reviews',
        schema: z.array(reviewSchema),
        query,
      }),
    get: (reviewId: string) =>
      client.request({
        method: 'GET',
        path: `/admin/reviews/${id(reviewId)}`,
        schema: z.unknown(),
      }),
    hide: (reviewId: string, reason: string) => moderate(reviewId, 'hide', reason),
    restore: (reviewId: string, reason: string) => moderate(reviewId, 'restore', reason),
    remove: (reviewId: string, reason: string) => moderate(reviewId, 'remove', reason),
    reports: (
      query: Partial<AdminReviewReportListQuery> = {},
    ): Promise<ApiResult<ReviewReport[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/review-reports',
        schema: z.array(reviewReportSchema),
        query,
      }),
    resolveReport: async (
      reportId: string,
      body: ResolveReviewReportRequest,
    ): Promise<ReviewReport> =>
      (
        await client.request({
          method: 'POST',
          path: `/admin/review-reports/${id(reportId)}/resolve`,
          body,
          schema: reviewReportSchema,
        })
      ).data,
  };
}
