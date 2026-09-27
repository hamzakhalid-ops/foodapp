import { Injectable } from '@nestjs/common';
import { type StaffMember } from '@quickbite/validation';
import { conflict, forbidden, notFound } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { type Prisma, type RestaurantStaff } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { normalizeEmail } from '../users/identity-normalization';

type Tx = Prisma.TransactionClient;
type StaffRow = RestaurantStaff & { user: { email: string | null } };

/**
 * Restaurant staff membership (API_SPEC §57, ADR-0004). V1 roles: OWNER and OPERATOR only.
 * The owner manages operators; the owner membership cannot be changed here (ownership transfer is
 * a separate, sensitive operation — AUTH_AUTHORIZATION §72).
 */
@Injectable()
export class RestaurantStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(restaurantId: string): Promise<StaffMember[]> {
    const rows = await this.prisma.restaurantStaff.findMany({
      where: { restaurantId },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toStaff);
  }

  async get(restaurantId: string, staffId: string): Promise<StaffMember> {
    return toStaff(await this.load(restaurantId, staffId));
  }

  /** Adds an existing, verified account as OPERATOR and grants the RESTAURANT_OPERATOR role. */
  async addOperator(
    restaurantId: string,
    rawEmail: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<StaffMember> {
    const email = normalizeEmail(rawEmail);
    const staffId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || user.status !== 'ACTIVE') {
        throw notFound('USER_NOT_FOUND', 'No active, verified account exists for this email.');
      }
      const active = await tx.restaurantStaff.findFirst({
        where: { userId: user.id, status: 'ACTIVE' },
      });
      if (active)
        throw conflict('INVALID_REQUEST', 'This account already belongs to a restaurant.');

      const membership = await tx.restaurantStaff.upsert({
        where: { restaurantId_userId: { restaurantId, userId: user.id } },
        create: { restaurantId, userId: user.id, role: 'OPERATOR' },
        update: { status: 'ACTIVE' },
      });
      if (membership.role === 'OWNER') throw forbidden();
      await tx.userRole.upsert({
        where: { userId_role: { userId: user.id, role: 'RESTAURANT_OPERATOR' } },
        create: { userId: user.id, role: 'RESTAURANT_OPERATOR' },
        update: {},
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RESTAURANT_STAFF_ADDED,
          actorUserId,
          entityType: 'RESTAURANT_STAFF',
          entityId: membership.id,
          newValues: { restaurantId, userId: user.id, role: 'OPERATOR' },
          meta,
        },
        tx,
      );
      return membership.id;
    });
    return this.get(restaurantId, staffId);
  }

  async setStatus(
    restaurantId: string,
    staffId: string,
    status: 'ACTIVE' | 'INACTIVE',
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<StaffMember> {
    const staff = await this.load(restaurantId, staffId);
    if (staff.role === 'OWNER')
      throw forbidden('AUTHZ_FORBIDDEN', 'The owner membership cannot be changed.');
    await this.prisma.$transaction(async (tx) => {
      if (status === 'ACTIVE') {
        const other = await tx.restaurantStaff.findFirst({
          where: { userId: staff.userId, status: 'ACTIVE', NOT: { id: staffId } },
        });
        if (other)
          throw conflict('INVALID_REQUEST', 'This account already belongs to a restaurant.');
      }
      await tx.restaurantStaff.update({ where: { id: staffId }, data: { status } });
      await this.syncOperatorRole(tx, staff.userId);
      await this.audit.record(
        {
          action:
            status === 'INACTIVE'
              ? AUDIT_ACTIONS.RESTAURANT_STAFF_REMOVED
              : AUDIT_ACTIONS.RESTAURANT_STAFF_UPDATED,
          actorUserId,
          entityType: 'RESTAURANT_STAFF',
          entityId: staffId,
          oldValues: { status: staff.status },
          newValues: { status },
          meta,
        },
        tx,
      );
    });
    return this.get(restaurantId, staffId);
  }

  /** AUTH_AUTHORIZATION §71: a removed operator loses the role (effective on the next request). */
  private async syncOperatorRole(tx: Tx, userId: string): Promise<void> {
    const active = await tx.restaurantStaff.count({
      where: { userId, status: 'ACTIVE', role: 'OPERATOR' },
    });
    if (active === 0) {
      await tx.userRole.deleteMany({ where: { userId, role: 'RESTAURANT_OPERATOR' } });
    } else {
      await tx.userRole.upsert({
        where: { userId_role: { userId, role: 'RESTAURANT_OPERATOR' } },
        create: { userId, role: 'RESTAURANT_OPERATOR' },
        update: {},
      });
    }
  }

  private async load(restaurantId: string, staffId: string): Promise<StaffRow> {
    const row = await this.prisma.restaurantStaff.findFirst({
      where: { id: staffId, restaurantId },
      include: { user: { select: { email: true } } },
    });
    if (!row) throw notFound();
    return row;
  }
}

function toStaff(row: StaffRow): StaffMember {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
