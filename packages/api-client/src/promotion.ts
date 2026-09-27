import {
  type AdminUpdatePromotionRequest,
  type CreatePromotionRequest,
  type Promotion,
  type PromotionListQuery,
  promotionSchema,
  type PromotionValidation,
  promotionValidationSchema,
  type PublicPromotion,
  publicPromotionSchema,
  type UpdatePromotionRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/** Restaurant App promotion management (docs/api/API_SPEC.md §58; owner only). */
export function createRestaurantPromotionApi(client: ApiClient) {
  return {
    list: (query: Partial<PromotionListQuery> = {}): Promise<ApiResult<Promotion[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurant/promotions',
        schema: z.array(promotionSchema),
        query,
      }),
    get: async (promotionId: string): Promise<Promotion> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurant/promotions/${id(promotionId)}`,
          schema: promotionSchema,
        })
      ).data,
    create: async (body: CreatePromotionRequest): Promise<Promotion> =>
      (
        await client.request({
          method: 'POST',
          path: '/restaurant/promotions',
          body,
          schema: promotionSchema,
        })
      ).data,
    update: async (promotionId: string, body: UpdatePromotionRequest): Promise<Promotion> =>
      (
        await client.request({
          method: 'PATCH',
          path: `/restaurant/promotions/${id(promotionId)}`,
          body,
          schema: promotionSchema,
        })
      ).data,
    disable: async (promotionId: string): Promise<Promotion> =>
      (
        await client.request({
          method: 'POST',
          path: `/restaurant/promotions/${id(promotionId)}/disable`,
          schema: promotionSchema,
        })
      ).data,
  };
}

/** Customer-facing promotion endpoints (PROMOTION_RULES §22, §39). */
export function createCustomerPromotionApi(client: ApiClient) {
  return {
    forRestaurant: async (restaurantId: string): Promise<PublicPromotion[]> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurants/${id(restaurantId)}/promotions`,
          schema: z.array(publicPromotionSchema),
        })
      ).data,
    /** Informational only; the code is revalidated when the order is created. */
    validate: async (code: string): Promise<PromotionValidation> =>
      (
        await client.request({
          method: 'POST',
          path: '/promotions/validate',
          body: { code },
          schema: promotionValidationSchema,
        })
      ).data,
  };
}

/** Admin promotions (docs/api/API_SPEC.md §104). */
export function createAdminPromotionApi(client: ApiClient) {
  return {
    list: (query: Partial<PromotionListQuery> = {}): Promise<ApiResult<Promotion[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/promotions',
        schema: z.array(promotionSchema),
        query,
      }),
    get: async (promotionId: string): Promise<Promotion> =>
      (
        await client.request({
          method: 'GET',
          path: `/admin/promotions/${id(promotionId)}`,
          schema: promotionSchema,
        })
      ).data,
    setStatus: async (promotionId: string, body: AdminUpdatePromotionRequest): Promise<Promotion> =>
      (
        await client.request({
          method: 'PATCH',
          path: `/admin/promotions/${id(promotionId)}`,
          body,
          schema: promotionSchema,
        })
      ).data,
    disable: async (promotionId: string, reason: string): Promise<Promotion> =>
      (
        await client.request({
          method: 'POST',
          path: `/admin/promotions/${id(promotionId)}/disable`,
          body: { reason },
          schema: promotionSchema,
        })
      ).data,
  };
}
