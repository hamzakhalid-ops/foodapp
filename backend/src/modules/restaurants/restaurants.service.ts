import { randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Availability,
  type BusinessInformationRequest,
  businessInformationRequestSchema,
  type CreateRestaurantRequest,
  type DeliverySettings,
  type DeliverySettingsRequest,
  type Onboarding,
  type OperatingHours,
  type OperatingHoursRequest,
  type PaymentAccountRequest,
  type RestaurantAddressRequest,
  type RestaurantLocationRequest,
  type RestaurantProfile,
  type UpdateBasicInformationRequest,
} from '@quickbite/validation';
import { ApiException } from '../../common/http/api.exception';
import { conflict, forbidden, notFound, validationError } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { formatMoney, money } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import { businessClock } from '../../common/time/business-time';
import { AppConfigService } from '../../config/app-config.service';
import {
  type Prisma,
  type Restaurant,
  type RestaurantDeliverySettings,
  type RestaurantOperatingHours,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  detectDocumentType,
  type UploadedFile,
} from '../../infrastructure/storage/file-validation';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { RiskService } from '../risk/risk.service';
import { normalizePhone } from '../users/identity-normalization';

type Tx = Prisma.TransactionClient;

/** Application states in which the owner may edit onboarding sections (PRD §9). */
const EDITABLE = new Set(['DRAFT', 'RESUBMISSION_REQUIRED']);

/**
 * Restaurants module — onboarding, profile, operating information and availability
 * (API_SPEC §44–49, DATABASE.md §8–15).
 */
