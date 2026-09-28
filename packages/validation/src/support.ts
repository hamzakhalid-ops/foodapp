import { z } from 'zod';
import { cursorQuerySchema, optionalText, requiredText, uuidSchema } from './common';

export const SUPPORT_TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_INTERNAL',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;
export const SUPPORT_TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

/** SUPPORT_RULES §5 — categories per requester type. */
export const SUPPORT_CATEGORIES = {
  CUSTOMER: [
    'ORDER_PROBLEM',
    'PAYMENT_PROBLEM',
    'REFUND_PROBLEM',
    'DELIVERY_PROBLEM',
    'RESTAURANT_PROBLEM',
    'RIDER_PROBLEM',
    'PROMOTION_PROBLEM',
    'ACCOUNT_PROBLEM',
    'APP_PROBLEM',
    'ABUSE_REPORT',
    'SAFETY_REPORT',
    'OTHER',
  ],
  RESTAURANT: [
    'ORDER_PROBLEM',
    'CUSTOMER_PROBLEM',
    'RIDER_PROBLEM',
    'PAYMENT_PROBLEM',
    'SETTLEMENT_PROBLEM',
    'MENU_PROBLEM',
    'RESTAURANT_ACCOUNT_PROBLEM',
    'PROMOTION_PROBLEM',
    'APP_PROBLEM',
    'ABUSE_REPORT',
    'SAFETY_REPORT',
    'OTHER',
  ],
  RIDER: [
    'DELIVERY_PROBLEM',
    'ORDER_PROBLEM',
    'RESTAURANT_PROBLEM',
    'CUSTOMER_PROBLEM',
    'PAYMENT_PROBLEM',
    'EARNINGS_PROBLEM',
    'ACCOUNT_PROBLEM',
    'APP_PROBLEM',
    'ABUSE_REPORT',
    'SAFETY_REPORT',
    'OTHER',
  ],
  OPERATIONS: [
    'ORDER_OPERATIONS',
    'PAYMENT_OPERATIONS',
    'REFUND_OPERATIONS',
    'DELIVERY_OPERATIONS',
    'RESTAURANT_OPERATIONS',
    'RIDER_OPERATIONS',
    'CUSTOMER_OPERATIONS',
    'RISK_AND_ABUSE',
    'ACCOUNT_SECURITY',
    'TECHNICAL_PROBLEM',
    'FINANCIAL_OPERATIONS',
    'OTHER',
  ],
} as const;

const categoryCode = z
  .string()
  .trim()
  .regex(/^[A-Z_]{2,40}$/, 'Unknown category');
const MESSAGE_MAX = 4000;

/** API_SPEC §92 — the category is checked against the requester type by the backend. */
export const createSupportTicketRequestSchema = z
  .object({
    subject: requiredText(200),
    category: categoryCode,
    /** Requesters may choose LOW–HIGH; URGENT is set by the backend (SUPPORT_RULES §6). */
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
    message: requiredText(MESSAGE_MAX),
    orderId: uuidSchema.optional(),
  })
  .strict();

/** JSON or multipart (`message` field + optional `file`). */
export const supportMessageRequestSchema = z
  .object({ message: requiredText(MESSAGE_MAX) })
  .strict();

export const adminSupportMessageRequestSchema = z
  .object({
    message: requiredText(MESSAGE_MAX),
    /** Internal notes are never shown to the requester (SUPPORT_RULES §17). */
    internal: z.boolean().default(false),
  })
  .strict();

export const adminUpdateSupportTicketRequestSchema = z
  .object({
    status: z.enum([
      'IN_PROGRESS',
      'WAITING_FOR_CUSTOMER',
      'WAITING_FOR_INTERNAL',
      'CLOSED',
      'REOPENED',
    ]),
    priority: z.enum(SUPPORT_TICKET_PRIORITIES),
    category: categoryCode,
    reason: optionalText(500),
  })
  .partial()
  .strict();

export const assignSupportTicketRequestSchema = z.object({ assigneeId: uuidSchema }).strict();
export const resolveSupportTicketRequestSchema = z
  .object({ message: optionalText(MESSAGE_MAX) })
  .strict();

export const supportTicketListQuerySchema = cursorQuerySchema.extend({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
});
export const adminSupportTicketListQuerySchema = supportTicketListQuerySchema.extend({
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
  category: categoryCode.optional(),
  assignedTo: uuidSchema.optional(),
  unassigned: z.enum(['true', 'false']).optional(),
});

export const supportMessageSchema = z.object({
  id: z.uuid(),
  senderUserId: z.uuid(),
  fromSupport: z.boolean(),
  message: z.string(),
  internal: z.boolean(),
  /** Short-lived signed URLs. */
  attachments: z.array(z.object({ url: z.string(), contentType: z.string() })),
  createdAt: z.string(),
});

export const supportTicketSchema = z.object({
  id: z.uuid(),
  ticketNumber: z.string(),
  subject: z.string(),
  category: z.string(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
  status: z.enum(SUPPORT_TICKET_STATUSES),
  orderId: z.uuid().nullable(),
  restaurantId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const supportTicketDetailSchema = supportTicketSchema.extend({
  messages: z.array(supportMessageSchema),
});

export type CreateSupportTicketRequest = z.infer<typeof createSupportTicketRequestSchema>;
export type SupportMessageRequest = z.infer<typeof supportMessageRequestSchema>;
export type AdminSupportMessageRequest = z.infer<typeof adminSupportMessageRequestSchema>;
/** What a client sends: fields with server defaults may be omitted (`z.input`). */
export type CreateSupportTicketInput = z.input<typeof createSupportTicketRequestSchema>;
export type AdminSupportMessageInput = z.input<typeof adminSupportMessageRequestSchema>;
export type AdminUpdateSupportTicketRequest = z.infer<typeof adminUpdateSupportTicketRequestSchema>;
export type AssignSupportTicketRequest = z.infer<typeof assignSupportTicketRequestSchema>;
export type ResolveSupportTicketRequest = z.infer<typeof resolveSupportTicketRequestSchema>;
export type SupportTicketListQuery = z.infer<typeof supportTicketListQuerySchema>;
export type AdminSupportTicketListQuery = z.infer<typeof adminSupportTicketListQuerySchema>;
export type SupportMessage = z.infer<typeof supportMessageSchema>;
export type SupportTicket = z.infer<typeof supportTicketSchema>;
export type SupportTicketDetail = z.infer<typeof supportTicketDetailSchema>;
