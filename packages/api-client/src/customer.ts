import {
  type Address,
  addressSchema,
  type CreateAddressRequest,
  type CustomerProfile,
  customerProfileSchema,
  type UpdateAddressRequest,
  type UpdateCustomerProfileRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient } from './client';

/** Customer profile and addresses (docs/api/API_SPEC.md §26–27). */
export function createCustomerApi(client: ApiClient) {
  return {
    getProfile: async (): Promise<CustomerProfile> =>
      (
        await client.request({
          method: 'GET',
          path: '/customer/profile',
          schema: customerProfileSchema,
        })
      ).data,
    updateProfile: async (body: UpdateCustomerProfileRequest): Promise<CustomerProfile> =>
      (
        await client.request({
          method: 'PATCH',
          path: '/customer/profile',
          body,
          schema: customerProfileSchema,
        })
      ).data,
    listAddresses: async (): Promise<Address[]> =>
      (
        await client.request({
          method: 'GET',
          path: '/customer/addresses',
          schema: z.array(addressSchema),
        })
      ).data,
    createAddress: async (body: CreateAddressRequest): Promise<Address> =>
      (
        await client.request({
          method: 'POST',
          path: '/customer/addresses',
          body,
          schema: addressSchema,
        })
      ).data,
    updateAddress: async (addressId: string, body: UpdateAddressRequest): Promise<Address> =>
      (
        await client.request({
          method: 'PATCH',
          path: `/customer/addresses/${encodeURIComponent(addressId)}`,
          body,
          schema: addressSchema,
        })
      ).data,
    deleteAddress: async (addressId: string): Promise<void> => {
      await client.request({
        method: 'DELETE',
        path: `/customer/addresses/${encodeURIComponent(addressId)}`,
        schema: z.null(),
      });
    },
    setDefaultAddress: async (addressId: string): Promise<Address> =>
      (
        await client.request({
          method: 'POST',
          path: `/customer/addresses/${encodeURIComponent(addressId)}/default`,
          schema: addressSchema,
        })
      ).data,
  };
}

export type CustomerApi = ReturnType<typeof createCustomerApi>;
