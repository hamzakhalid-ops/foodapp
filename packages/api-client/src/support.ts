import {
  type AdminSupportMessageRequest,
  type AdminSupportTicketListQuery,
  type AdminUpdateSupportTicketRequest,
  type CreateSupportTicketRequest,
  type SupportTicket,
  type SupportTicketDetail,
  supportTicketDetailSchema,
  type SupportTicketListQuery,
  supportTicketSchema,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/**
 * Support for customers, restaurant staff and riders (docs/api/API_SPEC.md §92). Messages with an
 * attachment are multipart (`message` + `file`) and sent with `fetch` directly.
 */
export function createSupportApi(client: ApiClient) {
  return {
    create: async (body: CreateSupportTicketRequest): Promise<SupportTicketDetail> =>
      (
        await client.request({
          method: 'POST',
          path: '/support/tickets',
          body,
          schema: supportTicketDetailSchema,
        })
      ).data,
    list: (query: Partial<SupportTicketListQuery> = {}): Promise<ApiResult<SupportTicket[]>> =>
      client.request({
        method: 'GET',
        path: '/support/tickets',
        schema: z.array(supportTicketSchema),
        query,
      }),
    get: async (ticketId: string): Promise<SupportTicketDetail> =>
      (
        await client.request({
          method: 'GET',
          path: `/support/tickets/${id(ticketId)}`,
          schema: supportTicketDetailSchema,
        })
      ).data,
    sendMessage: async (ticketId: string, message: string): Promise<SupportTicketDetail> =>
      (
        await client.request({
          method: 'POST',
          path: `/support/tickets/${id(ticketId)}/messages`,
          body: { message },
          schema: supportTicketDetailSchema,
        })
      ).data,
    close: async (ticketId: string): Promise<SupportTicketDetail> =>
      (
        await client.request({
          method: 'POST',
          path: `/support/tickets/${id(ticketId)}/close`,
          schema: supportTicketDetailSchema,
        })
      ).data,
  };
}

const adminDetailSchema = supportTicketDetailSchema.extend({
  assignedTo: z.uuid().nullable(),
  createdByUserId: z.uuid(),
});

/** Admin support queue (docs/api/API_SPEC.md §106). */
export function createAdminSupportApi(client: ApiClient) {
  const base = '/admin/support/tickets';
  return {
    list: (query: Partial<AdminSupportTicketListQuery> = {}): Promise<ApiResult<SupportTicket[]>> =>
      client.request({ method: 'GET', path: base, schema: z.array(supportTicketSchema), query }),
    get: async (ticketId: string) =>
      (
        await client.request({
          method: 'GET',
          path: `${base}/${id(ticketId)}`,
          schema: adminDetailSchema,
        })
      ).data,
    update: async (ticketId: string, body: AdminUpdateSupportTicketRequest) =>
      (
        await client.request({
          method: 'PATCH',
          path: `${base}/${id(ticketId)}`,
          body,
          schema: adminDetailSchema,
        })
      ).data,
    assign: async (ticketId: string, assigneeId: string) =>
      (
        await client.request({
          method: 'POST',
          path: `${base}/${id(ticketId)}/assign`,
          body: { assigneeId },
          schema: adminDetailSchema,
        })
      ).data,
    resolve: async (ticketId: string, message?: string) =>
      (
        await client.request({
          method: 'POST',
          path: `${base}/${id(ticketId)}/resolve`,
          body: message ? { message } : {},
          schema: adminDetailSchema,
        })
      ).data,
    sendMessage: async (ticketId: string, body: AdminSupportMessageRequest) =>
      (
        await client.request({
          method: 'POST',
          path: `${base}/${id(ticketId)}/messages`,
          body,
          schema: adminDetailSchema,
        })
      ).data,
  };
}
