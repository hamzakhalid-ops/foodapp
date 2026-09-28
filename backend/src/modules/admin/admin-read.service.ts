import { Injectable } from '@nestjs/common';
import {
  type AdminCustomerDetail,
  type AdminCustomer,
  type AdminCustomerListQuery,
  type AdminDashboard,
} from '@quickbite/validation';
import { notFound } from '../../common/http/errors';
import { createdBefore, keysetPage } from '../../common/http/pagination';
import { formatMoney, ZERO } from '../../common/money/money';
import { businessMidnight, businessClock } from '../../common/time/business-time';
import { AppConfigService } from '../../config/app-config.service';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ACTIVE_DELIVERY_STATUSES } from '../riders/riders.service';

const ACTIVE_ORDER_STATUSES = [
  'PENDING',
  'RESTAURANT_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
] as const;
const CANCELLED = [
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_RESTAURANT',
  'CANCELLED_BY_ADMIN',
] as const;
const OPEN_TICKETS = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_INTERNAL',
  'REOPENED',
] as const;

const customerInclude = { customerProfile: true } satisfies Prisma.UserInclude;
type CustomerRow = Prisma.UserGetPayload<{ include: typeof customerInclude }>;

/**
 * Read-only admin reporting across modules (API_SPEC §94–95). Writes always go through the owning
 * module's service.
 * ponytail: counts query other modules' tables directly; move to per-module stats methods or a
 * reporting read model if these queries grow or modules are split.
 */
@Injectable()
export class AdminReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async dashboard(now = new Date()): Promise<AdminDashboard> {
    const today = businessMidnight(
      businessClock(now, this.config.get('APP_TIMEZONE')).date,
      this.config.get('APP_TIMEZONE'),
    );
    const placedToday = { placedAt: { gte: today } };
    const p = this.prisma;
    const [
      customers,
      restaurantsOnline,
      restaurantApplications,
      ridersActive,
      ridersOnline,
      riderApplications,
      ordersToday,
      ordersActive,
      deliveredToday,
      cancelledToday,
      deliveriesActive,
      gross,
      commission,
      refunded,
      openFlags,
      restrictions,
      openTickets,
      urgentTickets,
      awaitingApproval,
      failedSettlements,
    ] = await Promise.all([
      p.userRole.count({ where: { role: 'CUSTOMER' } }),
      p.restaurant.count({ where: { status: 'ONLINE' } }),
      p.restaurantApplication.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      p.riderProfile.count({ where: { approvalStatus: 'APPROVED', status: 'ACTIVE' } }),
      p.riderProfile.count({ where: { isOnline: true } }),
      p.riderProfile.count({ where: { approvalStatus: 'UNDER_REVIEW' } }),
      p.order.count({ where: placedToday }),
      p.order.count({ where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } }),
      p.order.count({ where: { status: 'DELIVERED', deliveredAt: { gte: today } } }),
      p.order.count({ where: { ...placedToday, status: { in: [...CANCELLED] } } }),
      p.delivery.count({ where: { status: { in: ACTIVE_DELIVERY_STATUSES } } }),
      p.order.aggregate({
        where: { status: 'DELIVERED', deliveredAt: { gte: today } },
        _sum: { totalAmount: true },
      }),
      p.restaurantEarning.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { commissionAmount: true },
      }),
      p.refund.aggregate({
        where: { status: 'SUCCEEDED', completedAt: { gte: today } },
        _sum: { amount: true },
      }),
      p.riskFlag.count({ where: { status: 'ACTIVE' } }),
      p.riskRestriction.count({ where: { status: 'ACTIVE' } }),
      p.supportTicket.count({ where: { status: { in: [...OPEN_TICKETS] } } }),
      p.supportTicket.count({ where: { status: { in: [...OPEN_TICKETS] }, priority: 'URGENT' } }),
      p.settlement.count({ where: { status: 'PENDING', approvedAt: null } }),
      p.settlement.count({ where: { status: 'FAILED' } }),
    ]);
    return {
      generatedAt: now.toISOString(),
      currency: this.config.get('APP_CURRENCY'),
      customers: { total: customers },
      restaurants: { online: restaurantsOnline, pendingApplications: restaurantApplications },
      riders: {
        active: ridersActive,
        online: ridersOnline,
        pendingApplications: riderApplications,
      },
      orders: {
        today: ordersToday,
        active: ordersActive,
        deliveredToday,
        cancelledToday,
      },
      deliveries: { active: deliveriesActive },
      revenue: {
        grossOrderValueToday: formatMoney(gross._sum.totalAmount ?? ZERO),
        commissionToday: formatMoney(commission._sum.commissionAmount ?? ZERO),
        refundedToday: formatMoney(refunded._sum.amount ?? ZERO),
      },
      risk: { openFlags, activeRestrictions: restrictions },
      support: { openTickets, urgentOpenTickets: urgentTickets },
      settlements: { awaitingApproval, failed: failedSettlements },
    };
  }

  async customers(query: AdminCustomerListQuery) {
    const search = query.search;
    const rows = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: 'CUSTOMER' } },
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              AND: [
                {
                  OR: [
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search } },
                    { customerProfile: { firstName: { contains: search, mode: 'insensitive' } } },
                    { customerProfile: { lastName: { contains: search, mode: 'insensitive' } } },
                  ],
                },
              ],
            }
          : {}),
        ...createdBefore(query.cursor),
      },
      include: customerInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return keysetPage(rows, query.limit, toCustomer);
  }

  async customer(userId: string): Promise<AdminCustomerDetail> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, roles: { some: { role: 'CUSTOMER' } } },
      include: { ...customerInclude, roles: { select: { role: true } } },
    });
    if (!user) throw notFound('USER_NOT_FOUND');
    const [orderCount, deliveredOrderCount, restrictions] = await Promise.all([
      this.prisma.order.count({ where: { customerId: userId } }),
      this.prisma.order.count({ where: { customerId: userId, status: 'DELIVERED' } }),
      this.prisma.riskRestriction.findMany({
        where: { subjectType: 'CUSTOMER', subjectId: userId, status: 'ACTIVE' },
        select: { id: true, restrictionType: true },
      }),
    ]);
    return {
      ...toCustomer(user),
      roles: user.roles.map((row) => row.role),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      orderCount,
      deliveredOrderCount,
      activeRiskRestrictions: restrictions,
    };
  }
}

function toCustomer(row: CustomerRow): AdminCustomer {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    status: row.status,
    firstName: row.customerProfile?.firstName ?? null,
    lastName: row.customerProfile?.lastName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
