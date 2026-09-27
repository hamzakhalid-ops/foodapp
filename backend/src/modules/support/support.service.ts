import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type AdminSupportTicketListQuery,
  type AdminUpdateSupportTicketRequest,
  type CreateSupportTicketRequest,
  SUPPORT_CATEGORIES,
  type SupportMessage as SupportMessageView,
  type SupportTicket as SupportTicketView,
  type SupportTicketDetail,
  type SupportTicketListQuery,
} from '@quickbite/validation';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { conflict, notFound, validationError } from '../../common/http/errors';
import { decodeCursor, encodeCursor } from '../../common/http/pagination';
import { type RequestMeta } from '../../common/http/request-meta';
import { OutboxService } from '../../common/outbox/outbox.service';
import { AppConfigService } from '../../config/app-config.service';
import {
  type Prisma,
  type Role,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  detectDocumentType,
  type UploadedFile,
} from '../../infrastructure/storage/file-validation';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;
type RequesterType = 'CUSTOMER' | 'RESTAURANT' | 'RIDER';

interface Requester {
  type: RequesterType;
  userId: string;
  role: Role;
  restaurantId: string | null;
}

// A type alias (not an interface) so it is assignable to Prisma JSON input.
type Attachment = { key: string; contentType: string };

/** SUPPORT_RULES §8. */
const TRANSITIONS: Record<SupportTicketStatus, readonly SupportTicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL', 'RESOLVED'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  WAITING_FOR_INTERNAL: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL', 'RESOLVED'],
};

const ADMIN_ROLES = new Set<Role>(['ADMIN', 'SUPER_ADMIN']);

