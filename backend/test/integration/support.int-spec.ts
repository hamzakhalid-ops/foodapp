import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { type Actor, createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/** Slice 17 — Support (IMPLEMENTATION_PLAN §22, SUPPORT_RULES). */
describe('Slice 14 — support', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let admin: Actor;
  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
  });
  beforeEach(async () => {
    await h.reset();
    admin = await h.actor('ADMIN');
  });
  afterAll(async () => {
    await h.app.close();
  });

  const error = (body: unknown) => (body as { error: { code: string } }).error.code;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;
  interface Ticket {
    id: string;
    ticketNumber: string;
    status: string;
    priority: string;
    messages: {
      message: string;
      internal: boolean;
      fromSupport: boolean;
      attachments: { url: string }[];
    }[];
  }

  const open = (actor: Actor, body: object) =>
    h.http().post('/api/v1/support/tickets').set('Authorization', actor.auth).send(body);
  const adminPost = (url: string, body: object = {}) =>
    h
      .http()
      .post(`/api/v1/admin/support/tickets${url}`)
      .set('Authorization', admin.auth)
      .send(body);

  it('creates customer tickets with validated categories, order references and priorities', async () => {
    const { customer, orderId } = await f.placeOrder();
    const created = await open(customer, {
      subject: 'Missing item',
      category: 'ORDER_PROBLEM',
      message: 'The raita was missing.',
      orderId,
    }).expect(201);
    const ticket = data<Ticket>(created.body);
    expect(ticket).toMatchObject({
      status: 'OPEN',
      priority: 'NORMAL',
      messages: [{ message: 'The raita was missing.' }],
    });
    expect(ticket.ticketNumber).toMatch(/^QB-SUP-\d{6}$/);

    await open(customer, { subject: 'x', category: 'SETTLEMENT_PROBLEM', message: 'x' }).expect(
      400,
    );
    await open(customer, {
      subject: 'x',
      category: 'OTHER',
      message: 'x',
      priority: 'URGENT',
    }).expect(400);
    const stranger = await h.actor('CUSTOMER');
    await open(stranger, { subject: 'x', category: 'ORDER_PROBLEM', message: 'x', orderId }).expect(
      404,
    );
    const safety = await open(customer, {
      subject: 'Rider threatened me',
      category: 'SAFETY_REPORT',
      message: '...',
    }).expect(201);
    expect(data<Ticket>(safety.body).priority).toBe('URGENT');
  });

  it('isolates tickets: own tickets for customers and riders, shared per restaurant for staff', async () => {
    const customer = await h.actor('CUSTOMER');
    const ticket = data<Ticket>(
      (
        await open(customer, { subject: 'App', category: 'APP_PROBLEM', message: 'Crash' }).expect(
          201,
        )
      ).body,
    );
    const other = await h.actor('CUSTOMER');
    await h
      .http()
      .get(`/api/v1/support/tickets/${ticket.id}`)
      .set('Authorization', other.auth)
      .expect(404);
    expect(
      data<unknown[]>(
        (await h.http().get('/api/v1/support/tickets').set('Authorization', other.auth).expect(200))
          .body,
      ),
    ).toHaveLength(0);

    const restaurant = await h.restaurant();
    const operator = await h.actor('RESTAURANT_OPERATOR');
    await h.prisma.restaurantStaff.create({
      data: { restaurantId: restaurant.restaurantId, userId: operator.userId, role: 'OPERATOR' },
    });
    const staffTicket = data<Ticket>(
      (
        await open(restaurant.owner, {
          subject: 'Menu',
          category: 'MENU_PROBLEM',
          message: 'Cannot upload image',
        }).expect(201)
      ).body,
    );
    await h
      .http()
      .get(`/api/v1/support/tickets/${staffTicket.id}`)
      .set('Authorization', operator.auth)
      .expect(200);
    const outsider = await h.restaurant();
    await h
      .http()
      .get(`/api/v1/support/tickets/${staffTicket.id}`)
      .set('Authorization', outsider.owner.auth)
      .expect(404);
    await open(restaurant.owner, { subject: 'x', category: 'REFUND_PROBLEM', message: 'x' }).expect(
      400,
    );
  });

  it('runs the support conversation with internal notes, attachments and the status lifecycle', async () => {
    const customer = await h.actor('CUSTOMER');
    const ticket = data<Ticket>(
      (
        await open(customer, {
          subject: 'Refund',
          category: 'REFUND_PROBLEM',
          message: 'Where is my refund?',
        }).expect(201)
      ).body,
    );

    await adminPost(`/${ticket.id}/assign`, { assigneeId: customer.userId }).expect(400);
    const assigned = await adminPost(`/${ticket.id}/assign`, { assigneeId: admin.userId }).expect(
      200,
    );
    expect(data(assigned.body)).toMatchObject({ status: 'IN_PROGRESS', assignedTo: admin.userId });

    await adminPost(`/${ticket.id}/messages`, {
      message: 'Checking with finance',
      internal: true,
    }).expect(201);
    await adminPost(`/${ticket.id}/messages`, { message: 'Could you share a screenshot?' }).expect(
      201,
    );
    await h
      .http()
      .patch(`/api/v1/admin/support/tickets/${ticket.id}`)
      .set('Authorization', admin.auth)
      .send({ status: 'WAITING_FOR_CUSTOMER' })
      .expect(200);

    const withFile = await h
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/messages`)
      .set('Authorization', customer.auth)
      .field('message', 'Here it is')
      .attach('file', PNG, 'proof.png')
      .expect(201);
    const view = data<Ticket>(withFile.body);
    expect(view.status).toBe('IN_PROGRESS');
    expect(view.messages.map((m) => m.message)).toEqual([
      'Where is my refund?',
      'Could you share a screenshot?',
      'Here it is',
    ]);
    expect(view.messages.some((m) => m.internal)).toBe(false);
    expect(view.messages[2]?.attachments[0]?.url).toEqual(expect.any(String));
    await h
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/messages`)
      .set('Authorization', customer.auth)
      .field('message', 'exe')
      .attach('file', Buffer.from('MZ....'), 'virus.exe')
      .expect(400);

    const detail = await h
      .http()
      .get(`/api/v1/admin/support/tickets/${ticket.id}`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(data<Ticket>(detail.body).messages.filter((m) => m.internal)).toHaveLength(1);

    await adminPost(`/${ticket.id}/resolve`, { message: 'Refund processed.' }).expect(200);
    const reopened = await h
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/messages`)
      .set('Authorization', customer.auth)
      .send({ message: 'Still not received' })
      .expect(201);
    expect(data<Ticket>(reopened.body).status).toBe('REOPENED');
    const invalid = await h
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/close`)
      .set('Authorization', customer.auth)
      .expect(409);
    expect(error(invalid.body)).toBe('INVALID_REQUEST');
    await adminPost(`/${ticket.id}/resolve`).expect(200);
    await h
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/close`)
      .set('Authorization', customer.auth)
      .expect(200);
    await h
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/messages`)
      .set('Authorization', customer.auth)
      .send({ message: 'x' })
      .expect(409);

    const audits = (await h.prisma.auditLog.findMany({ where: { entityId: ticket.id } })).map(
      (row) => row.action,
    );
    expect(audits).toEqual(
      expect.arrayContaining([
        'SUPPORT_TICKET_ASSIGNED',
        'SUPPORT_INTERNAL_NOTE_ADDED',
        'SUPPORT_TICKET_RESOLVED',
      ]),
    );

    await h.app.get(OutboxProcessor).drain();
    const types = (
      await h.prisma.notification.findMany({ where: { userId: customer.userId } })
    ).map((n) => n.type);
    expect(types.filter((t) => t === 'SUPPORT_TICKET_MESSAGE')).toHaveLength(1); // internal note never notifies
    expect(types).toContain('SUPPORT_TICKET_UPDATED');
    expect(
      await h.prisma.notification.count({
        where: { userId: admin.userId, type: 'SUPPORT_TICKET_CREATED' },
      }),
    ).toBe(1);
  });

  it('keeps the admin queue admin-only', async () => {
    const customer = await h.actor('CUSTOMER');
    await open(customer, { subject: 'x', category: 'OTHER', message: 'Hello' }).expect(201);
    const queue = await h
      .http()
      .get('/api/v1/admin/support/tickets?unassigned=true')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(data<unknown[]>(queue.body)).toHaveLength(1);
    await h
      .http()
      .get('/api/v1/admin/support/tickets')
      .set('Authorization', customer.auth)
      .expect(403);
  });
});
