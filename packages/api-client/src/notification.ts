import {
  type NotificationListQuery,
  type NotificationPreferenceUpdate,
  type NotificationPreferenceView,
  notificationPreferenceSchema,
  notificationSchema,
  type NotificationView,
  type RegisterDeviceRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/**
 * Notifications for every app (docs/api/API_SPEC.md §90–91). Realtime events arrive over
 * Socket.IO at `/realtime`; see docs/api/API_IMPLEMENTATION_NOTES.md (Slice 12).
 */
export function createNotificationApi(client: ApiClient) {
  return {
    /** Cursor-paginated; `meta.unreadCount` carries the unread total. */
    list: (query: Partial<NotificationListQuery> = {}): Promise<ApiResult<NotificationView[]>> =>
      client.request({
        method: 'GET',
        path: '/notifications',
        schema: z.array(notificationSchema),
        query,
      }),
    get: async (notificationId: string): Promise<NotificationView> =>
      (
        await client.request({
          method: 'GET',
          path: `/notifications/${id(notificationId)}`,
          schema: notificationSchema,
        })
      ).data,
    markRead: async (notificationId: string): Promise<NotificationView> =>
      (
        await client.request({
          method: 'POST',
          path: `/notifications/${id(notificationId)}/read`,
          schema: notificationSchema,
        })
      ).data,
    markAllRead: async (): Promise<{ updated: number }> =>
      (
        await client.request({
          method: 'POST',
          path: '/notifications/read-all',
          schema: z.object({ updated: z.number() }),
        })
      ).data,
    preferences: async (): Promise<NotificationPreferenceView[]> =>
      (
        await client.request({
          method: 'GET',
          path: '/notifications/preferences',
          schema: z.array(notificationPreferenceSchema),
        })
      ).data,
    updatePreferences: async (
      preferences: NotificationPreferenceUpdate[],
    ): Promise<NotificationPreferenceView[]> =>
      (
        await client.request({
          method: 'PATCH',
          path: '/notifications/preferences',
          body: { preferences },
          schema: z.array(notificationPreferenceSchema),
        })
      ).data,
    registerDevice: async (body: RegisterDeviceRequest): Promise<void> => {
      await client.request({
        method: 'PUT',
        path: '/notifications/devices',
        body,
        schema: z.null(),
      });
    },
    unregisterDevice: async (deviceId: string): Promise<void> => {
      await client.request({
        method: 'DELETE',
        path: `/notifications/devices/${id(deviceId)}`,
        schema: z.null(),
      });
    },
  };
}
