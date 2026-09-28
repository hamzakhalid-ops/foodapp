import { Injectable } from '@nestjs/common';
import { type Onboarding } from '@quickbite/validation';
import { conflict, notFound } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  type Prisma,
  type RestaurantApprovalStatus,
  type RestaurantStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { RestaurantsService, toProfile } from './restaurants.service';

const REVIEWABLE: RestaurantApprovalStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

export interface AdminRestaurantDetail extends Onboarding {
  owner: {
    userId: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  documentUrls: Record<string, string>;
}

/** Admin application review and restaurant status control (ADMIN_SPEC §8–10, API_SPEC §96–97). */
@Injectable()
export class RestaurantReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
  ) {}

  async list(filter: {
    approvalStatus?: RestaurantApprovalStatus;
    status?: RestaurantStatus;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.RestaurantWhereInput = {
      ...(filter.approvalStatus ? { approvalStatus: filter.approvalStatus } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { city: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.restaurant.count({ where }),
      this.prisma.restaurant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
    ]);
    return { rows: rows.map(toProfile), total };
  }

  async detail(restaurantId: string): Promise<AdminRestaurantDetail> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { owner: { include: { restaurantOwnerProfile: true } }, documents: true },
    });
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND');
    const onboarding = await this.restaurants.getOnboarding(restaurantId);
    const documentUrls: Record<string, string> = {};
    for (const document of restaurant.documents) {
      documentUrls[document.id] = await this.storage.signedReadUrl(document.fileUrl);
    }
    return {
      ...onboarding,
      owner: {
        userId: restaurant.owner.id,
        email: restaurant.owner.email,
        phone: restaurant.owner.phone,
        firstName: restaurant.owner.restaurantOwnerProfile?.firstName ?? null,
        lastName: restaurant.owner.restaurantOwnerProfile?.lastName ?? null,
      },
      documentUrls,
    };
  }

  approve(restaurantId: string, adminId: string, meta: RequestMeta) {
    return this.decide(restaurantId, 'APPROVED', { adminId, meta });
  }

  reject(restaurantId: string, reason: string, adminId: string, meta: RequestMeta) {
    return this.decide(restaurantId, 'REJECTED', { adminId, meta, reason });
  }

  requestResubmission(restaurantId: string, notes: string, adminId: string, meta: RequestMeta) {
    return this.decide(restaurantId, 'RESUBMISSION_REQUIRED', { adminId, meta, reason: notes });
  }

  private async decide(
    restaurantId: string,
    decision: 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED',
    context: { adminId: string; meta: RequestMeta; reason?: string },
  ): Promise<AdminRestaurantDetail> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.restaurantApplication.updateMany({
        where: { restaurantId, status: { in: REVIEWABLE } },
        data: {
          status: decision,
          reviewedAt: now,
          reviewedBy: context.adminId,
          ...(decision === 'REJECTED' ? { rejectionReason: context.reason ?? null } : {}),
          ...(decision === 'RESUBMISSION_REQUIRED'
            ? { resubmissionNotes: context.reason ?? null }
            : {}),
        },
      });
      if (updated.count === 0) {
        const exists = await tx.restaurant.count({ where: { id: restaurantId } });
        if (!exists) throw notFound('RESTAURANT_NOT_FOUND');
        throw conflict('INVALID_REQUEST', 'The application is not awaiting review.');
      }
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { approvalStatus: decision },
      });
      if (decision === 'APPROVED') {
        await tx.restaurantDocument.updateMany({
          where: { restaurantId, status: 'PENDING' },
          data: { status: 'APPROVED', reviewedBy: context.adminId, reviewedAt: now },
        });
      }
      await this.audit.record(
        {
          action:
            decision === 'APPROVED'
              ? AUDIT_ACTIONS.RESTAURANT_APPROVED
              : decision === 'REJECTED'
                ? AUDIT_ACTIONS.RESTAURANT_REJECTED
                : AUDIT_ACTIONS.RESTAURANT_RESUBMISSION_REQUESTED,
          actorUserId: context.adminId,
          entityType: 'RESTAURANT',
          entityId: restaurantId,
          newValues: {
            approvalStatus: decision,
            ...(context.reason ? { reason: context.reason } : {}),
          },
          meta: context.meta,
        },
        tx,
      );
      await this.outbox.enqueue(tx, {
        eventType: 'restaurant.application_reviewed',
        aggregateType: 'restaurant',
        aggregateId: restaurantId,
        payload: { restaurantId, decision },
      });
    });
    return this.detail(restaurantId);
  }

  /** PATCH /admin/restaurants/{id}: suspend, reactivate (→ OFFLINE) or close; reason required. */
  async setStatus(
    restaurantId: string,
    status: 'SUSPENDED' | 'OFFLINE' | 'CLOSED',
    reason: string,
    adminId: string,
    meta: RequestMeta,
  ): Promise<AdminRestaurantDetail> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND');
    if (restaurant.status === status)
      throw conflict('INVALID_REQUEST', `The restaurant is already ${status}.`);
    await this.restaurants.changeStatus(restaurantId, status, null, reason, adminId, meta);
    return this.detail(restaurantId);
  }
}
