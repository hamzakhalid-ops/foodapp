import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type RiderAvailability,
  type RiderDocument as RiderDocumentView,
  type RiderLocationRequest,
  type RiderOnboarding,
  type RiderProfile as RiderProfileView,
  type UpdateRiderProfileRequest,
} from '@quickbite/validation';
import { conflict, notFound, unprocessable } from '../../common/http/errors';
import { OutboxService } from '../../common/outbox/outbox.service';
import { AppConfigService } from '../../config/app-config.service';
import {
  type DeliveryStatus,
  type Prisma,
  type RiderDocument,
  type RiderProfile,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  detectDocumentType,
  type UploadedFile,
} from '../../infrastructure/storage/file-validation';
import { normalizePhone } from '../users/identity-normalization';
import { RiderLocationStore } from './rider-location.store';

type Tx = Prisma.TransactionClient;

export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  'ASSIGNED',
  'ARRIVING_AT_RESTAURANT',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

/** Rider information may be edited until approval and again after a rejection (PRD §7). */
const EDITABLE = new Set(['PENDING', 'REJECTED']);

/**
 * Rider profiles, onboarding, documents, presence and location (API_SPEC §63–69,
 * DATABASE.md §31–34).
 */
@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly locations: RiderLocationStore,
    private readonly outbox: OutboxService,
  ) {}

  async createProfile(
    tx: Tx,
    userId: string,
    input: { firstName: string; lastName: string; phone: string },
  ): Promise<void> {
    await tx.riderProfile.create({
      data: {
        userId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: normalizePhone(input.phone) ?? input.phone,
      },
    });
  }

  async requireByUser(userId: string): Promise<RiderProfile> {
    const rider = await this.prisma.riderProfile.findUnique({ where: { userId } });
    if (!rider) throw notFound('RIDER_NOT_FOUND');
    return rider;
  }

  // ---------------------------------------------------------------- onboarding & profile

  async getOnboarding(userId: string): Promise<RiderOnboarding> {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: { documents: { orderBy: { uploadedAt: 'asc' } } },
    });
    if (!rider) throw notFound('RIDER_NOT_FOUND');
    return {
      profile: toRiderProfile(rider),
      documents: rider.documents.map(toRiderDocument),
      submittedAt: rider.submittedAt?.toISOString() ?? null,
      rejectionReason: rider.rejectionReason,
      missing: missingSections(rider, rider.documents),
    };
  }

  /** PATCH /rider/onboarding — editable while PENDING or REJECTED. */
  async updateOnboarding(
    userId: string,
    input: UpdateRiderProfileRequest,
  ): Promise<RiderOnboarding> {
    const rider = await this.requireByUser(userId);
    if (!EDITABLE.has(rider.approvalStatus)) {
      throw conflict('INVALID_REQUEST', 'The application can no longer be edited.');
    }
    await this.prisma.riderProfile.update({ where: { id: rider.id }, data: definedOnly(input) });
    return this.getOnboarding(userId);
  }

  async submit(userId: string): Promise<RiderOnboarding> {
    await this.prisma.$transaction(async (tx) => {
      const rider = await tx.riderProfile.findUniqueOrThrow({
        where: { userId },
        include: { documents: true },
      });
      if (!EDITABLE.has(rider.approvalStatus)) {
        throw conflict('INVALID_REQUEST', 'The application has already been submitted.');
      }
      const missing = missingSections(rider, rider.documents);
      if (missing.length > 0) {
        throw unprocessable('VALIDATION_ERROR', 'The application is incomplete.', { missing });
      }
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { approvalStatus: 'UNDER_REVIEW', submittedAt: new Date(), rejectionReason: null },
      });
      await this.outbox.enqueue(tx, {
        eventType: 'rider.application_submitted',
        aggregateType: 'rider',
        aggregateId: rider.id,
        payload: { riderId: rider.id, userId },
      });
    });
    return this.getOnboarding(userId);
  }

  async getProfile(userId: string): Promise<RiderProfileView> {
    return toRiderProfile(await this.requireByUser(userId));
  }

  /** PATCH /rider/profile — name/photo any time; vehicle details only while editable. */
  async updateProfile(userId: string, input: UpdateRiderProfileRequest): Promise<RiderProfileView> {
    const rider = await this.requireByUser(userId);
    const changesVehicle = input.vehicleType !== undefined || input.vehicleNumber !== undefined;
    if (changesVehicle && !EDITABLE.has(rider.approvalStatus)) {
      throw conflict('INVALID_REQUEST', 'Vehicle details change through support after approval.');
    }
    const updated = await this.prisma.riderProfile.update({
      where: { id: rider.id },
      data: definedOnly(input),
    });
    return toRiderProfile(updated);
  }

  // ---------------------------------------------------------------- documents (API_SPEC §66)

  async listDocuments(userId: string): Promise<RiderDocumentView[]> {
    const rider = await this.requireByUser(userId);
    const documents = await this.prisma.riderDocument.findMany({
      where: { riderId: rider.id },
      orderBy: { uploadedAt: 'asc' },
    });
    return documents.map(toRiderDocument);
  }

  async uploadDocument(
    userId: string,
    documentType: string,
    file: UploadedFile | undefined,
  ): Promise<RiderDocumentView> {
    const rider = await this.requireEditable(userId);
    const detected = detectDocumentType(file, this.config.get('STORAGE_MAX_UPLOAD_BYTES'));
    const key = `riders/${rider.id}/documents/${randomUUID()}.${detected.extension}`;
    // Store first (external call), then record — never inside a DB transaction (CLAUDE.md §9).
    await this.storage.putPrivate(key, (file as UploadedFile).buffer, detected.type);
    const document = await this.prisma.riderDocument.create({
      data: { riderId: rider.id, documentType, fileUrl: key },
    });
    return toRiderDocument(document);
  }

  /** PATCH replaces the file of a document (e.g. after rejection). */
  async replaceDocument(
    userId: string,
    documentId: string,
    file: UploadedFile | undefined,
  ): Promise<RiderDocumentView> {
    const rider = await this.requireEditable(userId);
    const existing = await this.findDocument(rider.id, documentId);
    const detected = detectDocumentType(file, this.config.get('STORAGE_MAX_UPLOAD_BYTES'));
    const key = `riders/${rider.id}/documents/${randomUUID()}.${detected.extension}`;
    await this.storage.putPrivate(key, (file as UploadedFile).buffer, detected.type);
    const document = await this.prisma.riderDocument.update({
      where: { id: existing.id },
      data: {
        fileUrl: key,
        status: 'PENDING',
        uploadedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      },
    });
    return toRiderDocument(document);
  }

  async deleteDocument(userId: string, documentId: string): Promise<void> {
    const rider = await this.requireEditable(userId);
    const document = await this.findDocument(rider.id, documentId);
    await this.prisma.riderDocument.delete({ where: { id: document.id } });
  }

  // ---------------------------------------------------------------- presence (API_SPEC §67–68)

  async getAvailability(userId: string): Promise<RiderAvailability> {
    return toAvailability(await this.requireByUser(userId));
  }

  /** Verifies approval, account state and documents (API_SPEC §67). */
  async goOnline(userId: string): Promise<RiderAvailability> {
    const rider = await this.prisma.riderProfile.findUniqueOrThrow({
      where: { userId },
      include: { documents: true, user: true },
    });
    if (rider.approvalStatus !== 'APPROVED' || rider.status !== 'ACTIVE') {
      throw conflict('RIDER_NOT_ELIGIBLE', 'Your rider account is not approved for deliveries.');
    }
    if (rider.user.status !== 'ACTIVE') {
      throw conflict('ACCOUNT_RESTRICTED', 'Your account is restricted.');
    }
    const documentsValid =
      rider.documents.length > 0 &&
      rider.documents.every((document) => document.status === 'APPROVED');
    if (!documentsValid) {
      throw conflict('RIDER_NOT_ELIGIBLE', 'Your documents must be approved before going online.');
    }
    const busy = await this.hasActiveDelivery(this.prisma, rider.id);
    const updated = await this.prisma.riderProfile.update({
      where: { id: rider.id },
      data: { isOnline: true, isAvailable: !busy },
    });
    return toAvailability(updated);
  }

  /** Going offline withdraws open offers; an active delivery must be finished first. */
  async goOffline(userId: string): Promise<RiderAvailability> {
    const rider = await this.requireByUser(userId);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (await this.hasActiveDelivery(tx, rider.id)) {
        throw conflict('INVALID_REQUEST', 'Finish your active delivery before going offline.');
      }
      await this.withdrawOffers(tx, rider.id);
      return tx.riderProfile.update({
        where: { id: rider.id },
        data: { isOnline: false, isAvailable: false },
      });
    });
    await this.locations.remove(rider.id);
    return toAvailability(updated);
  }

  /** POST /rider/availability — online riders pause/resume receiving offers (API_SPEC §68). */
  async setAvailable(userId: string, available: boolean): Promise<RiderAvailability> {
    const rider = await this.requireByUser(userId);
    if (!rider.isOnline) throw conflict('RIDER_NOT_AVAILABLE', 'Go online first.');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (available && (await this.hasActiveDelivery(tx, rider.id))) {
        throw conflict('INVALID_REQUEST', 'You already have an active delivery.');
      }
      if (!available) await this.withdrawOffers(tx, rider.id);
      return tx.riderProfile.update({ where: { id: rider.id }, data: { isAvailable: available } });
    });
    return toAvailability(updated);
  }

  /** POST /rider/location — only online riders are tracked (location privacy, MAPS §22). */
  async updateLocation(userId: string, input: RiderLocationRequest): Promise<void> {
    const rider = await this.requireByUser(userId);
    if (!rider.isOnline) throw conflict('RIDER_NOT_AVAILABLE', 'Go online to share your location.');
    await this.locations.save(rider.id, {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters ?? null,
      recordedAt: new Date(),
    });
  }

  hasActiveDelivery(tx: Tx, riderId: string): Promise<boolean> {
    return tx.delivery
      .count({ where: { riderId, status: { in: ACTIVE_DELIVERY_STATUSES } } })
      .then((count) => count > 0);
  }

  /** Open offers stop being valid once the rider is no longer available (DISPATCH_RULES §25–26). */
  async withdrawOffers(tx: Tx, riderId: string): Promise<void> {
    await tx.dispatchOffer.updateMany({
      where: { riderId, status: 'OFFERED' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
  }

  private async requireEditable(userId: string): Promise<RiderProfile> {
    const rider = await this.requireByUser(userId);
    if (!EDITABLE.has(rider.approvalStatus)) {
      throw conflict('INVALID_REQUEST', 'Documents can no longer be changed.');
    }
    return rider;
  }

  private async findDocument(riderId: string, documentId: string): Promise<RiderDocument> {
    const document = await this.prisma.riderDocument.findFirst({
      where: { id: documentId, riderId },
    });
    if (!document) throw notFound('RESOURCE_NOT_FOUND', 'Document not found.');
    return document;
  }
}

function missingSections(rider: RiderProfile, documents: RiderDocument[]): string[] {
  return [
    ...(rider.vehicleType && rider.vehicleNumber ? [] : ['vehicle']),
    ...(documents.length > 0 ? [] : ['documents']),
  ];
}

function definedOnly<T extends object>(input: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

export function toRiderProfile(rider: RiderProfile): RiderProfileView {
  return {
    id: rider.id,
    firstName: rider.firstName,
    lastName: rider.lastName,
    phone: rider.phone,
    profileImageUrl: rider.profileImageUrl,
    vehicleType: rider.vehicleType,
    vehicleNumber: rider.vehicleNumber,
    status: rider.status,
    approvalStatus: rider.approvalStatus,
  };
}

export function toRiderDocument(document: RiderDocument): RiderDocumentView {
  return {
    id: document.id,
    documentType: document.documentType,
    status: document.status,
    rejectionReason: document.rejectionReason,
    uploadedAt: document.uploadedAt.toISOString(),
  };
}

function toAvailability(rider: RiderProfile): RiderAvailability {
  return {
    isOnline: rider.isOnline,
    isAvailable: rider.isOnline && rider.isAvailable,
    state: !rider.isOnline ? 'OFFLINE' : rider.isAvailable ? 'AVAILABLE' : 'BUSY',
  };
}
