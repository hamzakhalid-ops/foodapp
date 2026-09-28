import { Injectable } from '@nestjs/common';
import { type Prisma } from '../../generated/prisma/client';

export interface DomainEvent {
  /** API_SPEC-style name, e.g. `order.created` (ADR-0014 §7). */
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonObject;
}

/**
 * Writes domain events in the SAME transaction as the business change (ADR-0011).
 * Side effects (notifications, realtime, dispatch, risk) happen later in the worker.
 */
@Injectable()
export class OutboxService {
  async enqueue(tx: Prisma.TransactionClient, ...events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    await tx.outboxEvent.createMany({
      data: events.map((event) => ({
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
      })),
    });
  }
}
