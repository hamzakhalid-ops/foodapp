import { Body, Controller, Get, Post } from '@nestjs/common';
import { Idempotent } from '../../src/common/idempotency/idempotent.decorator';
import { type Redis } from 'ioredis';
import { type AuthContext, CurrentAuth, Roles } from '../../src/common/auth/auth.decorators';
import request from 'supertest';
import {
  VERIFICATION_SENDER,
  type VerificationSender,
} from '../../src/modules/auth/delivery/verification-sender';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis.module';
import { createTestApp, type TestApp } from '../create-test-app';

/** Records what would have been delivered so tests can complete verification flows. */
export class CapturingSender implements VerificationSender {
  phoneCodes: { phone: string; code: string }[] = [];
  emailTokens: { email: string; token: string }[] = [];
  resetTokens: { channel: 'email' | 'phone'; target: string; token: string }[] = [];

  sendPhoneVerificationCode(phone: string, code: string): Promise<void> {
    this.phoneCodes.push({ phone, code });
    return Promise.resolve();
  }
  sendEmailVerificationToken(email: string, token: string): Promise<void> {
    this.emailTokens.push({ email, token });
    return Promise.resolve();
  }
  sendPasswordResetToken(channel: 'email' | 'phone', target: string, token: string): Promise<void> {
    this.resetTokens.push({ channel, target, token });
    return Promise.resolve();
  }
  lastPhoneCode(): string {
    const last = this.phoneCodes.at(-1);
    if (!last) throw new Error('No phone code captured');
    return last.code;
  }
  clear(): void {
    this.phoneCodes = [];
    this.emailTokens = [];
    this.resetTokens = [];
  }
}

/**
 * Test-only routes exercising the global guards: default (verified account required) and a
 * role-restricted route. Not part of the application.
 */
@Controller('__test__')
export class GuardProbeController {
  @Get('verified')
  verified(@CurrentAuth() auth: AuthContext): { userId: string } {
    return { userId: auth.userId };
  }

  @Roles('ADMIN')
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

/** Counts executions to prove idempotent replays do not re-run the handler. */
@Controller('__test__/idempotent')
export class IdempotencyProbeController {
  static executions = 0;

  @Post()
  @Idempotent()
  create(@Body() body: { value?: string }): { execution: number; value: string | null } {
    IdempotencyProbeController.executions += 1;
    if (body.value === 'fail') throw new Error('probe failure');
    return { execution: IdempotencyProbeController.executions, value: body.value ?? null };
  }
}

export interface Harness {
  app: TestApp;
  sender: CapturingSender;
  prisma: PrismaService;
  redis: Redis;
  http: () => ReturnType<typeof request>;
  reset: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const sender = new CapturingSender();
  const app = await createTestApp(
    (builder) => builder.overrideProvider(VERIFICATION_SENDER).useValue(sender),
    [GuardProbeController, IdempotencyProbeController],
  );
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS_CLIENT);

  return {
    app,
    sender,
    prisma,
    redis,
    http: () => request(app.getHttpServer()),
    // Integration databases/Redis are disposable test services (TESTING_SPEC §71).
    reset: async () => {
      const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      await prisma.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
      await redis.flushdb();
      sender.clear();
    },
  };
}

export const PASSWORD = 'correct horse battery';

let counter = 0;
export function newCustomer(overrides: Partial<Record<string, string>> = {}) {
  counter += 1;
  const suffix = `${Date.now() % 1_000_000}${counter}`.padStart(7, '0').slice(-7);
  return {
    email: `customer${suffix}@example.com`,
    phone: `+92300${suffix}`,
    password: PASSWORD,
    firstName: 'Ali',
    lastName: 'Khan',
    ...overrides,
  };
}