/**
 * Support tickets (SUPPORT_RULES, API_SPEC §92, §106). Requesters see only their own tickets
 * (restaurant tickets: the restaurant's active staff); internal notes never leave the admin side;
 * attachments are private and served through signed URLs.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ---------------------------------------------------------------- requester side

  async create(auth: AuthContext, input: CreateSupportTicketRequest): Promise<SupportTicketDetail> {
    const requester = await this.requester(auth);
    const allowed: readonly string[] = SUPPORT_CATEGORIES[requester.type];
    if (!allowed.includes(input.category)) {
      throw validationError({ category: `Use one of: ${allowed.join(', ')}` });
    }
    if (input.orderId) await this.assertOrderAccess(requester, input.orderId);
    const ticketId = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          createdByUserId: auth.userId,
          requesterRole: requester.role,
          restaurantId: requester.restaurantId,
          orderId: input.orderId ?? null,
          subject: input.subject,
          category: input.category,
          // Safety reports are always urgent; requesters cannot pick URGENT (SUPPORT_RULES §6).
          priority: input.category === 'SAFETY_REPORT' ? 'URGENT' : input.priority,
          messages: { create: { senderUserId: auth.userId, message: input.message } },
        },
      });
      await this.event(tx, 'support.ticket_created', ticket);
      return ticket.id;
    });
    return this.detail(ticketId, false);
  }

  async list(auth: AuthContext, query: SupportTicketListQuery) {
    const requester = await this.requester(auth);
    return this.page(
      { ...this.scope(requester), ...(query.status ? { status: query.status } : {}) },
      query,
    );
  }

  async get(auth: AuthContext, ticketId: string): Promise<SupportTicketDetail> {
    await this.findVisible(auth, ticketId);
    return this.detail(ticketId, false);
  }

  /** Requester message: reopens a resolved ticket and answers a pending request (§7–8). */
  async requesterMessage(
    auth: AuthContext,
    ticketId: string,
    message: string,
    file: UploadedFile | undefined,
  ): Promise<SupportTicketDetail> {
    const ticket = await this.findVisible(auth, ticketId);
    if (ticket.status === 'CLOSED') {
      throw conflict('INVALID_REQUEST', 'This ticket is closed. Please open a new ticket.');
    }
    const attachments = await this.store(ticketId, file);
    await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          ticketId,
          senderUserId: auth.userId,
          message,
          ...(attachments ? { attachments } : {}),
        },
      });
      const next: SupportTicketStatus | null =
        ticket.status === 'RESOLVED'
          ? 'REOPENED'
          : ticket.status === 'WAITING_FOR_CUSTOMER'
            ? 'IN_PROGRESS'
            : null;
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: next
          ? { status: next, ...(next === 'REOPENED' ? { resolvedAt: null } : {}) }
          : { updatedAt: new Date() },
      });
      await this.event(tx, 'support.message_created', updated, {
        internal: false,
        fromSupport: false,
      });
    });
    return this.detail(ticketId, false);
  }

  async close(auth: AuthContext, ticketId: string): Promise<SupportTicketDetail> {
    const ticket = await this.findVisible(auth, ticketId);
    await this.prisma.$transaction((tx) => this.transition(tx, ticket, 'CLOSED'));
    return this.detail(ticketId, false);
  }

  // ---------------------------------------------------------------- admin side

  adminList(query: AdminSupportTicketListQuery) {
    return this.page(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
        ...(query.unassigned === 'true' ? { assignedTo: null } : {}),
      },
      query,
    );
  }

  async adminGet(
    ticketId: string,
  ): Promise<SupportTicketDetail & { assignedTo: string | null; createdByUserId: string }> {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw notFound('SUPPORT_TICKET_NOT_FOUND');
    return {
      ...(await this.detail(ticketId, true)),
      assignedTo: ticket.assignedTo,
      createdByUserId: ticket.createdByUserId,
    };
  }

  async assign(ticketId: string, assigneeId: string, adminId: string, meta: RequestMeta) {
    const assignee = await this.prisma.userRole.findFirst({
      where: { userId: assigneeId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    });
    if (!assignee) throw validationError({ assigneeId: 'The assignee must be an administrator.' });
    await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lock(tx, ticketId);
      await tx.supportTicket.update({ where: { id: ticketId }, data: { assignedTo: assigneeId } });
      if (ticket.status === 'OPEN' || ticket.status === 'REOPENED')
        await this.transition(tx, ticket, 'IN_PROGRESS');
      await this.auditAction(tx, AUDIT_ACTIONS.SUPPORT_TICKET_ASSIGNED, ticket, adminId, meta, {
        previous: ticket.assignedTo,
        assignedTo: assigneeId,
      });
    });
    return this.adminGet(ticketId);
  }

  async adminMessage(
    ticketId: string,
    adminId: string,
    message: string,
    internal: boolean,
    file: UploadedFile | undefined,
    meta: RequestMeta,
  ) {
    const attachments = await this.store(ticketId, file);
    await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lock(tx, ticketId);
      await tx.supportMessage.create({
        data: {
          ticketId,
          senderUserId: adminId,
          message,
          isInternal: internal,
          ...(attachments ? { attachments } : {}),
        },
      });
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data:
          internal || ticket.firstResponseAt
            ? { updatedAt: new Date() }
            : { firstResponseAt: new Date() },
      });
      if (internal) {
        await this.auditAction(
          tx,
          AUDIT_ACTIONS.SUPPORT_INTERNAL_NOTE_ADDED,
          ticket,
          adminId,
          meta,
          {},
        );
      }
      await this.event(tx, 'support.message_created', updated, { internal, fromSupport: true });
    });
    return this.adminGet(ticketId);
  }

  async resolve(
    ticketId: string,
    adminId: string,
    message: string | null | undefined,
    meta: RequestMeta,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lock(tx, ticketId);
      if (message) {
        await tx.supportMessage.create({ data: { ticketId, senderUserId: adminId, message } });
      }
      await this.transition(tx, ticket, 'RESOLVED');
      await this.auditAction(tx, AUDIT_ACTIONS.SUPPORT_TICKET_RESOLVED, ticket, adminId, meta, {});
    });
    return this.adminGet(ticketId);
  }

  /** Priority/category corrections and status moves by support staff (SUPPORT_RULES §3, §8). */
  async adminUpdate(
    ticketId: string,
    input: AdminUpdateSupportTicketRequest,
    adminId: string,
    meta: RequestMeta,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lock(tx, ticketId);
      if (input.category) {
        const known = new Set<string>(Object.values(SUPPORT_CATEGORIES).flat());
        if (!known.has(input.category)) throw validationError({ category: 'Unknown category' });
      }
      if (input.priority || input.category) {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: {
            ...(input.priority ? { priority: input.priority } : {}),
            ...(input.category ? { category: input.category } : {}),
          },
        });
      }
      if (input.status && input.status !== ticket.status)
        await this.transition(tx, ticket, input.status);
      await this.auditAction(tx, AUDIT_ACTIONS.SUPPORT_TICKET_UPDATED, ticket, adminId, meta, {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      });
    });
    return this.adminGet(ticketId);
  }

  // ---------------------------------------------------------------- helpers

  /** Used by realtime subscriptions to `support_ticket:{id}` (SUPPORT_RULES §24). */
  async canView(auth: AuthContext, ticketId: string): Promise<boolean> {
    if (auth.roles.some((role) => ADMIN_ROLES.has(role))) return true;
    try {
      await this.findVisible(auth, ticketId);
      return true;
    } catch {
      return false;
    }
  }

  private async transition(tx: Tx, ticket: SupportTicket, to: SupportTicketStatus): Promise<void> {
    if (!TRANSITIONS[ticket.status].includes(to)) {
      throw conflict('INVALID_REQUEST', `The ticket cannot move from ${ticket.status} to ${to}.`);
    }
    const now = new Date();
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: to,
        ...(to === 'RESOLVED' ? { resolvedAt: now } : {}),
        ...(to === 'CLOSED' ? { closedAt: now } : {}),
        ...(to === 'REOPENED' ? { resolvedAt: null, closedAt: null } : {}),
      },
    });
    await this.event(tx, 'support.ticket_status_changed', updated, { fromStatus: ticket.status });
  }

  private async requester(auth: AuthContext): Promise<Requester> {
    if (auth.roles.includes('RESTAURANT_OWNER') || auth.roles.includes('RESTAURANT_OPERATOR')) {
      const membership = await this.prisma.restaurantStaff.findFirst({
        where: { userId: auth.userId, status: 'ACTIVE' },
      });
      if (!membership)
        throw notFound('RESTAURANT_NOT_FOUND', 'No restaurant is linked to this account.');
      return {
        type: 'RESTAURANT',
        userId: auth.userId,
        role: membership.role === 'OWNER' ? 'RESTAURANT_OWNER' : 'RESTAURANT_OPERATOR',
        restaurantId: membership.restaurantId,
      };
    }
    if (auth.roles.includes('RIDER'))
      return { type: 'RIDER', userId: auth.userId, role: 'RIDER', restaurantId: null };
    return { type: 'CUSTOMER', userId: auth.userId, role: 'CUSTOMER', restaurantId: null };
  }

  private scope(requester: Requester): Prisma.SupportTicketWhereInput {
    return requester.type === 'RESTAURANT'
      ? { restaurantId: requester.restaurantId }
      : { createdByUserId: requester.userId, restaurantId: null };
  }

  private async findVisible(auth: AuthContext, ticketId: string): Promise<SupportTicket> {
    const requester = await this.requester(auth);
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, ...this.scope(requester) },
    });
    if (!ticket) throw notFound('SUPPORT_TICKET_NOT_FOUND');
    return ticket;
  }

  /** Order references must be orders the requester may see (SUPPORT_RULES §10). */
  private async assertOrderAccess(requester: Requester, orderId: string): Promise<void> {
    const where: Prisma.OrderWhereInput =
      requester.type === 'CUSTOMER'
        ? { id: orderId, customerId: requester.userId }
        : requester.type === 'RESTAURANT'
          ? { id: orderId, restaurantId: requester.restaurantId ?? '' }
          : { id: orderId, delivery: { rider: { userId: requester.userId } } };
    if (!(await this.prisma.order.count({ where }))) throw notFound('ORDER_NOT_FOUND');
  }

  private async lock(tx: Tx, ticketId: string): Promise<SupportTicket> {
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${ticketId}::uuid FOR UPDATE`;
    const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw notFound('SUPPORT_TICKET_NOT_FOUND');
    return ticket;
  }

  /** Validates and stores an attachment before the database write (CLAUDE.md §9, §19). */
  private async store(
    ticketId: string,
    file: UploadedFile | undefined,
  ): Promise<Attachment[] | null> {
    if (!file) return null;
    const detected = detectDocumentType(file, this.config.get('STORAGE_MAX_UPLOAD_BYTES'));
    const key = `support/${ticketId}/${randomUUID()}.${detected.extension}`;
    await this.storage.putPrivate(key, file.buffer, detected.type);
    return [{ key, contentType: detected.type }];
  }

  private async detail(ticketId: string, includeInternal: boolean): Promise<SupportTicketDetail> {
    const ticket = await this.prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: {
        messages: {
          where: includeInternal ? {} : { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const messages: SupportMessageView[] = [];
    for (const message of ticket.messages)
      messages.push(await this.toMessage(message, ticket.createdByUserId));
    return { ...toTicket(ticket), messages };
  }

  private async toMessage(
    message: SupportMessage,
    requesterId: string,
  ): Promise<SupportMessageView> {
    const attachments = (message.attachments ?? []) as unknown as Attachment[];
    return {
      id: message.id,
      senderUserId: message.senderUserId,
      fromSupport: message.senderUserId !== requesterId,
      message: message.message,
      internal: message.isInternal,
      attachments: await Promise.all(
        attachments.map(async (attachment) => ({
          url: await this.storage.signedReadUrl(attachment.key),
          contentType: attachment.contentType,
        })),
      ),
      createdAt: message.createdAt.toISOString(),
    };
  }

  private async page(
    where: Prisma.SupportTicketWhereInput,
    query: { cursor?: string | undefined; limit: number },
  ) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.supportTicket.findMany({
      where: {
        AND: [where],
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      rows: page.map(toTicket),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  private async event(
    tx: Tx,
    eventType: string,
    ticket: SupportTicket,
    extra: Record<string, string | boolean> = {},
  ) {
    await this.outbox.enqueue(tx, {
      eventType,
      aggregateType: 'support_ticket',
      aggregateId: ticket.id,
      payload: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        requesterId: ticket.createdByUserId,
        restaurantId: ticket.restaurantId,
        status: ticket.status,
        priority: ticket.priority,
        ...extra,
      },
    });
  }

  private async auditAction(
    tx: Tx,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    ticket: SupportTicket,
    adminId: string,
    meta: RequestMeta,
    values: Record<string, string | null>,
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId: adminId,
        entityType: 'SUPPORT_TICKET',
        entityId: ticket.id,
        oldValues: { status: ticket.status, priority: ticket.priority, category: ticket.category },
        newValues: values,
        meta,
      },
      tx,
    );
  }
}

function toTicket(ticket: SupportTicket): SupportTicketView {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    orderId: ticket.orderId,
    restaurantId: ticket.restaurantId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
  };
}
