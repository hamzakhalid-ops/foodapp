import { Inject, Injectable } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';

const GEO_KEY = 'riders:locations';
const META_PREFIX = 'riders:location:';

export interface RiderLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: Date;
}

export interface NearbyRider {
  riderId: string;
  distanceKm: number;
  recordedAt: Date;
}

/**
 * Current rider locations in Redis (DATABASE.md §34, DISPATCH_RULES §31–33): a GEO set for
 * proximity search plus the fix time for staleness checks. Operational data only — never the
 * source of truth for assignment.
 */
@Injectable()
export class RiderLocationStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(riderId: string, location: RiderLocation): Promise<void> {
    await this.redis
      .multi()
      .geoadd(GEO_KEY, location.longitude, location.latitude, riderId)
      .set(
        META_PREFIX + riderId,
        JSON.stringify({
          accuracyMeters: location.accuracyMeters,
          recordedAt: location.recordedAt.toISOString(),
        }),
      )
      .exec();
  }

  async remove(riderId: string): Promise<void> {
    await this.redis
      .multi()
      .zrem(GEO_KEY, riderId)
      .del(META_PREFIX + riderId)
      .exec();
  }

  /** Riders within `radiusKm` of a point, nearest first, with the time of their last fix. */
  async nearby(latitude: number, longitude: number, radiusKm: number): Promise<NearbyRider[]> {
    const hits = (await this.redis.geosearch(
      GEO_KEY,
      'FROMLONLAT',
      longitude,
      latitude,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'WITHDIST',
    )) as [string, string][];
    if (hits.length === 0) return [];
    const metas = await this.redis.mget(hits.map(([riderId]) => META_PREFIX + riderId));
    return hits.flatMap(([riderId, distance], index) => {
      const meta = metas[index];
      if (!meta) return [];
      const { recordedAt } = JSON.parse(meta) as { recordedAt: string };
      return [{ riderId, distanceKm: Number(distance), recordedAt: new Date(recordedAt) }];
    });
  }

  async get(riderId: string): Promise<RiderLocation | null> {
    const [position] = await this.redis.geopos(GEO_KEY, riderId);
    const meta = await this.redis.get(META_PREFIX + riderId);
    if (!position?.[0] || !position[1] || !meta) return null;
    const parsed = JSON.parse(meta) as { accuracyMeters: number | null; recordedAt: string };
    return {
      longitude: Number(position[0]),
      latitude: Number(position[1]),
      accuracyMeters: parsed.accuracyMeters,
      recordedAt: new Date(parsed.recordedAt),
    };
  }
}
