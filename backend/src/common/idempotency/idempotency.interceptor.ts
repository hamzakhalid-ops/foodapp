import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { IDEMPOTENCY_KEY_HEADER } from '@quickbite/types';
import { type Request, type Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { type RequestWithAuth } from '../auth/auth.decorators';
import { ApiException } from '../http/api.exception';
import { sha256 } from '../security/secrets';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const TTL_MS = 24 * 3600 * 1000;
const SAFE_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

/**
 * Idempotency for retry-sensitive operations (API_SPEC §15):
 * - same key + same request  → the stored response is replayed (no second execution);
 * - same key + different body → IDEMPOTENCY_REQUEST_MISMATCH;
 * - same key while the first request is still running → IDEMPOTENCY_KEY_REUSED.
 * Only successful responses are stored; a failed attempt releases the key so it can be retried.
 * Keys are scoped per user and per endpoint.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.handle(context, next));
  }

  private async handle(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & RequestWithAuth>();
    const response = http.getResponse<Response>();
    const userId = request.auth?.userId;
    if (!userId) throw new Error('@Idempotent() requires an authenticated route');

    const key = request.get(IDEMPOTENCY_KEY_HEADER);
    if (!key || !SAFE_KEY.test(key)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        `An ${IDEMPOTENCY_KEY_HEADER} header (8-128 safe characters) is required.`,
      );
    }
    const route = request.route as { path?: string } | undefined;
    const endpoint = `${request.method} ${route?.path ?? request.path}`;
    const body: unknown = request.body;
    const requestHash = sha256(JSON.stringify({ params: request.params, body: body ?? null }));

    const record = await this.claim(userId, endpoint, key, requestHash);
    if (record.replay) {
      response.setHeader('Idempotent-Replayed', 'true');
      return record.body;
    }
    const status =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ??
      (request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    try {
      const result: unknown = await lastValueFrom(next.handle(), { defaultValue: null });
      await this.prisma.idempotencyKey.update({
        where: { id: record.id },
        data: {
          responseStatus: status,
          responseBody: (result ?? null) as Prisma.InputJsonValue,
        },
      });
      return result;
    } catch (error) {
      await this.prisma.idempotencyKey.delete({ where: { id: record.id } }).catch(() => undefined);
      throw error;
    }
  }

  private async claim(
    userId: string,
    endpoint: string,
    key: string,
    requestHash: string,
  ): Promise<{ replay: true; status: number; body: unknown } | { replay: false; id: string }> {
    const now = new Date();
    // Expired keys may be reused.
    await this.prisma.idempotencyKey.deleteMany({
      where: { userId, endpoint, key, expiresAt: { lte: now } },
    });
    try {
      const created = await this.prisma.idempotencyKey.create({
        data: { userId, endpoint, key, requestHash, expiresAt: new Date(now.getTime() + TTL_MS) },
      });
      return { replay: false, id: created.id };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
    }
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_endpoint_key: { userId, endpoint, key } },
    });
    if (!existing) return this.claim(userId, endpoint, key, requestHash);
    if (existing.requestHash !== requestHash) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'IDEMPOTENCY_REQUEST_MISMATCH',
        'This Idempotency-Key was already used with a different request.',
      );
    }
    if (existing.responseStatus === null) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_KEY_REUSED',
        'A request with this Idempotency-Key is still being processed.',
      );
    }
    return { replay: true, status: existing.responseStatus, body: existing.responseBody };
  }
}
