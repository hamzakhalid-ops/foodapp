import { z } from 'zod';
import { moneyAmountSchema } from './api';
import {
  httpsUrlSchema,
  latitudeSchema,
  longitudeSchema,
  optionalText,
  requiredText,
} from './common';

export const RESTAURANT_STATUSES = [
  'OFFLINE',
  'ONLINE',
  'TEMPORARILY_PAUSED',
  'CLOSED',
  'SUSPENDED',
] as const;
export const RESTAURANT_APPROVAL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RESUBMISSION_REQUIRED',
] as const;
export const restaurantStatusSchema = z.enum(RESTAURANT_STATUSES);
export const restaurantApprovalStatusSchema = z.enum(RESTAURANT_APPROVAL_STATUSES);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24h)');

/** API_SPEC §44 */
export const restaurantRegisterRequestSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  phone: requiredText(32),
  password: z.string().min(1).max(1024),
  ownerFirstName: requiredText(100),
  ownerLastName: requiredText(100),
});

/** API_SPEC §45 — Create Restaurant / Update Basic Information */
export const createRestaurantRequestSchema = z
  .object({
    name: requiredText(120),
    description: optionalText(1000),
    phone: optionalText(32),
    email: z.string().trim().max(254).pipe(z.email()).nullable().optional(),
    cuisineDescription: optionalText(255),
  })
  .strict();
export const updateBasicInformationRequestSchema = createRestaurantRequestSchema
  .extend({ logoUrl: httpsUrlSchema.nullable(), coverImageUrl: httpsUrlSchema.nullable() })
  .partial()
  .strict();

export const restaurantAddressRequestSchema = z
  .object({
    addressLine1: requiredText(255),
    addressLine2: optionalText(255),
    area: optionalText(120),
    city: requiredText(120),
    postalCode: optionalText(20),
  })
  .strict();

export const restaurantLocationRequestSchema = z
  .object({ latitude: latitudeSchema, longitude: longitudeSchema })
  .strict();

/** API_SPEC §48 — ISO day of week 1 (Monday) … 7 (Sunday), all seven days required. */
export const operatingHoursRequestSchema = z
  .object({
    hours: z
      .array(
        z
          .object({
            dayOfWeek: z.number().int().min(1).max(7),
            opensAt: hhmm.nullable().optional(),
            closesAt: hhmm.nullable().optional(),
            isClosed: z.boolean(),
          })
          .strict()
          .refine(
            (day) => day.isClosed || (day.opensAt && day.closesAt && day.opensAt < day.closesAt),
            'Open days need opensAt earlier than closesAt',
          ),
      )
      .length(7)
      .refine(
        (days) => new Set(days.map((day) => day.dayOfWeek)).size === 7,
        'Each day must appear once',
      ),
  })
  .strict();

export const deliverySettingsRequestSchema = z
  .object({
    deliveryEnabled: z.boolean(),
    minimumOrderAmount: moneyAmountSchema.refine(
      (value) => !value.startsWith('-'),
      'Must not be negative',
    ),
    estimatedPreparationMinutes: z.number().int().min(1).max(240),
    /** Kilometres. */
    deliveryRadius: z.number().positive().max(100),
  })
  .strict();

/** Business information for admin review (stored as submitted; DATABASE.md §5.4). */
export const businessInformationRequestSchema = z
  .object({
    legalName: requiredText(200),
    registrationNumber: optionalText(100),
    taxNumber: optionalText(100),
  })
  .strict();

export const paymentAccountRequestSchema = z
  .object({
    provider: requiredText(60),
    /** Provider token/reference — never raw card or bank credentials (DATABASE.md §15). */
    accountReference: requiredText(120),
    accountHolderName: requiredText(120),
  })
  .strict();

export const documentTypeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,49}$/, 'Use an upper-case document type, e.g. BUSINESS_LICENSE');

export const pauseRequestSchema = z
  .object({
    durationMinutes: z.number().int().min(1).max(240),
    reason: optionalText(255),
  })
  .strict();