@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly risk: RiskService,
  ) {}

  // ---------------------------------------------------------------- owner registration

  async createOwnerProfile(tx: Tx, userId: string, names: { firstName: string; lastName: string }) {
    await tx.restaurantOwnerProfile.create({ data: { userId, ...names } });
  }

  // ---------------------------------------------------------------- onboarding

  /** POST /restaurant/onboarding — V1: one restaurant per owner account. */
  async createRestaurant(
    userId: string,
    input: CreateRestaurantRequest,
    meta: RequestMeta,
  ): Promise<Onboarding> {
    const phone = input.phone ? requirePhone(input.phone) : null;
    const restaurant = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.restaurantStaff.findFirst({ where: { userId, status: 'ACTIVE' } });
      if (existing) throw conflict('INVALID_REQUEST', 'This account already has a restaurant.');
      const created = await tx.restaurant.create({
        data: {
          ownerUserId: userId,
          name: input.name,
          slug: slugify(input.name),
          description: input.description ?? null,
          phone,
          email: input.email ?? null,
          cuisineDescription: input.cuisineDescription ?? null,
          application: { create: {} },
          staff: { create: { userId, role: 'OWNER' } },
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RESTAURANT_CREATED,
          actorUserId: userId,
          entityType: 'RESTAURANT',
          entityId: created.id,
          meta,
        },
        tx,
      );
      return created;
    });
    return this.getOnboarding(restaurant.id);
  }

  async getOnboarding(restaurantId: string): Promise<Onboarding> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        application: true,
        operatingHours: { orderBy: { dayOfWeek: 'asc' } },
        deliverySettings: true,
        documents: { orderBy: { createdAt: 'asc' } },
        paymentAccounts: { where: { isDefault: true, status: 'ACTIVE' } },
      },
    });
    if (!restaurant?.application) throw notFound('RESTAURANT_NOT_FOUND');
    const application = restaurant.application;
    const business = businessInformationRequestSchema.safeParse(application.businessInformation);
    const account = restaurant.paymentAccounts[0];

    return {
      restaurant: toProfile(restaurant),
      application: {
        status: application.status,
        submittedAt: application.submittedAt?.toISOString() ?? null,
        reviewedAt: application.reviewedAt?.toISOString() ?? null,
        rejectionReason: application.rejectionReason,
        resubmissionNotes: application.resubmissionNotes,
      },
      operatingHours: restaurant.operatingHours.map(toHours),
      deliverySettings: restaurant.deliverySettings
        ? toDelivery(restaurant.deliverySettings)
        : null,
      businessInformation: business.success ? business.data : null,
      documents: restaurant.documents.map((document) => ({
        id: document.id,
        documentType: document.documentType,
        status: document.status,
        rejectionReason: document.rejectionReason,
        createdAt: document.createdAt.toISOString(),
      })),
      paymentAccount: account
        ? {
            id: account.id,
            provider: account.provider,
            accountReferenceMasked: maskReference(account.accountReference),
            accountHolderName: account.accountHolderName,
          }
        : null,
      missing: missingSections(restaurant, business.success),
    };
  }

  async updateBasicInformation(
    restaurantId: string,
    input: UpdateBasicInformationRequest,
  ): Promise<Onboarding> {
    await this.requireEditable(restaurantId);
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.phone !== undefined
          ? { phone: input.phone ? requirePhone(input.phone) : null }
          : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.cuisineDescription !== undefined
          ? { cuisineDescription: input.cuisineDescription }
          : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
      },
    });
    return this.getOnboarding(restaurantId);
  }

  async updateAddress(restaurantId: string, input: RestaurantAddressRequest): Promise<Onboarding> {
    await this.requireEditable(restaurantId);
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        area: input.area ?? null,
        city: input.city,
        postalCode: input.postalCode ?? null,
      },
    });
    return this.getOnboarding(restaurantId);
  }

  async updateLocation(
    restaurantId: string,
    input: RestaurantLocationRequest,
  ): Promise<Onboarding> {
    await this.requireEditable(restaurantId);
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { latitude: input.latitude, longitude: input.longitude },
    });
    return this.getOnboarding(restaurantId);
  }

  async updateBusinessInformation(
    restaurantId: string,
    input: BusinessInformationRequest,
  ): Promise<Onboarding> {
    await this.requireEditable(restaurantId);
    await this.prisma.restaurantApplication.update({
      where: { restaurantId },
      data: { businessInformation: input },
    });
    return this.getOnboarding(restaurantId);
  }

  /** Operating hours may be changed at any time by the owner (audited). */
  async replaceOperatingHours(
    restaurantId: string,
    input: OperatingHoursRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<OperatingHours> {
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantOperatingHours.deleteMany({ where: { restaurantId } });
      await tx.restaurantOperatingHours.createMany({
        data: input.hours.map((day) => ({
          restaurantId,
          dayOfWeek: day.dayOfWeek,
          isClosed: day.isClosed,
          opensAt: day.isClosed ? null : (day.opensAt ?? null),
          closesAt: day.isClosed ? null : (day.closesAt ?? null),
        })),
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RESTAURANT_SETTINGS_CHANGED,
          actorUserId,
          entityType: 'RESTAURANT',
          entityId: restaurantId,
          metadata: { section: 'operating_hours' },
          meta,
        },
        tx,
      );
    });
    return this.getOperatingHours(restaurantId);
  }

  async getOperatingHours(restaurantId: string): Promise<OperatingHours> {
    const rows = await this.prisma.restaurantOperatingHours.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: 'asc' },
    });
    return rows.map(toHours);
  }

  /** Delivery configuration may be changed at any time by the owner (audited). */
  async updateDeliverySettings(
    restaurantId: string,
    input: DeliverySettingsRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<DeliverySettings> {
    const data = {
      deliveryEnabled: input.deliveryEnabled,
      minimumOrderAmount: input.minimumOrderAmount,
      estimatedPreparationMinutes: input.estimatedPreparationMinutes,
      deliveryRadius: input.deliveryRadius,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.restaurantDeliverySettings.upsert({
        where: { restaurantId },
        create: { restaurantId, ...data },
        update: data,
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RESTAURANT_SETTINGS_CHANGED,
          actorUserId,
          entityType: 'RESTAURANT',
          entityId: restaurantId,
          metadata: { section: 'delivery' },
          meta,
        },
        tx,
      );
      return updated;
    });
    return toDelivery(row);
  }

  /** Replaces the default payout account (owner only, audited; references only). */
  async updatePaymentAccount(
    restaurantId: string,
    input: PaymentAccountRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<Onboarding> {
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantPaymentAccount.updateMany({
        where: { restaurantId, isDefault: true },
        data: { isDefault: false, status: 'INACTIVE' },
      });
      const account = await tx.restaurantPaymentAccount.create({
        data: { restaurantId, ...input, isDefault: true },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RESTAURANT_PAYMENT_ACCOUNT_CHANGED,
          actorUserId,
          entityType: 'RESTAURANT',
          entityId: restaurantId,
          newValues: { paymentAccountId: account.id, provider: input.provider },
          meta,
        },
        tx,
      );
    });
    return this.getOnboarding(restaurantId);
  }

  async uploadDocument(
    restaurantId: string,
    documentType: string,
    file: UploadedFile | undefined,
    actorUserId: string,
  ): Promise<Onboarding> {
    await this.requireEditable(restaurantId);
    const detected = detectDocumentType(file, this.config.get('STORAGE_MAX_UPLOAD_BYTES'));
    const key = `restaurants/${restaurantId}/documents/${randomUUID()}.${detected.extension}`;
    // Store first (external call), then record — never inside a DB transaction (CLAUDE.md §9).
    await this.storage.putPrivate(key, (file as UploadedFile).buffer, detected.type);
    await this.prisma.restaurantDocument.create({
      data: { restaurantId, documentType, fileUrl: key, uploadedBy: actorUserId },
    });
    return this.getOnboarding(restaurantId);
  }

  /** POST /restaurant/onboarding/submit — DRAFT/RESUBMISSION_REQUIRED → SUBMITTED. */
  async submit(restaurantId: string, actorUserId: string, meta: RequestMeta): Promise<Onboarding> {
    const onboarding = await this.getOnboarding(restaurantId);
    if (!EDITABLE.has(onboarding.application.status)) {
      throw conflict(
        'INVALID_REQUEST',
        'The application cannot be submitted in its current state.',
      );
    }
    if (onboarding.missing.length > 0) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_ERROR',
        'The application is incomplete.',
        {
          missing: onboarding.missing,
        },
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.restaurantApplication.updateMany({
        where: { restaurantId, status: { in: ['DRAFT', 'RESUBMISSION_REQUIRED'] } },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      if (updated.count === 0)
        throw conflict('INVALID_REQUEST', 'The application was already submitted.');
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { approvalStatus: 'SUBMITTED' },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RESTAURANT_APPLICATION_SUBMITTED,
          actorUserId,
          entityType: 'RESTAURANT',
          entityId: restaurantId,
          meta,
        },
        tx,
      );
      await this.outbox.enqueue(tx, {
        eventType: 'restaurant.application_submitted',
        aggregateType: 'restaurant',
        aggregateId: restaurantId,
        payload: { restaurantId },
      });
    });
    return this.getOnboarding(restaurantId);
  }

  // ---------------------------------------------------------------- profile

  async getProfile(restaurantId: string): Promise<RestaurantProfile> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND');
    return toProfile(restaurant);
  }

  /**
   * PATCH /restaurant/profile — presentational fields only. Name, address and location are part
   * of the approved application and change through admin review.
   */
  async updateProfile(
    restaurantId: string,
    input: UpdateBasicInformationRequest,
  ): Promise<RestaurantProfile> {
    if (input.name !== undefined) {
      throw forbidden(
        'AUTHZ_FORBIDDEN',
        'The restaurant name can only be changed through the application.',
      );
    }
    const restaurant = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.phone !== undefined
          ? { phone: input.phone ? requirePhone(input.phone) : null }
          : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.cuisineDescription !== undefined
          ? { cuisineDescription: input.cuisineDescription }
          : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
      },
    });
    return toProfile(restaurant);
  }

  // ---------------------------------------------------------------- availability (API_SPEC §49)

  async getAvailability(restaurantId: string): Promise<Availability> {
    const restaurant = await this.loadForOrdering(restaurantId);
    return {
      status: effectiveStatus(restaurant),
      pausedUntil:
        restaurant.status === 'TEMPORARILY_PAUSED'
          ? (restaurant.pausedUntil?.toISOString() ?? null)
          : null,
      isOrderableNow: this.isOrderable(restaurant),
    };
  }

  async goOnline(
    restaurantId: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<Availability> {
    const restaurant = await this.loadForOrdering(restaurantId);
    if (restaurant.approvalStatus !== 'APPROVED') throw notApproved();
    if (restaurant.status === 'SUSPENDED')
      throw restaurantError('RESTAURANT_SUSPENDED', 'The restaurant is suspended.');
    if (restaurant.status === 'CLOSED')
      throw restaurantError('RESTAURANT_CLOSED', 'The restaurant is closed.');
    if (await this.risk.isBlocked('RESTAURANT', restaurantId)) {
      throw forbidden('ACCOUNT_RESTRICTED', 'The restaurant is restricted.');
    }
    if (effectiveStatus(restaurant) === 'ONLINE') {
      throw restaurantError('RESTAURANT_ALREADY_ONLINE', 'The restaurant is already online.');
    }
    if (!restaurant.deliverySettings || restaurant.operatingHours.length !== 7) {
      throw restaurantError(
        'RESTAURANT_NOT_AVAILABLE',
        'Operating hours and delivery settings are required.',
      );
    }
    await this.changeStatus(restaurantId, 'ONLINE', null, null, actorUserId, meta);
    return this.getAvailability(restaurantId);
  }

  async goOffline(
    restaurantId: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<Availability> {
    const restaurant = await this.loadForOrdering(restaurantId);
    const status = effectiveStatus(restaurant);
    if (status === 'OFFLINE')
      throw restaurantError('RESTAURANT_ALREADY_OFFLINE', 'The restaurant is already offline.');
    if (status !== 'ONLINE' && status !== 'TEMPORARILY_PAUSED') {
      throw restaurantError(
        'RESTAURANT_NOT_AVAILABLE',
        'The restaurant status cannot be changed by restaurant staff.',
      );
    }
    await this.changeStatus(restaurantId, 'OFFLINE', null, null, actorUserId, meta);
    return this.getAvailability(restaurantId);
  }

  async pause(
    restaurantId: string,
    durationMinutes: number,
    reason: string | null,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<Availability> {
    const restaurant = await this.loadForOrdering(restaurantId);
    if (effectiveStatus(restaurant) !== 'ONLINE') {
      throw restaurantError('RESTAURANT_NOT_AVAILABLE', 'Only an online restaurant can be paused.');
    }
    const until = new Date(Date.now() + durationMinutes * 60_000);
    await this.changeStatus(restaurantId, 'TEMPORARILY_PAUSED', until, reason, actorUserId, meta);
    return this.getAvailability(restaurantId);
  }

  /** Scheduled: ends expired pauses (the effective status already treats them as ONLINE). */
  async resumeExpiredPauses(): Promise<number> {
    const result = await this.prisma.restaurant.updateMany({
      where: { status: 'TEMPORARILY_PAUSED', pausedUntil: { lte: new Date() } },
      data: { status: 'ONLINE', pausedUntil: null, statusReason: null },
    });
    return result.count;
  }

  async changeStatus(
    restaurantId: string,
    status: 'ONLINE' | 'OFFLINE' | 'TEMPORARILY_PAUSED' | 'SUSPENDED' | 'CLOSED',
    pausedUntil: Date | null,
    reason: string | null,
    actorUserId: string,
    meta: RequestMeta,
    tx?: Tx,
  ): Promise<void> {
    const run = async (client: Tx) => {
      const before = await client.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      await client.restaurant.update({
        where: { id: restaurantId },
        data: { status, pausedUntil, statusReason: reason },
      });
      await this.audit.record(
        {
          action:
            status === 'SUSPENDED'
              ? AUDIT_ACTIONS.RESTAURANT_SUSPENDED
              : AUDIT_ACTIONS.RESTAURANT_STATUS_CHANGED,
          actorUserId,
          entityType: 'RESTAURANT',
          entityId: restaurantId,
          oldValues: { status: before.status },
          newValues: { status, ...(reason ? { reason } : {}) },
          meta,
        },
        client,
      );
      await this.outbox.enqueue(client, {
        eventType: 'restaurant.status_changed',
        aggregateType: 'restaurant',
        aggregateId: restaurantId,
        payload: { restaurantId, status, previousStatus: before.status },
      });
    };
    if (tx) await run(tx);
    else await this.prisma.$transaction(run);
  }

  // ---------------------------------------------------------------- orderability

  async loadForOrdering(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { operatingHours: true, deliverySettings: true },
    });
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND');
    return restaurant;
  }

  /**
   * ARCHITECTURE §59 / ORDER_RULES §8 / ADR-0014 §12: approved, effectively ONLINE, delivery
   * enabled and within today's operating hours in the business timezone.
   */
  isOrderable(
    restaurant: Restaurant & {
      operatingHours: RestaurantOperatingHours[];
      deliverySettings: RestaurantDeliverySettings | null;
    },
    at = new Date(),
  ): boolean {
    if (restaurant.approvalStatus !== 'APPROVED') return false;
    if (effectiveStatus(restaurant, at) !== 'ONLINE') return false;
    if (!restaurant.deliverySettings?.deliveryEnabled) return false;
    const clock = businessClock(at, this.config.get('APP_TIMEZONE'));
    const today = restaurant.operatingHours.find((day) => day.dayOfWeek === clock.isoWeekday);
    if (!today || today.isClosed || !today.opensAt || !today.closesAt) return false;
    return clock.hhmm >= today.opensAt && clock.hhmm < today.closesAt;
  }

  private async requireEditable(restaurantId: string): Promise<void> {
    const application = await this.prisma.restaurantApplication.findUnique({
      where: { restaurantId },
    });
    if (!application) throw notFound('RESTAURANT_NOT_FOUND');
    if (!EDITABLE.has(application.status)) {
      throw conflict(
        'INVALID_REQUEST',
        'The application can no longer be edited in its current state.',
      );
    }
  }
}

