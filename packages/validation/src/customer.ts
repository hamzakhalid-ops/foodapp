import { z } from 'zod';
import {
  httpsUrlSchema,
  latitudeSchema,
  longitudeSchema,
  optionalText,
  requiredText,
} from './common';

/** API_SPEC §26 */
export const customerProfileSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  profileImageUrl: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const updateCustomerProfileRequestSchema = z
  .object({
    firstName: requiredText(100),
    lastName: requiredText(100),
    profileImageUrl: httpsUrlSchema.nullable(),
  })
  .partial()
  .strict();

/** API_SPEC §27 */
export const addressSchema = z.object({
  id: z.uuid(),
  label: z.string().nullable(),
  recipientName: z.string(),
  phone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  area: z.string().nullable(),
  city: z.string(),
  postalCode: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  deliveryInstructions: z.string().nullable(),
  isDefault: z.boolean(),
});

const addressFields = {
  label: optionalText(50),
  recipientName: requiredText(120),
  phone: requiredText(32),
  addressLine1: requiredText(255),
  addressLine2: optionalText(255),
  area: optionalText(120),
  city: requiredText(120),
  postalCode: optionalText(20),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  deliveryInstructions: optionalText(500),
  isDefault: z.boolean().optional(),
};

export const createAddressRequestSchema = z.object(addressFields).strict();
export const updateAddressRequestSchema = z.object(addressFields).partial().strict();

export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type UpdateCustomerProfileRequest = z.infer<typeof updateCustomerProfileRequestSchema>;
export type Address = z.infer<typeof addressSchema>;
export type CreateAddressRequest = z.infer<typeof createAddressRequestSchema>;
export type UpdateAddressRequest = z.infer<typeof updateAddressRequestSchema>;
