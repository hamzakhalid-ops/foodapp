import {
  type AdminRiderListQuery,
  type AdminRiderUpdateRequest,
  type CompleteDeliveryRequest,
  type Delivery,
  deliverySchema,
  type DispatchOffer,
  dispatchOfferSchema,
  type RegisterResponse,
  registerResponseSchema,
  type RiderAvailability,
  riderAvailabilitySchema,
  type RiderDeliveryListQuery,
  riderDocumentSchema,
  type RiderDocument,
  type RiderLocationRequest,
  type RiderOnboarding,
  riderOnboardingSchema,
  type RiderProfile,
  riderProfileSchema,
  type RiderRegisterRequest,
  type UpdateRiderProfileRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/**
 * Rider App endpoints (docs/api/API_SPEC.md §63–74). Document uploads are multipart and are sent
 * with `fetch` directly using `uploadDocumentForm` (see restaurant.ts).
 */
export function createRiderApi(client: ApiClient) {
  const get = <T extends z.ZodType>(
    path: string,
    schema: T,
    query?: Record<string, string | number | boolean | undefined>,
  ) => client.request({ method: 'GET', path, schema, ...(query ? { query } : {}) });
  const send = <T extends z.ZodType>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    schema: T,
    body?: unknown,
  ) => client.request({ method, path, schema, ...(body === undefined ? {} : { body }) });

  return {
    register: async (body: RiderRegisterRequest): Promise<RegisterResponse> =>
      (await send('POST', '/rider/auth/register', registerResponseSchema, body)).data,
    getProfile: async (): Promise<RiderProfile> =>
      (await get('/rider/profile', riderProfileSchema)).data,
    updateProfile: async (body: UpdateRiderProfileRequest): Promise<RiderProfile> =>
      (await send('PATCH', '/rider/profile', riderProfileSchema, body)).data,
    getOnboarding: async (): Promise<RiderOnboarding> =>
      (await get('/rider/onboarding', riderOnboardingSchema)).data,
    updateOnboarding: async (body: UpdateRiderProfileRequest): Promise<RiderOnboarding> =>
      (await send('PATCH', '/rider/onboarding', riderOnboardingSchema, body)).data,
    submitOnboarding: async (): Promise<RiderOnboarding> =>
      (await send('POST', '/rider/onboarding/submit', riderOnboardingSchema)).data,
    listDocuments: async (): Promise<RiderDocument[]> =>
      (await get('/rider/documents', z.array(riderDocumentSchema))).data,
    deleteDocument: async (documentId: string): Promise<void> => {
      await send('DELETE', `/rider/documents/${id(documentId)}`, z.null());
    },
    getAvailability: async (): Promise<RiderAvailability> =>
      (await get('/rider/availability', riderAvailabilitySchema)).data,
    goOnline: async (): Promise<RiderAvailability> =>
      (await send('POST', '/rider/availability/online', riderAvailabilitySchema)).data,
    goOffline: async (): Promise<RiderAvailability> =>
      (await send('POST', '/rider/availability/offline', riderAvailabilitySchema)).data,
    setAvailable: async (available: boolean): Promise<RiderAvailability> =>
      (await send('POST', '/rider/availability', riderAvailabilitySchema, { available })).data,
    updateLocation: async (body: RiderLocationRequest): Promise<void> => {
      await send('POST', '/rider/location', z.null(), body);
    },

    listOffers: async (): Promise<DispatchOffer[]> =>
      (await get('/rider/delivery-offers', z.array(dispatchOfferSchema))).data,
    getOffer: async (offerId: string): Promise<DispatchOffer> =>
      (await get(`/rider/delivery-offers/${id(offerId)}`, dispatchOfferSchema)).data,
    acceptOffer: async (offerId: string): Promise<Delivery> =>
      (await send('POST', `/rider/delivery-offers/${id(offerId)}/accept`, deliverySchema)).data,
    rejectOffer: async (offerId: string, reasonCode: string): Promise<DispatchOffer> =>
      (
        await send('POST', `/rider/delivery-offers/${id(offerId)}/reject`, dispatchOfferSchema, {
          reasonCode,
        })
      ).data,

    currentDelivery: async (): Promise<Delivery | null> =>
      (await get('/rider/delivery/current', deliverySchema.nullable())).data,
    getDelivery: async (deliveryId: string): Promise<Delivery> =>
      (await get(`/deliveries/${id(deliveryId)}`, deliverySchema)).data,
    listDeliveries: (query: Partial<RiderDeliveryListQuery> = {}): Promise<ApiResult<Delivery[]>> =>
      get('/rider/deliveries', z.array(deliverySchema), query),
    arriving: async (deliveryId: string): Promise<Delivery> =>
      (await send('POST', `/rider/deliveries/${id(deliveryId)}/arriving`, deliverySchema)).data,
    pickup: async (deliveryId: string): Promise<Delivery> =>
      (await send('POST', `/rider/deliveries/${id(deliveryId)}/pickup`, deliverySchema)).data,
    outForDelivery: async (deliveryId: string): Promise<Delivery> =>
      (await send('POST', `/rider/deliveries/${id(deliveryId)}/out-for-delivery`, deliverySchema))
        .data,
    completeDelivery: async (
      deliveryId: string,
      body: CompleteDeliveryRequest,
    ): Promise<Delivery> =>
      (await send('POST', `/rider/deliveries/${id(deliveryId)}/complete`, deliverySchema, body))
        .data,
  };
}

/** Admin rider management (docs/api/API_SPEC.md §98–99). */
export function createAdminRiderApi(client: ApiClient) {
  const action = (riderId: string, name: string, reason?: string) =>
    client.request({
      method: 'POST',
      path: `/admin/riders/${id(riderId)}/${name}`,
      schema: z.unknown(),
      ...(reason === undefined ? {} : { body: { reason } }),
    });
  return {
    list: (query: Partial<AdminRiderListQuery> = {}): Promise<ApiResult<RiderProfile[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/riders',
        schema: z.array(riderProfileSchema),
        query,
      }),
    get: (riderId: string) =>
      client.request({ method: 'GET', path: `/admin/riders/${id(riderId)}`, schema: z.unknown() }),
    update: (riderId: string, body: AdminRiderUpdateRequest) =>
      client.request({
        method: 'PATCH',
        path: `/admin/riders/${id(riderId)}`,
        schema: z.unknown(),
        body,
      }),
    approve: (riderId: string) => action(riderId, 'approve'),
    reject: (riderId: string, reason: string) => action(riderId, 'reject', reason),
    suspend: (riderId: string, reason: string) => action(riderId, 'suspend', reason),
    restore: (riderId: string, reason: string) => action(riderId, 'restore', reason),
  };
}
