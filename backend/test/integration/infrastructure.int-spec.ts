import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { OutboxService } from '../../src/common/outbox/outbox.service';
import { SettingsService } from '../../src/common/settings/settings.service';
import {
  createHarness,
  type Harness,
  IdempotencyProbeController,
  newCustomer,
  PASSWORD,
} from './auth-harness';

describe('Shared infrastructure', () => {
  let h: Harness;
  let outbox: OutboxService;
  let processor: OutboxProcessor;

  beforeAll(async () => {
    h = await createHarness();
    outbox = h.app.get(OutboxService);
    processor = h.app.get(OutboxProcessor);
  });
  beforeEach(async () => {
    await h.reset();
  });
  afterAll(async () => {
    await h.app.close();
  });

  describe('outbox', () => {
    it('delivers events written in a business transaction exactly to registered handlers', async () => {
      const seen: string[] = [];
      processor.register('test.delivered', 'collector', (event) => {
        seen.push(event.aggregateId);
        return Promise.resolve();
      });
      await h.prisma.$transaction((tx) =>
        outbox.enqueue(
          tx,
          { eventType: 'test.delivered', aggregateType: 'test', aggregateId: 'a-1', payload: {} },
          { eventType: 'test.delivered', aggregateType: 'test', aggregateId: 'a-2', payload: {} },
        ),
      );
      await processor.drain();
      expect(seen).toEqual(['a-1', 'a-2']);
      await expect(h.prisma.outboxEvent.count({ where: { status: 'PROCESSED' } })).resolves.toBe(2);
      await processor.drain();
      expect(seen).toHaveLength(2);
    });

    it('drops the event when the business transaction rolls back', async () => {
      await expect(
        h.prisma.$transaction(async (tx) => {
          await outbox.enqueue(tx, {
            eventType: 'test.rollback',
            aggregateType: 'test',
            aggregateId: 'x',
            payload: {},
          });
          throw new Error('business failure');
        }),
      ).rejects.toThrow('business failure');
      await expect(h.prisma.outboxEvent.count()).resolves.toBe(0);
    });

    it('retries failed handlers with backoff and marks them FAILED after the attempt limit', async () => {
      processor.register('test.failing', 'always-fails', () =>
        Promise.reject(new Error('provider down')),
      );
      await h.prisma.$transaction((tx) =>
        outbox.enqueue(tx, {
          eventType: 'test.failing',
          aggregateType: 'test',
          aggregateId: 'f',
          payload: {},
        }),
      );
      await processor.processBatch();
      let event = await h.prisma.outboxEvent.findFirstOrThrow();
      expect(event).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'provider down' });
      expect(event.availableAt.getTime()).toBeGreaterThan(Date.now());

      await h.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { attempts: 9, availableAt: new Date() },
      });
      await processor.processBatch();
      event = await h.prisma.outboxEvent.findFirstOrThrow();
      expect(event).toMatchObject({ status: 'FAILED', attempts: 10 });
    });
  });

  describe('idempotency', () => {
    async function token(): Promise<string> {
      const customer = newCustomer();
      await h.http().post('/api/v1/auth/register').send(customer).expect(201);
      const login = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: customer.email, password: PASSWORD });
      const { accessToken } = (login.body as { data: { accessToken: string } }).data;
      await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: h.sender.lastPhoneCode() })
        .expect(200);
      return accessToken;
    }

    it('requires a key, replays the stored response and rejects mismatched reuse', async () => {
      const auth = `Bearer ${await token()}`;
      const before = IdempotencyProbeController.executions;

      const missing = await h
        .http()
        .post('/api/v1/__test__/idempotent')
        .set('Authorization', auth)
        .send({})
        .expect(400);
      expect(missing.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });

      const first = await h
        .http()
        .post('/api/v1/__test__/idempotent')
        .set('Authorization', auth)
        .set('Idempotency-Key', 'key-0001')
        .send({ value: 'a' })
        .expect(201);
      const replay = await h
        .http()
        .post('/api/v1/__test__/idempotent')
        .set('Authorization', auth)
        .set('Idempotency-Key', 'key-0001')
        .send({ value: 'a' })
        .expect(201);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(IdempotencyProbeController.executions).toBe(before + 1);

      const mismatch = await h
        .http()
        .post('/api/v1/__test__/idempotent')
        .set('Authorization', auth)
        .set('Idempotency-Key', 'key-0001')
        .send({ value: 'b' })
        .expect(422);
      expect(mismatch.body).toMatchObject({ error: { code: 'IDEMPOTENCY_REQUEST_MISMATCH' } });
    });

    it('releases the key when the request fails so the client can retry', async () => {
      const auth = `Bearer ${await token()}`;
      await h
        .http()
        .post('/api/v1/__test__/idempotent')
        .set('Authorization', auth)
        .set('Idempotency-Key', 'key-0002')
        .send({ value: 'fail' })
        .expect(500);
      await expect(h.prisma.idempotencyKey.count()).resolves.toBe(0);
    });

    it('executes concurrent duplicates at most once', async () => {
      const auth = `Bearer ${await token()}`;
      const before = IdempotencyProbeController.executions;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          h
            .http()
            .post('/api/v1/__test__/idempotent')
            .set('Authorization', auth)
            .set('Idempotency-Key', 'key-0003')
            .send({ value: 'c' }),
        ),
      );
      expect(IdempotencyProbeController.executions).toBe(before + 1);
      for (const r of results) expect([201, 409]).toContain(r.status);
    });
  });

  describe('settings', () => {
    it('validates values and fails closed when a required setting is missing', async () => {
      const settings = h.app.get(SettingsService);
      await expect(settings.require('pricing.delivery_fee')).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
      await expect(settings.set('pricing.delivery_fee', '-5', null)).rejects.toThrow();
      await settings.set('pricing.delivery_fee', '150.00', null);
      await expect(settings.require('pricing.delivery_fee')).resolves.toBe('150.00');
    });
  });
});
