import { z } from 'zod';
import {
  httpsUrlSchema,
  latitudeSchema,
  longitudeSchema,
  pageQuerySchema,
  requiredText,
} from './common';
import { documentTypeSchema } from './restaurant';

export const RIDER_APPROVAL_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;
export const riderApprovalStatusSchema = z.enum(RIDER_APPROVAL_STATUSES);

/** Vehicle type code chosen by the rider, e.g. MOTORCYCLE (no V1 vehicle rules; DISPATCH_RULES §4). */
const vehicleTypeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,29}$/, 'Use an upper-case vehicle type, e.g. MOTORCYCLE');

/** API_SPEC §63 */
export const riderRegisterRequestSchema = z
  .object({
    email: z.string().trim().max(254).pipe(z.email()),
    phone: requiredText(32),
    password: z.string().min(1).max(1024),
    firstName: requiredText(100),
    lastName: requiredText(100),
  })
  .strict();

/** API_SPEC §64–65: profile and onboarding share the rider information fields. */
export const updateRiderProfileRequestSchema = z
  .object({
    firstName: requiredText(100),
    lastName: requiredText(100),
    profileImageUrl: httpsUrlSchema.nullable(),
    vehicleType: vehicleTypeSchema,
    vehicleNumber: requiredText(30),
  })
  .partial()
  .strict();

export const riderDocumentTypeSchema = documentTypeSchema;

export const riderAvailabilityRequestSchema = z.object({ available: z.boolean() }).strict();

/** API_SPEC §69 */
export const riderLocationRequestSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    accuracyMeters: z.number().min(0).max(10_000).optional(),
  })
  .strict();

export const riderDocumentSchema = z.object({
  id: z.uuid(),
  documentType: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  rejectionReason: z.string().nullable(),
  uploadedAt: z.string(),
});

export const riderProfileSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  profileImageUrl: z.string().nullable(),
  vehicleType: z.string().nullable(),
  vehicleNumber: z.string().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  approvalStatus: riderApprovalStatusSchema,
});

export const riderOnboardingSchema = z.object({
  profile: riderProfileSchema,
  documents: z.array(riderDocumentSchema),
  submittedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  /** Sections still needed before submission. */
  missing: z.array(z.string()),
});

export const riderAvailabilitySchema = z.object({
  isOnline: z.boolean(),
  isAvailable: z.boolean(),
  /** ONLINE + AVAILABLE, ONLINE + BUSY, or OFFLINE (API_SPEC §68). */
  state: z.enum(['OFFLINE', 'AVAILABLE', 'BUSY']),
});

export const adminRiderListQuerySchema = pageQuerySchema.extend({
  approvalStatus: riderApprovalStatusSchema.optional(),
  online: z.enum(['true', 'false']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const adminRiderUpdateRequestSchema = z
  .object({ vehicleType: vehicleTypeSchema, vehicleNumber: requiredText(30) })
  .partial()
  .strict();

export type RiderRegisterRequest = z.infer<typeof riderRegisterRequestSchema>;
export type UpdateRiderProfileRequest = z.infer<typeof updateRiderProfileRequestSchema>;
export type RiderAvailabilityRequest = z.infer<typeof riderAvailabilityRequestSchema>;
export type RiderLocationRequest = z.infer<typeof riderLocationRequestSchema>;
export type RiderDocument = z.infer<typeof riderDocumentSchema>;
export type RiderProfile = z.infer<typeof riderProfileSchema>;
export type RiderOnboarding = z.infer<typeof riderOnboardingSchema>;
export type RiderAvailability = z.infer<typeof riderAvailabilitySchema>;
export type AdminRiderListQuery = z.infer<typeof adminRiderListQuerySchema>;
export type AdminRiderUpdateRequest = z.infer<typeof adminRiderUpdateRequestSchema>;
