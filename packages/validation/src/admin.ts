import { z } from 'zod';
import { cursorQuerySchema, requiredText, uuidSchema } from './common';
import { customerOrderListQuerySchema } from './order';
import { paymentStatusSchema, roleSchema, userStatusSchema } from './vocabulary';

const instant = z.iso.datetime({ offset: true });

// ------------------------------------------------------------------ orders (API_SPEC §100)

export const adminOrderListQuerySchema = customerOrderListQuerySchema.and(
  z.object({
    customerId: uuidSchema.optional(),
    restaurantId: uuidSchema.optional(),
    riderId: uuidSchema.optional(),
    paymentStatus: paymentStatusSchema.optional(),
    search: z.string().trim().min(1).max(40).optional(),
  }),
);

// ------------------------------------------------------------------ customers (API_SPEC §95)

export const adminCustomerListQuerySchema = cursorQuerySchema.extend({
  status: userStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const adminCustomerSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  createdAt: z.string(),
});

export const adminCustomerDetailSchema = adminCustomerSchema.extend({
  roles: z.array(roleSchema),
  lastLoginAt: z.string().nullable(),
  orderCount: z.number().int(),
  deliveredOrderCount: z.number().int(),
  activeRiskRestrictions: z.array(z.object({ id: z.uuid(), restrictionType: z.string() })),
});

/** ADMIN_SPEC §7 restrict: reason plus optional expiry of the ACCOUNT_RESTRICTED restriction. */
export const restrictCustomerRequestSchema = z
  .object({ reason: requiredText(500), expiresAt: instant.optional() })
  .strict()
  .refine((value) => !value.expiresAt || new Date(value.expiresAt) > new Date(), {
    message: 'expiresAt must be in the future',
    path: ['expiresAt'],
  });

// ------------------------------------------------------------------ configuration (API_SPEC §107)

export const configurationEntrySchema = z.object({
  key: z.string(),
  description: z.string(),
  value: z.unknown().nullable(),
  updatedAt: z.string().nullable(),
  updatedBy: z.uuid().nullable(),
});

export const updateConfigurationRequestSchema = z
  .object({ value: z.union([z.string(), z.number()]), reason: requiredText(500) })
  .strict();

/** Dedicated dispatch configuration (DISPATCH_RULES §23; API_SPEC §107 "dedicated tables"). */
export const dispatchSettingsSchema = z.object({
  initialRadius: z.number().positive().max(100),
  radiusIncrement: z.number().positive().max(100),
  maximumRadius: z.number().positive().max(100),
  offerTimeoutSeconds: z.number().int().min(5).max(600),
  maxOfferAttempts: z.number().int().min(1).max(50),
  locationMaxAgeSeconds: z.number().int().min(10).max(3600),
});

export const updateDispatchSettingsRequestSchema = dispatchSettingsSchema
  .extend({ reason: requiredText(500) })
  .strict()
  .refine((value) => value.initialRadius <= value.maximumRadius, {
    message: 'initialRadius must not exceed maximumRadius',
    path: ['initialRadius'],
  });

// ------------------------------------------------------------------ audit logs (API_SPEC §108)

export const auditLogListQuerySchema = cursorQuerySchema
  .extend({
    actorUserId: uuidSchema.optional(),
    action: z.string().trim().max(80).optional(),
    entityType: z.string().trim().max(80).optional(),
    entityId: uuidSchema.optional(),
    from: instant.optional(),
    to: instant.optional(),
  })
  .refine((query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to), {
    message: 'from must not be after to',
    path: ['from'],
  });

export const auditLogSchema = z.object({
  id: z.uuid(),
  actorUserId: z.uuid().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  oldValues: z.unknown().nullable(),
  newValues: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});

// ------------------------------------------------------------------ dashboard (API_SPEC §94)

export const adminDashboardSchema = z.object({
  generatedAt: z.string(),
  currency: z.string(),
  customers: z.object({ total: z.number().int() }),
  restaurants: z.object({ online: z.number().int(), pendingApplications: z.number().int() }),
  riders: z.object({
    active: z.number().int(),
    online: z.number().int(),
    pendingApplications: z.number().int(),
  }),
  orders: z.object({
    today: z.number().int(),
    active: z.number().int(),
    deliveredToday: z.number().int(),
    cancelledToday: z.number().int(),
  }),
  deliveries: z.object({ active: z.number().int() }),
  revenue: z.object({
    grossOrderValueToday: z.string(),
    commissionToday: z.string(),
    refundedToday: z.string(),
  }),
  risk: z.object({ openFlags: z.number().int(), activeRestrictions: z.number().int() }),
  support: z.object({ openTickets: z.number().int(), urgentOpenTickets: z.number().int() }),
  settlements: z.object({ awaitingApproval: z.number().int(), failed: z.number().int() }),
});

export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
export type AdminCustomerListQuery = z.infer<typeof adminCustomerListQuerySchema>;
export type AdminCustomer = z.infer<typeof adminCustomerSchema>;
export type AdminCustomerDetail = z.infer<typeof adminCustomerDetailSchema>;
export type RestrictCustomerRequest = z.infer<typeof restrictCustomerRequestSchema>;
export type ConfigurationEntry = z.infer<typeof configurationEntrySchema>;
export type UpdateConfigurationRequest = z.infer<typeof updateConfigurationRequestSchema>;
export type DispatchSettings = z.infer<typeof dispatchSettingsSchema>;
export type UpdateDispatchSettingsRequest = z.infer<typeof updateDispatchSettingsRequestSchema>;
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
