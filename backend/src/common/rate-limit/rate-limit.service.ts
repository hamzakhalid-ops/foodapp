import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { type RateLimitRule } from '../../config/env.schema';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { ApiException } from '../http/api.exception';
import { sha256 } from '../security/secrets';

/**
 * Fixed-window rate limiting on Redis (ADR-0003; AUTH_AUTHORIZATION §17–19, §104).
 *
 * Keys are hashed so that identifiers (emails, phone numbers, IPs) are not stored in Redis in
 * clear text. Fails closed: if Redis is unavailable the request is rejected (§115).
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(bucket: string, subject: string, rule: RateLimitRule): Promise<void> {
    const key = `quickbite:rl:${bucket}:${sha256(subject)}`;
    let count: number;
    let ttl: number;
    try {
      const results = await this.redis
        .multi()
        .incr(key)
        .expire(key, rule.windowSeconds, 'NX')
        .ttl(key)
        .exec();
      if (!results) throw new Error('Rate-limit transaction aborted');
      count = Number(results[0]?.[1]);
      ttl = Number(results[2]?.[1]);
    } catch (error) {
      this.logger.error({ err: error, bucket }, 'Rate limiter unavailable; failing closed');
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'INTERNAL_ERROR',
        'The service is temporarily unavailable. Please try again.',
      );
    }

    if (count > rule.max) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many requests. Please try again later.',
        { retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds },
      );
    }
  }
}
