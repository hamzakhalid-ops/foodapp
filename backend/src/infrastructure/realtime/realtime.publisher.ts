import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

export const REALTIME_PUBSUB_CHANNEL = 'quickbite:realtime';

/** REALTIME_SPEC §15 envelope with camelCase fields (ADR-0014 §7). */
export interface RealtimeEnvelope {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  resourceType: string;
  resourceId: string;
  channel: string;
  sequence: number;
  data: Record<string, unknown>;
}

/**
 * Publishes realtime events from any process (API or worker) over Redis pub/sub; every API
 * instance's gateway fans them out to its sockets in the channel room (REALTIME_SPEC §36–37).
 * `sequence` increases per channel so clients can detect gaps and resync over REST (§19).
 */
@Injectable()
export class RealtimePublisher {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(
    channels: string[],
    event: {
      eventType: string;
      resourceType: string;
      resourceId: string;
      data: Record<string, unknown>;
      version?: number;
    },
  ): Promise<void> {
    const occurredAt = new Date().toISOString();
    for (const channel of new Set(channels)) {
      const sequence = await this.redis.incr(`realtime:seq:${channel}`);
      const envelope: RealtimeEnvelope = {
        eventId: randomUUID(),
        eventType: event.eventType,
        version: event.version ?? 1,
        occurredAt,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        channel,
        sequence,
        data: event.data,
      };
      await this.redis.publish(REALTIME_PUBSUB_CHANNEL, JSON.stringify(envelope));
    }
  }
}
