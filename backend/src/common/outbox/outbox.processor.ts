import { Injectable, Logger } from '@nestjs/common';
import { type OutboxEvent } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

const MAX_ATTEMPTS = 10;
const LEASE_SECONDS = 60;

/**
 * At-least-once outbox dispatch (ADR-0011). Handlers MUST be idempotent: an event is re-delivered
 * after a crash or a failed handler. Events are claimed with FOR UPDATE SKIP LOCKED so several
 * workers can run concurrently; a claimed-but-abandoned event is reclaimed after its lease.
 */
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly handlers = new Map<string, { name: string; handle: OutboxHandler }[]>();

  constructor(private readonly prisma: PrismaService) {}

  /** Called by modules during initialization. */
  register(eventType: string, name: string, handle: OutboxHandler): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push({ name, handle });
    this.handlers.set(eventType, list);
  }

  /** Processes up to `limit` due events; returns how many were claimed. */
  async processBatch(limit = 50): Promise<number> {
    const claimed = await this.prisma.$queryRaw<OutboxEvent[]>`
      UPDATE outbox_events
      SET status = 'PROCESSING',
          attempts = attempts + 1,
          available_at = now() + make_interval(secs => ${LEASE_SECONDS})
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE status IN ('PENDING', 'PROCESSING') AND available_at <= now()
        ORDER BY sequence
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, sequence, event_type AS "eventType", aggregate_type AS "aggregateType",
        aggregate_id AS "aggregateId", payload, status, attempts, last_error AS "lastError",
        available_at AS "availableAt", processed_at AS "processedAt", created_at AS "createdAt"`;

    // Process in creation order.
    claimed.sort((a, b) => (a.sequence < b.sequence ? -1 : 1));
    for (const event of claimed) await this.dispatch(event);
    return claimed.length;
  }

  /** Drains all due events (tests and manual operations). */
  async drain(maxBatches = 100): Promise<void> {
    for (let i = 0; i < maxBatches; i += 1) {
      if ((await this.processBatch()) === 0) return;
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    try {
      for (const handler of this.handlers.get(event.eventType) ?? []) {
        await handler.handle(event);
      }
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const failed = event.attempts >= MAX_ATTEMPTS;
      const backoffSeconds = Math.min(2 ** event.attempts, 300);
      this.logger.error(
        { err: error, event_id: event.id, event_type: event.eventType, attempts: event.attempts },
        failed ? 'Outbox event failed permanently' : 'Outbox event failed; will retry',
      );
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: failed ? 'FAILED' : 'PENDING',
          availableAt: new Date(Date.now() + backoffSeconds * 1000),
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        },
      });
    }
  }
}
