import { Injectable, Logger } from '@nestjs/common';
import {
  type Delivery as DeliveryView,
  type DispatchOffer as DispatchOfferView,
} from '@quickbite/validation';
import { conflict, notFound } from '../../common/http/errors';
import { formatMoney, money } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import { type DispatchSettings, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { RiderLocationStore } from '../riders/rider-location.store';
import { ACTIVE_DELIVERY_STATUSES, RidersService } from '../riders/riders.service';
import { RiskService } from '../risk/risk.service';

type Tx = Prisma.TransactionClient;

const OFFER_INCLUDE = {
  order: { include: { restaurant: true } },
} satisfies Prisma.DispatchOfferInclude;
type OfferRow = Prisma.DispatchOfferGetPayload<{ include: typeof OFFER_INCLUDE }>;

/**
 * Delivery Dispatch Engine (DISPATCH_RULES, API_SPEC §70–72, ADR-0007). Offers go to one rider at
 * a time — the nearest eligible rider not yet offered this order — searching from the initial
 * radius outwards by the configured increment up to the maximum. Offer expiry, rejection and
 * retries run through `tick()` and the `order.status_changed` outbox handler.
 *
 * Without a `dispatch_settings` row dispatch does nothing (values are never invented).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: DeliveriesService,
    private readonly riders: RidersService,
    private readonly locations: RiderLocationStore,
    private readonly outbox: OutboxService,
    private readonly risk: RiskService,
  ) {}

  /** Entry point for READY_FOR_PICKUP (DISPATCH_RULES §2). */
  async onOrderReady(orderId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.deliveries.ensureForOrder(tx, orderId));
    await this.dispatch(orderId);
  }

  /** Offers the order to the next eligible rider unless an offer is already open. */
  async dispatch(orderId: string): Promise<void> {
    const settings = await this.prisma.dispatchSettings.findFirst();
    if (!settings) {
      this.logger.warn('Dispatch settings are not configured; dispatch is paused');
      return;
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { restaurant: true, delivery: true },
    });
    const restaurant = order?.restaurant;
    if (
      !order ||
      order.status !== 'READY_FOR_PICKUP' ||
      order.delivery?.status !== 'PENDING' ||
      order.delivery.dispatchFailedAt ||
      !restaurant?.latitude ||
      !restaurant.longitude
    ) {
      return;
    }
    // Candidate search in Redis happens before the transaction (no external I/O inside it).
    const nearby = await this.locations.nearby(
      restaurant.latitude.toNumber(),
      restaurant.longitude.toNumber(),
      settings.maximumRadius.toNumber(),
    );
    const freshAfter = Date.now() - settings.locationMaxAgeSeconds * 1000;
    const fresh = nearby.filter((rider) => rider.recordedAt.getTime() >= freshAfter);

    await this.prisma.$transaction(async (tx) => {
      // Serialise dispatch per order across API and worker processes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dispatch:${orderId}`}))`;
      const delivery = await tx.delivery.findUnique({ where: { orderId } });
      if (delivery?.status !== 'PENDING' || delivery.dispatchFailedAt) return;
      if (await tx.dispatchOffer.count({ where: { orderId, status: 'OFFERED' } })) return;

      const attempts = await tx.dispatchOffer.count({ where: { orderId } });
      if (attempts >= settings.maxOfferAttempts) {
        await this.fail(tx, delivery.id, orderId, attempts);
        return;
      }
      const eligible = await this.eligible(
        tx,
        orderId,
        fresh.map((rider) => rider.riderId),
      );
      const choice = pickWithinExpandingRadius(
        fresh.filter((rider) => eligible.has(rider.riderId)),
        settings,
      );
      if (!choice) return; // retried by tick() as riders come online or move closer

      const now = new Date();
      const offer = await tx.dispatchOffer.create({
        data: {
          orderId,
          riderId: choice.riderId,
          offeredAt: now,
          expiresAt: new Date(now.getTime() + settings.offerTimeoutSeconds * 1000),
          distanceToRestaurant: choice.distanceKm.toFixed(3),
        },
      });
      await this.outbox.enqueue(tx, {
        eventType: 'dispatch.offer_created',
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {
          offerId: offer.id,
          orderId,
          riderId: choice.riderId,
          expiresAt: offer.expiresAt.toISOString(),
          searchRadiusKm: choice.radiusKm,
          attempt: attempts + 1,
        },
      });
    });
  }

  /** Periodic work: expire offers, recover missing deliveries, retry undispatched orders. */
  async tick(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.dispatchOffer.findMany({
      where: { status: 'OFFERED', expiresAt: { lte: now } },
      select: { id: true, orderId: true, riderId: true },
      take: 200,
    });
    for (const offer of expired) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.dispatchOffer.updateMany({
          where: { id: offer.id, status: 'OFFERED' },
          data: { status: 'EXPIRED' },
        });
        if (updated.count === 0) return;
        await this.outbox.enqueue(tx, {
          eventType: 'dispatch.offer_expired',
          aggregateType: 'order',
          aggregateId: offer.orderId,
          payload: { offerId: offer.id, orderId: offer.orderId, riderId: offer.riderId },
        });
      });
    }

    const ready = await this.prisma.order.findMany({
      where: { status: 'READY_FOR_PICKUP', delivery: { is: null } },
      select: { id: true },
      take: 100,
    });
    for (const order of ready) {
      await this.prisma.$transaction((tx) => this.deliveries.ensureForOrder(tx, order.id));
    }

    const waiting = await this.prisma.delivery.findMany({
      where: {
        status: 'PENDING',
        dispatchFailedAt: null,
        order: { status: 'READY_FOR_PICKUP', dispatchOffers: { none: { status: 'OFFERED' } } },
      },
      select: { orderId: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const delivery of waiting) {
      try {
        await this.dispatch(delivery.orderId);
      } catch (error) {
        this.logger.error({ err: error, orderId: delivery.orderId }, 'Dispatch attempt failed');
      }
    }
  }

  // ---------------------------------------------------------------- rider offer API (§70)

  async listOffers(userId: string): Promise<DispatchOfferView[]> {
    const rider = await this.riders.requireByUser(userId);
    const offers = await this.prisma.dispatchOffer.findMany({
      where: { riderId: rider.id, status: 'OFFERED', expiresAt: { gt: new Date() } },
      include: OFFER_INCLUDE,
      orderBy: { offeredAt: 'asc' },
    });
    return offers.map(toOffer);
  }

  async getOffer(userId: string, offerId: string): Promise<DispatchOfferView> {
    const rider = await this.riders.requireByUser(userId);
    const offer = await this.prisma.dispatchOffer.findFirst({
      where: { id: offerId, riderId: rider.id },
      include: OFFER_INCLUDE,
    });
    if (!offer) throw notFound('RESOURCE_NOT_FOUND', 'Offer not found.');
    return toOffer(offer);
  }

  /**
   * DISPATCH_RULES §18–21: re-validates everything under row locks and assigns atomically.
   * Accepting an offer that this rider already accepted returns the delivery (idempotent).
   */
  async accept(userId: string, offerId: string): Promise<DeliveryView> {
    const rider = await this.riders.requireByUser(userId);
    const deliveryId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM dispatch_offers WHERE id = ${offerId}::uuid FOR UPDATE`;
      const offer = await tx.dispatchOffer.findFirst({ where: { id: offerId, riderId: rider.id } });
      if (!offer) throw notFound('RESOURCE_NOT_FOUND', 'Offer not found.');
      const delivery = await tx.delivery.findUnique({ where: { orderId: offer.orderId } });
      if (!delivery) throw notFound('DELIVERY_NOT_FOUND');
      if (offer.status === 'ACCEPTED' && delivery.riderId === rider.id) return delivery.id;
      if (offer.status !== 'OFFERED') {
        throw conflict('DISPATCH_OFFER_ALREADY_RESPONDED', 'This offer is no longer open.');
      }
      if (offer.expiresAt <= new Date()) {
        await tx.dispatchOffer.update({ where: { id: offer.id }, data: { status: 'EXPIRED' } });
        return { expired: true } as const;
      }
      const current = await tx.riderProfile.findUniqueOrThrow({
        where: { id: rider.id },
        include: { user: true },
      });
      const eligible =
        current.approvalStatus === 'APPROVED' &&
        current.status === 'ACTIVE' &&
        current.isOnline &&
        current.isAvailable &&
        current.user.status === 'ACTIVE' &&
        !(await this.riders.hasActiveDelivery(tx, rider.id)) &&
        !(await this.risk.isBlocked('RIDER', rider.id, tx));
      if (!eligible)
        throw conflict('RIDER_NOT_ELIGIBLE', 'You cannot accept deliveries right now.');

      await this.deliveries.assign(tx, {
        deliveryId: delivery.id,
        riderId: rider.id,
        actorUserId: userId,
        reason: 'DISPATCH_OFFER_ACCEPTED',
      });
      const now = new Date();
      await tx.dispatchOffer.update({
        where: { id: offer.id },
        data: { status: 'ACCEPTED', respondedAt: now },
      });
      await tx.dispatchOffer.updateMany({
        where: { orderId: offer.orderId, status: 'OFFERED' },
        data: { status: 'CANCELLED', respondedAt: now },
      });
      await this.outbox.enqueue(tx, {
        eventType: 'dispatch.offer_accepted',
        aggregateType: 'order',
        aggregateId: offer.orderId,
        payload: { offerId: offer.id, orderId: offer.orderId, riderId: rider.id },
      });
      return delivery.id;
    });
    if (typeof deliveryId !== 'string') {
      throw conflict('DISPATCH_OFFER_EXPIRED', 'This offer has expired.');
    }
    return this.deliveries.view(deliveryId);
  }

  async reject(userId: string, offerId: string, reasonCode: string): Promise<DispatchOfferView> {
    const rider = await this.riders.requireByUser(userId);
    const orderId = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.dispatchOffer.findFirst({ where: { id: offerId, riderId: rider.id } });
      if (!offer) throw notFound('RESOURCE_NOT_FOUND', 'Offer not found.');
      const updated = await tx.dispatchOffer.updateMany({
        where: { id: offer.id, status: 'OFFERED' },
        data: { status: 'REJECTED', respondedAt: new Date(), rejectionReason: reasonCode },
      });
      if (updated.count === 0) {
        throw conflict('DISPATCH_OFFER_ALREADY_RESPONDED', 'This offer is no longer open.');
      }
      await this.outbox.enqueue(tx, {
        eventType: 'dispatch.offer_rejected',
        aggregateType: 'order',
        aggregateId: offer.orderId,
        payload: { offerId: offer.id, orderId: offer.orderId, riderId: rider.id, reasonCode },
      });
      return offer.orderId;
    });
    await this.dispatch(orderId); // next eligible rider (DISPATCH_RULES §22)
    return this.getOffer(userId, offerId);
  }

  /** Cancellation integration: open offers stop (DISPATCH_RULES §38). */
  async cancelOffersForOrder(tx: Tx, orderId: string): Promise<void> {
    await tx.dispatchOffer.updateMany({
      where: { orderId, status: 'OFFERED' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
  }

  // ---------------------------------------------------------------- internals

  /** DISPATCH_RULES §4, §8–11 — eligibility re-checked in PostgreSQL, the source of truth. */
  private async eligible(tx: Tx, orderId: string, riderIds: string[]): Promise<Set<string>> {
    if (riderIds.length === 0) return new Set();
    const rows = await tx.riderProfile.findMany({
      where: {
        id: { in: riderIds },
        approvalStatus: 'APPROVED',
        status: 'ACTIVE',
        isOnline: true,
        isAvailable: true,
        user: { status: 'ACTIVE' },
        deliveries: { none: { status: { in: ACTIVE_DELIVERY_STATUSES } } },
        offers: { none: { OR: [{ status: 'OFFERED' }, { orderId }] } },
      },
      select: { id: true },
    });
    const blocked = await this.risk.blockedRiders(
      rows.map((row) => row.id),
      tx,
    );
    return new Set(rows.map((row) => row.id).filter((id) => !blocked.has(id)));
  }

  /** Max attempts reached: an operational exception, never a silent drop (§24, §35). */
  private async fail(tx: Tx, deliveryId: string, orderId: string, attempts: number) {
    await tx.delivery.update({ where: { id: deliveryId }, data: { dispatchFailedAt: new Date() } });
    await this.outbox.enqueue(tx, {
      eventType: 'dispatch.failed',
      aggregateType: 'order',
      aggregateId: orderId,
      payload: { orderId, deliveryId, attempts },
    });
  }
}

/**
 * DISPATCH_RULES §5–6: search the initial radius, then widen by the increment up to the maximum;
 * the nearest eligible rider inside the first radius that has one wins.
 */
export function pickWithinExpandingRadius(
  candidates: { riderId: string; distanceKm: number }[],
  settings: Pick<DispatchSettings, 'initialRadius' | 'radiusIncrement' | 'maximumRadius'>,
): { riderId: string; distanceKm: number; radiusKm: number } | null {
  const maximum = settings.maximumRadius.toNumber();
  const increment = settings.radiusIncrement.toNumber();
  for (
    let radius = settings.initialRadius.toNumber();
    ;
    radius = Math.min(radius + increment, maximum)
  ) {
    const hit = candidates
      .filter((candidate) => candidate.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (hit) return { ...hit, radiusKm: radius };
    if (radius >= maximum) return null;
  }
}

function toOffer(offer: OfferRow): DispatchOfferView {
  const { order } = offer;
  const { restaurant } = order;
  return {
    id: offer.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: offer.status,
    offeredAt: offer.offeredAt.toISOString(),
    expiresAt: offer.expiresAt.toISOString(),
    distanceToRestaurantKm: offer.distanceToRestaurant.toNumber(),
    restaurant: {
      name: restaurant.name,
      addressText: [restaurant.addressLine1, restaurant.addressLine2].filter(Boolean).join(', '),
      area: restaurant.area,
      city: restaurant.city,
      latitude: restaurant.latitude?.toNumber() ?? null,
      longitude: restaurant.longitude?.toNumber() ?? null,
    },
    deliveryArea: order.deliveryArea,
    deliveryCity: order.deliveryCity,
    paymentMethod: order.paymentMethod,
    amountToCollect:
      order.paymentMethod === 'CASH_ON_DELIVERY' ? formatMoney(money(order.totalAmount)) : null,
    currency: order.currency,
  };
}