/** A pause whose time has passed counts as ONLINE even before the scheduled cleanup runs. */
export function effectiveStatus(
  restaurant: Pick<Restaurant, 'status' | 'pausedUntil'>,
  at = new Date(),
): Restaurant['status'] {
  if (
    restaurant.status === 'TEMPORARILY_PAUSED' &&
    restaurant.pausedUntil &&
    restaurant.pausedUntil <= at
  ) {
    return 'ONLINE';
  }
  return restaurant.status;
}

export function toProfile(restaurant: Restaurant): RestaurantProfile {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    description: restaurant.description,
    phone: restaurant.phone,
    email: restaurant.email,
    logoUrl: restaurant.logoUrl,
    coverImageUrl: restaurant.coverImageUrl,
    cuisineDescription: restaurant.cuisineDescription,
    status: effectiveStatus(restaurant),
    approvalStatus: restaurant.approvalStatus,
    addressLine1: restaurant.addressLine1,
    addressLine2: restaurant.addressLine2,
    area: restaurant.area,
    city: restaurant.city,
    postalCode: restaurant.postalCode,
    latitude: restaurant.latitude?.toNumber() ?? null,
    longitude: restaurant.longitude?.toNumber() ?? null,
  };
}

function toHours(row: RestaurantOperatingHours): OperatingHours[number] {
  return {
    dayOfWeek: row.dayOfWeek,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    isClosed: row.isClosed,
  };
}

