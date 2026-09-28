import {
  type AdminCustomer,
  type AdminCustomerDetail,
  adminCustomerDetailSchema,
  type AdminCustomerListQuery,
  adminCustomerSchema,
  type AdminDashboard,
  adminDashboardSchema,
  type AdminOrderListQuery,
  type AuditLog,
  type AuditLogListQuery,
  auditLogSchema,
  type ConfigurationEntry,
  configurationEntrySchema,
  type DispatchSettings,
  dispatchSettingsSchema,
  type MfaSetup,
  mfaSetupSchema,
  type MfaStatus,
  mfaStatusSchema,
  type Order,
  orderSchema,
  type OrderSummary,
  orderSummarySchema,
  type UpdateConfigurationRequest,
  type UpdateDispatchSettingsRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/**
 * Admin TOTP MFA (AUTH_AUTHORIZATION §34–38). Admin routes answer `403 AUTH_MFA_REQUIRED`
 * until `verify` succeeds on the session; `details.reason = STEP_UP_REQUIRED` asks for a fresh code.
 */
export function createMfaApi(client: ApiClient) {
  return {
    status: async (): Promise<MfaStatus> =>
      (await client.request({ method: 'GET', path: '/auth/mfa', schema: mfaStatusSchema })).data,
    setup: async (): Promise<MfaSetup> =>
      (
        await client.request({
          method: 'POST',
          path: '/auth/mfa/totp/setup',
          schema: mfaSetupSchema,
        })
      ).data,
    confirm: async (code: string): Promise<MfaStatus> =>
      (
        await client.request({
          method: 'POST',
          path: '/auth/mfa/totp/confirm',
          body: { code },
          schema: mfaStatusSchema,
        })
      ).data,
    verify: async (code: string): Promise<MfaStatus> =>
      (
        await client.request({
          method: 'POST',
          path: '/auth/mfa/verify',
          body: { code },
          schema: mfaStatusSchema,
        })
      ).data,
  };
}

/** Admin operations (API_SPEC §94–95, §100, §107–108). */
export function createAdminApi(client: ApiClient) {
  return {
    dashboard: async (): Promise<AdminDashboard> =>
      (
        await client.request({
          method: 'GET',
          path: '/admin/dashboard',
          schema: adminDashboardSchema,
        })
      ).data,
    customers: (query: Partial<AdminCustomerListQuery> = {}): Promise<ApiResult<AdminCustomer[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/customers',
        schema: z.array(adminCustomerSchema),
        query,
      }),
    customer: async (customerId: string): Promise<AdminCustomerDetail> =>
      (
        await client.request({
          method: 'GET',
          path: `/admin/customers/${id(customerId)}`,
          schema: adminCustomerDetailSchema,
        })
      ).data,
    orders: (query: Partial<AdminOrderListQuery> = {}): Promise<ApiResult<OrderSummary[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/orders',
        schema: z.array(orderSummarySchema),
        query,
      }),
    order: async (orderId: string): Promise<Order> =>
      (
        await client.request({
          method: 'GET',
          path: `/admin/orders/${id(orderId)}`,
          schema: orderSchema,
        })
      ).data,
    auditLogs: (query: Partial<AuditLogListQuery> = {}): Promise<ApiResult<AuditLog[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/audit-logs',
        schema: z.array(auditLogSchema),
        query,
      }),
    auditLog: async (auditLogId: string): Promise<AuditLog> =>
      (
        await client.request({
          method: 'GET',
          path: `/admin/audit-logs/${id(auditLogId)}`,
          schema: auditLogSchema,
        })
      ).data,
    configuration: async (): Promise<ConfigurationEntry[]> =>
      (
        await client.request({
          method: 'GET',
          path: '/admin/configuration',
          schema: z.array(configurationEntrySchema),
        })
      ).data,
    /** SUPER_ADMIN with a recent MFA verification. */
    updateConfiguration: async (
      key: string,
      body: UpdateConfigurationRequest,
    ): Promise<ConfigurationEntry> =>
      (
        await client.request({
          method: 'PATCH',
          path: `/admin/configuration/${id(key)}`,
          body,
          schema: configurationEntrySchema,
        })
      ).data,
    dispatchSettings: async (): Promise<DispatchSettings> =>
      (
        await client.request({
          method: 'GET',
          path: '/admin/dispatch-settings',
          schema: dispatchSettingsSchema,
        })
      ).data,
    /** SUPER_ADMIN with a recent MFA verification. */
    updateDispatchSettings: async (
      body: UpdateDispatchSettingsRequest,
    ): Promise<DispatchSettings> =>
      (
        await client.request({
          method: 'PUT',
          path: '/admin/dispatch-settings',
          body,
          schema: dispatchSettingsSchema,
        })
      ).data,
    /** SUPER_ADMIN: remove a user's authenticator (lost device). */
    resetMfa: async (userId: string): Promise<void> => {
      await client.request({
        method: 'POST',
        path: `/admin/users/${id(userId)}/mfa/reset`,
        schema: z.null(),
      });
    },
  };
}
