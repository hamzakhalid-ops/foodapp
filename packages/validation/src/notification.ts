import { z } from 'zod';
import { cursorQuerySchema, requiredText } from './common';

export const NOTIFICATION_CATEGORIES = [
  'AUTHENTICATION',
  'SECURITY',
  'ORDER',
  'PAYMENT',
  'DELIVERY',
  'DISPATCH',
  'RESTAURANT',
  'RIDER',
  'EARNINGS',
  'SETTLEMENT',
  'PROMOTION',
  'REVIEW',
  'SUPPORT',
  'SYSTEM',
] as const;
export const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
/** Channels a user can switch (IN_APP is always recorded). */
export const PREFERENCE_CHANNELS = ['PUSH', 'SMS', 'EMAIL'] as const;

/** API_SPEC §90 */
export const notificationListQuerySchema = cursorQuerySchema.extend({
  read: z.enum(['true', 'false']).optional(),
  type: z.string().trim().max(60).optional(),
});

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  category: z.enum(NOTIFICATION_CATEGORIES),
  priority: z.enum(NOTIFICATION_PRIORITIES),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

const preferenceUpdateSchema = z
  .object({
    category: z.enum(NOTIFICATION_CATEGORIES),
    channel: z.enum(PREFERENCE_CHANNELS),
    enabled: z.boolean(),
  })
  .strict();

/** API_SPEC §91 */
export const updateNotificationPreferencesRequestSchema = z
  .object({ preferences: z.array(preferenceUpdateSchema).min(1).max(60) })
  .strict();

export const notificationPreferenceSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES),
  channel: z.enum(PREFERENCE_CHANNELS),
  enabled: z.boolean(),
  /** Mandatory categories cannot be disabled (NOTIFICATION_RULES §14). */
  mandatory: z.boolean(),
});

/** Push device registration (NOTIFICATION_RULES §20). */
export const registerDeviceRequestSchema = z
  .object({
    deviceId: requiredText(128),
    platform: z.enum(['IOS', 'ANDROID', 'WEB']),
    pushToken: requiredText(4096),
  })
  .strict();

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationView = z.infer<typeof notificationSchema>;
export type NotificationPreferenceUpdate = z.infer<typeof preferenceUpdateSchema>;
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>;
export type NotificationPreferenceView = z.infer<typeof notificationPreferenceSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