export function toDelivery(row: RestaurantDeliverySettings): DeliverySettings {
  return {
    deliveryEnabled: row.deliveryEnabled,
    minimumOrderAmount: formatMoney(money(row.minimumOrderAmount)),
    estimatedPreparationMinutes: row.estimatedPreparationMinutes,
    deliveryRadius: row.deliveryRadius.toNumber(),
  };
}

function missingSections(
  restaurant: Restaurant & {
    operatingHours: RestaurantOperatingHours[];
    deliverySettings: RestaurantDeliverySettings | null;
    documents: unknown[];
    paymentAccounts: unknown[];
  },
  hasBusinessInformation: boolean,
): string[] {
  const missing: string[] = [];
  if (!restaurant.phone || !restaurant.email) missing.push('basic-information');
  if (!restaurant.addressLine1 || !restaurant.city) missing.push('address');
  if (restaurant.latitude === null || restaurant.longitude === null) missing.push('location');
  if (restaurant.operatingHours.length !== 7) missing.push('operating-hours');
  if (!restaurant.deliverySettings) missing.push('delivery');
  if (!hasBusinessInformation) missing.push('business');
  if (restaurant.documents.length === 0) missing.push('documents');
  if (restaurant.paymentAccounts.length === 0) missing.push('payment');
  return missing;
}

function maskReference(reference: string): string {
  return reference.length <= 4 ? '****' : `****${reference.slice(-4)}`;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'restaurant'}-${randomBytes(3).toString('hex')}`;
}

function requirePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone)
    throw validationError({
      phone: 'Phone number must be in international format, e.g. +923001234567',
    });
  return phone;
}

function restaurantError(
  code:
    | 'RESTAURANT_ALREADY_ONLINE'
    | 'RESTAURANT_ALREADY_OFFLINE'
    | 'RESTAURANT_SUSPENDED'
    | 'RESTAURANT_CLOSED'
    | 'RESTAURANT_NOT_AVAILABLE',
  message: string,
) {
  return new ApiException(HttpStatus.CONFLICT, code, message);
}

function notApproved() {
  return new ApiException(
    HttpStatus.CONFLICT,
    'RESTAURANT_NOT_APPROVED',
    'The restaurant has not been approved yet.',
  );
}
