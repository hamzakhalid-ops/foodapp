import { Injectable } from '@nestjs/common';
import {
  type AdminRiderListQuery,
  type AdminRiderUpdateRequest,
  type RiderOnboarding,
} from '@quickbite/validation';
import { conflict, notFound } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { OutboxService } from '../../common/outbox/outbox.service';
import { type Prisma, type RiderApprovalStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AUDIT_ACTIONS, type AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { RiderLocationStore } from './rider-location.store';
import { RidersService, toRiderProfile } from './riders.service';

export interface AdminRiderDetail extends RiderOnboarding {
  userId: string;
  email: string | null;
  isOnline: boolean;
  isAvailable: boolean;
  documentUrls: Record<string, string>;
}

type Action = 'APPROVE' | 'REJECT' | 'SUSPEND' | 'RESTORE';

const RULES: Record<
  Action,
  { from: RiderApprovalStatus[]; to: RiderApprovalStatus; audit: AuditAction }
> = {
  APPROVE: { from: ['UNDER_REVIEW'], to: 'APPROVED', audit: AUDIT_ACTIONS.RIDER_APPROVED },
  REJECT: { from: ['UNDER_REVIEW'], to: 'REJECTED', audit: AUDIT_ACTIONS.RIDER_REJECTED },
  SUSPEND: { from: ['APPROVED'], to: 'SUSPENDED', audit: AUDIT_ACTIONS.RIDER_SUSPENDED },
  RESTORE: { from: ['SUSPENDED'], to: 'APPROVED', audit: AUDIT_ACTIONS.RIDER_RESTORED },
};

/** Admin rider management (API_SPEC §98–99, ADMIN_SPEC §11–12). Every change is audited. */
@Injectable()
export class RiderReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riders: RidersService,
    private readonly storage: StorageService,
    private readonly locations: RiderLocationStore,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(query: AdminRiderListQuery) {
    const where: Prisma.RiderProfileWhereInput = {
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
      ...(query.online ? { isOnline: query.online === 'true' } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.riderProfile.count({ where }),
      this.prisma.riderProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows: rows.map(toRiderProfile), total };
  }

  async detail(riderId: string): Promise<AdminRiderDetail> {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { id: riderId },
      include: { user: true, documents: true },
    });
    if (!rider) throw notFound('RIDER_NOT_FOUND');
    const onboarding = await this.riders.getOnboarding(rider.userId);
    const documentUrls: Record<string, string> = {};
    for (const document of rider.documents) {
      documentUrls[document.id] = await this.storage.signedReadUrl(document.fileUrl);
    }
    return {
      ...onboarding,
      userId: rider.userId,
      email: rider.user.email,
      isOnline: rider.isOnline,
      isAvailable: rider.isAvailable,
      documentUrls,
    };
  }

  async update(
    riderId: string,
    input: AdminRiderUpdateRequest,
    adminId: string,
    meta: RequestMeta,
  ): Promise<AdminRiderDetail> {
    await this.prisma.$transaction(async (tx) => {
      const rider = await tx.riderProfile.findUnique({ where: { id: riderId } });
      if (!rider) throw notFound('RIDER_NOT_FOUND');
      await tx.riderProfile.update({
        where: { id: riderId },
        data: {
          ...(input.vehicleType ? { vehicleType: input.vehicleType } : {}),
          ...(input.vehicleNumber ? { vehicleNumber: input.vehicleNumber } : {}),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RIDER_UPDATED,
          actorUserId: adminId,
          entityType: 'RIDER',
          entityId: riderId,
          oldValues: { vehicleType: rider.vehicleType, vehicleNumber: rider.vehicleNumber },
          newValues: { ...input },
          meta,
        },
        tx,
      );
    });
    return this.detail(riderId);
  }

  /**
   * approve / reject / suspend / restore. Approval also approves pending documents; suspension
   * takes the rider offline and withdraws open offers (DISPATCH_RULES §10, §26).
   */
  async act(
    riderId: string,
    action: Action,
    reason: string | null,
    adminId: string,
    meta: RequestMeta,
  ): Promise<AdminRiderDetail> {
    const rule = RULES[action];
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const rider = await tx.riderProfile.findUnique({ where: { id: riderId } });
      if (!rider) throw notFound('RIDER_NOT_FOUND');
      const updated = await tx.riderProfile.updateMany({
        where: { id: riderId, approvalStatus: { in: rule.from } },
        data: {
          approvalStatus: rule.to,
          status: action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE',
          ...(action === 'APPROVE' || action === 'REJECT'
            ? { reviewedAt: now, reviewedBy: adminId }
            : {}),
          ...(action === 'REJECT' ? { rejectionReason: reason } : {}),
          ...(action === 'SUSPEND' ? { isOnline: false, isAvailable: false } : {}),
        },
      });
      if (updated.count === 0) {
        throw conflict(
          'INVALID_REQUEST',
          `The rider cannot be ${rule.to.toLowerCase()} from ${rider.approvalStatus}.`,
        );
      }
      if (action === 'APPROVE') {
        await tx.riderDocument.updateMany({
          where: { riderId, status: 'PENDING' },
          data: { status: 'APPROVED', reviewedAt: now, reviewedBy: adminId },
        });
      }
      if (action === 'SUSPEND') await this.riders.withdrawOffers(tx, riderId);
      await this.audit.record(
        {
          action: rule.audit,
          actorUserId: adminId,
          entityType: 'RIDER',
          entityId: riderId,
          oldValues: { approvalStatus: rider.approvalStatus },
          newValues: { approvalStatus: rule.to, ...(reason ? { reason } : {}) },
          meta,
        },
        tx,
      );
      await this.outbox.enqueue(tx, {
        eventType: 'rider.status_changed',
        aggregateType: 'rider',
        aggregateId: riderId,
        payload: { riderId, userId: rider.userId, approvalStatus: rule.to },
      });
    });
    if (action === 'SUSPEND') await this.locations.remove(riderId);
    return this.detail(riderId);
  }
}