export const addStaffRequestSchema = z
  .object({ email: z.string().trim().max(254).pipe(z.email()), role: z.literal('OPERATOR') })
  .strict();
export const updateStaffRequestSchema = z
  .object({ status: z.enum(['ACTIVE', 'INACTIVE']) })
  .strict();

export const restaurantProfileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  cuisineDescription: z.string().nullable(),
  status: restaurantStatusSchema,
  approvalStatus: restaurantApprovalStatusSchema,
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  area: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const operatingHoursSchema = z.array(
  z.object({
    dayOfWeek: z.number(),
    opensAt: z.string().nullable(),
    closesAt: z.string().nullable(),
    isClosed: z.boolean(),
  }),
);

export const deliverySettingsSchema = z.object({
  deliveryEnabled: z.boolean(),
  minimumOrderAmount: z.string(),
  estimatedPreparationMinutes: z.number(),
  deliveryRadius: z.number(),
});

export const restaurantDocumentSchema = z.object({
  id: z.uuid(),
  documentType: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
});

export const paymentAccountSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  accountReferenceMasked: z.string(),
  accountHolderName: z.string(),
});

export const onboardingSchema = z.object({
  restaurant: restaurantProfileSchema,
  application: z.object({
    status: restaurantApprovalStatusSchema,
    submittedAt: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    rejectionReason: z.string().nullable(),
    resubmissionNotes: z.string().nullable(),
  }),
  operatingHours: operatingHoursSchema,
  deliverySettings: deliverySettingsSchema.nullable(),
  businessInformation: businessInformationRequestSchema.nullable(),
  documents: z.array(restaurantDocumentSchema),
  paymentAccount: paymentAccountSchema.nullable(),
  /** Sections still required before submission. */
  missing: z.array(z.string()),
});

export const availabilitySchema = z.object({
  status: restaurantStatusSchema,
  pausedUntil: z.string().nullable(),
  isOrderableNow: z.boolean(),
});

export const staffMemberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string().nullable(),
  role: z.enum(['OWNER', 'OPERATOR']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string(),
});

export type RestaurantRegisterRequest = z.infer<typeof restaurantRegisterRequestSchema>;
export type CreateRestaurantRequest = z.infer<typeof createRestaurantRequestSchema>;
export type UpdateBasicInformationRequest = z.infer<typeof updateBasicInformationRequestSchema>;
export type RestaurantAddressRequest = z.infer<typeof restaurantAddressRequestSchema>;
export type RestaurantLocationRequest = z.infer<typeof restaurantLocationRequestSchema>;
export type OperatingHoursRequest = z.infer<typeof operatingHoursRequestSchema>;
export type DeliverySettingsRequest = z.infer<typeof deliverySettingsRequestSchema>;
export type BusinessInformationRequest = z.infer<typeof businessInformationRequestSchema>;
export type PaymentAccountRequest = z.infer<typeof paymentAccountRequestSchema>;
export type PauseRequest = z.infer<typeof pauseRequestSchema>;
export type AddStaffRequest = z.infer<typeof addStaffRequestSchema>;
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>;
export type RestaurantProfile = z.infer<typeof restaurantProfileSchema>;
export type OperatingHours = z.infer<typeof operatingHoursSchema>;
export type DeliverySettings = z.infer<typeof deliverySettingsSchema>;
export type RestaurantDocument = z.infer<typeof restaurantDocumentSchema>;
export type PaymentAccount = z.infer<typeof paymentAccountSchema>;
export type Onboarding = z.infer<typeof onboardingSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const adminRestaurantListQuerySchema = z.object({
  approvalStatus: restaurantApprovalStatusSchema.optional(),
  status: restaurantStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminRestaurantStatusRequestSchema = z
  .object({ status: z.enum(['SUSPENDED', 'OFFLINE', 'CLOSED']), reason: requiredText(500) })
  .strict();

export type AdminRestaurantListQuery = z.infer<typeof adminRestaurantListQuerySchema>;
export type AdminRestaurantStatusRequest = z.infer<typeof adminRestaurantStatusRequestSchema>;
