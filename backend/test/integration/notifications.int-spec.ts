import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { RealtimeGateway } from '../../src/infrastructure/realtime/realtime.gateway';
import {
  NOTIFICATION_SENDER,
  type NotificationSender,
  PermanentDeliveryError,
} from '../../src/modules/notifications/notification-sender';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { type Actor, createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Notifications and realtime (NOTIFICATION_RULES, REALTIME_SPEC, API_SPEC §90–91). */
describe('Slice 12 — notifications and realtime', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let outbox: OutboxProcessor;
  let notifications: NotificationsService;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
    outbox = h.app.get(OutboxProcessor);
    notifications = h.app.get(NotificationsService);
    await h.app.listen(0, '127.0.0.1');
    const { port } = h.app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });
  beforeEach(async () => {
    await h.reset();
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await h.app.close();
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;
  const error = (body: unknown) => (body as { error: { code: string } }).error.code;
  const typesOf = async (userId: string) =>
    (
      await h.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    ).map((row) => row.type);

  describe('notifications', () => {
    it('notifies the customer and the restaurant about a new cash order, exactly once', async () => {
      const { customer, restaurant } = await f.placeOrder();
      await outbox.drain();
      expect(await typesOf(customer.userId)).toEqual(['ORDER_CREATED']);
      expect(await typesOf(restaurant.owner.userId)).toEqual(['RESTAURANT_NEW_ORDER']);

      // Re-delivering the same outbox events never duplicates notifications.
      await h.prisma.outboxEvent.updateMany({
        data: { status: 'PENDING', availableAt: new Date() },
      });
      await outbox.drain();
      expect(await h.prisma.notification.count()).toBe(2);
    });

    it('tells the restaurant about an online order only after payment succeeds', async () => {
      const { restaurant, customer, orderId } = await f.placeOrder({
        paymentMethod: 'ONLINE_PAYMENT',
      });
      await outbox.drain();
      expect(await typesOf(restaurant.owner.userId)).toEqual([]);
      const started = await h
        .http()
        .post('/api/v1/payments')
        .set('Authorization', customer.auth)
        .set('Idempotency-Key', 'notify-pay-1')
        .send({ orderId, paymentMethod: 'ONLINE_PAYMENT' })
        .expect(201);
      const payment = await h.prisma.payment.findUniqueOrThrow({
        where: { id: data<{ id: string }>(started.body).id },
      });
      await h
        .http()
        .post(`/api/v1/sandbox/payments/${payment.providerPaymentId ?? ''}/outcome`)
        .send({ outcome: 'AUTHORIZED' })
        .expect(200);
      await h
        .http()
        .post(`/api/v1/sandbox/payments/${payment.providerPaymentId ?? ''}/outcome`)
        .send({ outcome: 'SUCCEEDED' })
        .expect(200);
      await outbox.drain();
      expect(await typesOf(restaurant.owner.userId)).toEqual(['RESTAURANT_NEW_ORDER']);
      expect(await typesOf(customer.userId)).toEqual(['ORDER_CREATED', 'PAYMENT_SUCCEEDED']);
    });

    it('queues push only for registered devices and respects preferences', async () => {
      const customer = await h.actor('CUSTOMER');
      await h
        .http()
        .put('/api/v1/notifications/devices')
        .set('Authorization', customer.auth)
        .send({ deviceId: 'phone-1', platform: 'ANDROID', pushToken: 'token-abc' })
        .expect(204);
      await notifications.notify({
        userId: customer.userId,
        type: 'ORDER_ACCEPTED',
        vars: { orderNumber: 'QB-1', restaurantName: 'Test' },
        data: {},
        dedupKey: 'test-1',
      });
      const push = await h.prisma.notificationDelivery.findFirstOrThrow({
        where: { channel: 'PUSH' },
      });
      expect(push.status).toBe('PENDING');
      await notifications.processDeliveries();
      expect(
        (await h.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: push.id } })).status,
      ).toBe('SENT');

      await h
        .http()
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', customer.auth)
        .send({ preferences: [{ category: 'ORDER', channel: 'PUSH', enabled: false }] })
        .expect(200);
      await notifications.notify({
        userId: customer.userId,
        type: 'ORDER_PREPARING',
        vars: { orderNumber: 'QB-1', restaurantName: 'Test' },
        data: {},
        dedupKey: 'test-2',
      });
      expect(await h.prisma.notificationDelivery.count({ where: { channel: 'PUSH' } })).toBe(1);
      expect(await h.prisma.notificationDelivery.count({ where: { channel: 'IN_APP' } })).toBe(2);
      const mandatory = await h
        .http()
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', customer.auth)
        .send({ preferences: [{ category: 'SECURITY', channel: 'EMAIL', enabled: false }] })
        .expect(422);
      expect(error(mandatory.body)).toBe('VALIDATION_ERROR');
    });

    it('retries transient delivery failures and gives up on permanent ones', async () => {
      const customer = await h.actor('CUSTOMER');
      await h.prisma.deviceToken.create({
        data: { userId: customer.userId, deviceId: 'd', platform: 'IOS', pushToken: 't' },
      });
      const sender = h.app.get<NotificationSender>(NOTIFICATION_SENDER);
      const spy = jest.spyOn(sender, 'send').mockRejectedValueOnce(new Error('provider timeout'));
      await notifications.notify({
        userId: customer.userId,
        type: 'PAYMENT_FAILED',
        vars: { orderNumber: 'QB-9' },
        data: {},
        dedupKey: 'retry-1',
      });
      await notifications.processDeliveries();
      const retried = await h.prisma.notificationDelivery.findFirstOrThrow({
        where: { channel: 'PUSH' },
      });
      expect(retried).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        lastError: 'provider timeout',
      });
      expect(retried.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

      spy.mockRejectedValueOnce(new PermanentDeliveryError('invalid token'));
      await h.prisma.notificationDelivery.update({
        where: { id: retried.id },
        data: { nextAttemptAt: new Date() },
      });
      await notifications.processDeliveries();
      expect(
        (await h.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: retried.id } }))
          .status,
      ).toBe('FAILED');
    });

    it('lists, reads and marks all read for the owner only', async () => {
      const { customer } = await f.placeOrder();
      await outbox.drain();
      const list = await h
        .http()
        .get('/api/v1/notifications?read=false')
        .set('Authorization', customer.auth)
        .expect(200);
      const [first] = data<{ id: string }[]>(list.body);
      expect((list.body as { meta: { unreadCount: number } }).meta.unreadCount).toBe(1);
      const stranger = await h.actor('CUSTOMER');
      await h
        .http()
        .post(`/api/v1/notifications/${first?.id ?? ''}/read`)
        .set('Authorization', stranger.auth)
        .expect(404);
      const read = await h
        .http()
        .post(`/api/v1/notifications/${first?.id ?? ''}/read`)
        .set('Authorization', customer.auth)
        .expect(200);
      expect(data<{ readAt: string | null }>(read.body).readAt).not.toBeNull();
      const all = await h
        .http()
        .post('/api/v1/notifications/read-all')
        .set('Authorization', customer.auth)
        .expect(200);
      expect(data(all.body)).toEqual({ updated: 0 });
    });
  });

  describe('realtime', () => {
    const connect = (token?: string) => {
      const socket = io(url, {
        path: '/realtime',
        transports: ['websocket'],
        auth: token ? { token } : {},
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      return socket;
    };
    const ready = (socket: Socket) =>
      new Promise<void>((resolve, reject) => {
        socket.once('session.ready', () => {
          resolve();
        });
        socket.once('connect_error', reject);
      });
    const subscribe = (socket: Socket, channel: string) =>
      socket.emitWithAck('subscribe', { channel }) as Promise<{
        ok: boolean;
        error?: { code: string };
      }>;

    it('rejects connections without a valid token', async () => {
      const socket = connect();
      const failure = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
      expect(failure.message).toBe('AUTH_TOKEN_INVALID');
      const bad = connect('not-a-token');
      expect(
        (await new Promise<Error>((resolve) => bad.once('connect_error', resolve))).message,
      ).toBe('AUTH_TOKEN_INVALID');
    });

    it('authorizes subscriptions server-side and delivers order events with an envelope', async () => {
      const { customer, restaurant, orderId } = await f.placeOrder();
      await outbox.drain();
      const other = await h.actor('CUSTOMER');
      const socket = connect(customer.token);
      await ready(socket);
      expect(await subscribe(socket, `order:${orderId}`)).toEqual({
        ok: true,
        channel: `order:${orderId}`,
      });
      expect((await subscribe(socket, `restaurant:${restaurant.restaurantId}`)).ok).toBe(false);
      expect((await subscribe(socket, `user:${other.userId}`)).error?.code).toBe('AUTHZ_FORBIDDEN');
      expect((await subscribe(socket, 'admin:operations')).ok).toBe(false);

      const intruder = connect(other.token);
      await ready(intruder);
      expect((await subscribe(intruder, `order:${orderId}`)).ok).toBe(false);

      const received = new Promise<Record<string, unknown>>((resolve) =>
        socket.on('order.status_changed', (envelope: Record<string, unknown>) => {
          if (envelope.channel === `order:${orderId}`) resolve(envelope);
        }),
      );
      await h
        .http()
        .post(`/api/v1/restaurant/orders/${orderId}/accept`)
        .set('Authorization', restaurant.owner.auth)
        .send({})
        .expect(200);
      await outbox.drain();
      const envelope = await received;
      expect(envelope).toMatchObject({
        eventType: 'order.status_changed',
        version: 1,
        resourceType: 'order',
        resourceId: orderId,
        channel: `order:${orderId}`,
        data: { orderId, fromStatus: 'PENDING', toStatus: 'RESTAURANT_ACCEPTED' },
      });
      expect(typeof envelope.eventId).toBe('string');
      expect(envelope.sequence).toEqual(expect.any(Number));
    });

    it('disconnects sockets whose session was revoked', async () => {
      const customer: Actor = await h.actor('CUSTOMER');
      const socket = connect(customer.token);
      await ready(socket);
      const closed = new Promise<void>((resolve) =>
        socket.once('disconnect', () => {
          resolve();
        }),
      );
      await h.http().post('/api/v1/auth/logout').set('Authorization', customer.auth).expect(204);
      await h.app.get(RealtimeGateway).revalidateSessions();
      await closed;
      expect(socket.connected).toBe(false);
    });
  });
});
