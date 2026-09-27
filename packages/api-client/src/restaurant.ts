import {
  type AddStaffRequest,
  type Availability,
  availabilitySchema,
  type BusinessInformationRequest,
  type CreateRestaurantRequest,
  type DeliverySettingsRequest,
  deliverySettingsSchema,
  type Onboarding,
  onboardingSchema,
  type OperatingHoursRequest,
  operatingHoursSchema,
  type PauseRequest,
  type PaymentAccountRequest,
  type RegisterResponse,
  registerResponseSchema,
  type RestaurantAddressRequest,
  type RestaurantLocationRequest,
  type RestaurantProfile,
  restaurantProfileSchema,
  type RestaurantRegisterRequest,
  type StaffMember,
  staffMemberSchema,
  type UpdateBasicInformationRequest,
  type UpdateStaffRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient } from './client';

/**
 * Restaurant App endpoints (docs/api/API_SPEC.md §44–49, §57). The restaurant is implicit: every
 * route acts on the caller's active membership. Document upload uses multipart/form-data and is
 * sent with `fetch` directly (see `uploadDocumentForm`).
 */
export function createRestaurantApi(client: ApiClient) {
  const get = <T extends z.ZodType>(path: string, schema: T) =>
    client.request({ method: 'GET', path, schema });
  const send = <T extends z.ZodType>(
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    schema: T,
    body?: unknown,
  ) => client.request({ method, path, schema, ...(body === undefined ? {} : { body }) });

  return {
    register: async (body: RestaurantRegisterRequest): Promise<RegisterResponse> =>
      (await send('POST', '/restaurant/auth/register', registerResponseSchema, body)).data,
    createRestaurant: async (body: CreateRestaurantRequest): Promise<Onboarding> =>
      (await send('POST', '/restaurant/onboarding', onboardingSchema, body)).data,
    getOnboarding: async (): Promise<Onboarding> =>
      (await get('/restaurant/onboarding', onboardingSchema)).data,
    getApplication: async (): Promise<Onboarding['application']> =>
      (await get('/restaurant/application', onboardingSchema.shape.application)).data,
    updateBasicInformation: async (body: UpdateBasicInformationRequest): Promise<Onboarding> =>
      (await send('PATCH', '/restaurant/onboarding/basic-information', onboardingSchema, body))
        .data,
    updateAddress: async (body: RestaurantAddressRequest): Promise<Onboarding> =>
      (await send('PATCH', '/restaurant/onboarding/address', onboardingSchema, body)).data,
    updateLocation: async (body: RestaurantLocationRequest): Promise<Onboarding> =>
      (await send('PATCH', '/restaurant/onboarding/location', onboardingSchema, body)).data,
    updateOnboardingHours: async (body: OperatingHoursRequest): Promise<Onboarding> =>
      (await send('PATCH', '/restaurant/onboarding/operating-hours', onboardingSchema, body)).data,
    updateDelivery: async (body: DeliverySettingsRequest): Promise<Onboarding> =>
      (await send('PATCH', '/restaurant/onboarding/delivery', onboardingSchema, body)).data,
    updateBusiness: async (body: BusinessInformationRequest): Promise<Onboarding> =>
      (await send('PATCH', '/restaurant/onboarding/business', onboardingSchema, body)).data,
    updatePayment: async (body: PaymentAccountRequest): Promise<Onboarding> =>
      (await send('PATCH', '/restaurant/onboarding/payment', onboardingSchema, body)).data,
    submitApplication: async (): Promise<Onboarding> =>
      (await send('POST', '/restaurant/onboarding/submit', onboardingSchema)).data,

    getProfile: async (): Promise<RestaurantProfile> =>
      (await get('/restaurant/profile', restaurantProfileSchema)).data,
    updateProfile: async (body: UpdateBasicInformationRequest): Promise<RestaurantProfile> =>
      (await send('PATCH', '/restaurant/profile', restaurantProfileSchema, body)).data,
    getOperatingHours: async () =>
      (await get('/restaurant/operating-hours', operatingHoursSchema)).data,
    replaceOperatingHours: async (body: OperatingHoursRequest) =>
      (await send('PUT', '/restaurant/operating-hours', operatingHoursSchema, body)).data,
    getDeliverySettings: async () =>
      (await get('/restaurant/delivery-settings', deliverySettingsSchema.nullable())).data,

    getAvailability: async (): Promise<Availability> =>
      (await get('/restaurant/availability', availabilitySchema)).data,
    goOnline: async (): Promise<Availability> =>
      (await send('POST', '/restaurant/availability/online', availabilitySchema)).data,
    goOffline: async (): Promise<Availability> =>
      (await send('POST', '/restaurant/availability/offline', availabilitySchema)).data,
    pause: async (body: PauseRequest): Promise<Availability> =>
      (await send('POST', '/restaurant/availability/pause', availabilitySchema, body)).data,

    listStaff: async (): Promise<StaffMember[]> =>
      (await get('/restaurant/staff', z.array(staffMemberSchema))).data,
    addStaff: async (body: AddStaffRequest): Promise<StaffMember> =>
      (await send('POST', '/restaurant/staff', staffMemberSchema, body)).data,
    getStaff: async (staffId: string): Promise<StaffMember> =>
      (await get(`/restaurant/staff/${encodeURIComponent(staffId)}`, staffMemberSchema)).data,
    updateStaff: async (staffId: string, body: UpdateStaffRequest): Promise<StaffMember> =>
      (
        await send(
          'PATCH',
          `/restaurant/staff/${encodeURIComponent(staffId)}`,
          staffMemberSchema,
          body,
        )
      ).data,
    removeStaff: async (staffId: string): Promise<void> => {
      await send('DELETE', `/restaurant/staff/${encodeURIComponent(staffId)}`, z.null());
    },
  };
}

/** Builds the multipart body for POST /restaurant/onboarding/documents. */
export function uploadDocumentForm(documentType: string, file: Blob, filename: string): FormData {
  const form = new FormData();
  form.append('documentType', documentType);
  form.append('file', file, filename);
  return form;
}

export type RestaurantApi = ReturnType<typeof createRestaurantApi>;
