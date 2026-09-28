import { createHarness, type Harness } from './auth-harness';

/** Slice 2 — Customer Profile (IMPLEMENTATION_PLAN §7). */
describe('Slice 2 — customer profile and addresses', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  beforeEach(async () => {
    await h.reset();
  });
  afterAll(async () => {
    await h.app.close();
  });

  const address = {
    label: 'Home',
    recipientName: 'Ali Khan',
    phone: '+92 300 1234567',
    addressLine1: 'Example Street 1',
    area: 'Model Town',
    city: 'Lahore',
    postalCode: '54000',
    latitude: 31.48,
    longitude: 74.32,
    deliveryInstructions: 'Call on arrival',
  };

  it('reads and updates only the caller profile', async () => {
    const customer = await h.actor('CUSTOMER');
    const profile = await h
      .http()
      .get('/api/v1/customer/profile')
      .set('Authorization', customer.auth)
      .expect(200);
    expect(profile.body).toMatchObject({
      data: { firstName: 'Test', lastName: 'Customer', profileImageUrl: null },
    });

    const updated = await h
      .http()
      .patch('/api/v1/customer/profile')
      .set('Authorization', customer.auth)
      .send({ firstName: 'Sara', profileImageUrl: 'https://cdn.example.com/p.png' })
      .expect(200);
    expect(updated.body).toMatchObject({ data: { firstName: 'Sara', lastName: 'Customer' } });

    // Mass assignment protection: unknown fields are rejected.
    await h
      .http()
      .patch('/api/v1/customer/profile')
      .set('Authorization', customer.auth)
      .send({ userId: 'x' })
      .expect(400);
    await h
      .http()
      .patch('/api/v1/customer/profile')
      .set('Authorization', customer.auth)
      .send({ profileImageUrl: 'http://insecure' })
      .expect(400);
  });

  it('requires the CUSTOMER role', async () => {
    const rider = await h.actor('RIDER');
    const response = await h
      .http()
      .get('/api/v1/customer/profile')
      .set('Authorization', rider.auth)
      .expect(403);
    expect(response.body).toMatchObject({ error: { code: 'AUTHZ_INSUFFICIENT_PERMISSION' } });
  });

  it('creates, lists, updates and deletes addresses with normalized phone and one default', async () => {
    const customer = await h.actor('CUSTOMER');
    const first = await h
      .http()
      .post('/api/v1/customer/addresses')
      .set('Authorization', customer.auth)
      .send({ ...address, isDefault: true })
      .expect(201);
    const firstId = (first.body as { data: { id: string } }).data.id;
    expect(first.body).toMatchObject({
      data: { phone: '+923001234567', latitude: 31.48, isDefault: true },
    });

    const second = await h
      .http()
      .post('/api/v1/customer/addresses')
      .set('Authorization', customer.auth)
      .send({ ...address, label: 'Work', isDefault: true })
      .expect(201);
    const secondId = (second.body as { data: { id: string } }).data.id;

    let list = await h
      .http()
      .get('/api/v1/customer/addresses')
      .set('Authorization', customer.auth)
      .expect(200);
    let rows = (list.body as { data: { id: string; isDefault: boolean }[] }).data;
    expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([secondId]);

    await h
      .http()
      .post(`/api/v1/customer/addresses/${firstId}/default`)
      .set('Authorization', customer.auth)
      .expect(200);
    list = await h
      .http()
      .get('/api/v1/customer/addresses')
      .set('Authorization', customer.auth)
      .expect(200);
    rows = (list.body as { data: { id: string; isDefault: boolean }[] }).data;
    expect(rows[0]).toMatchObject({ id: firstId, isDefault: true });
    expect(rows.filter((row) => row.isDefault)).toHaveLength(1);

    await h
      .http()
      .patch(`/api/v1/customer/addresses/${secondId}`)
      .set('Authorization', customer.auth)
      .send({ city: 'Karachi' })
      .expect(200);
    await h
      .http()
      .delete(`/api/v1/customer/addresses/${secondId}`)
      .set('Authorization', customer.auth)
      .expect(204);
    list = await h
      .http()
      .get('/api/v1/customer/addresses')
      .set('Authorization', customer.auth)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(1);
  });

  it('keeps exactly one default under concurrent default changes', async () => {
    const customer = await h.actor('CUSTOMER');
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await h
        .http()
        .post('/api/v1/customer/addresses')
        .set('Authorization', customer.auth)
        .send(address)
        .expect(201);
      ids.push((r.body as { data: { id: string } }).data.id);
    }
    const results = await Promise.all(
      ids.map((id) =>
        h
          .http()
          .post(`/api/v1/customer/addresses/${id}/default`)
          .set('Authorization', customer.auth),
      ),
    );
    for (const r of results) expect(r.status).toBe(200);
    await expect(
      h.prisma.address.count({ where: { userId: customer.userId, isDefault: true } }),
    ).resolves.toBe(1);
  });

  it.each([
    ['latitude out of range', { latitude: 91 }],
    ['longitude out of range', { longitude: -181 }],
    ['coordinates as strings', { latitude: '31.48' }],
    ['missing city', { city: '' }],
    ['local phone format', { phone: '03001234567' }],
  ])('rejects %s', async (_label, override) => {
    const customer = await h.actor('CUSTOMER');
    const response = await h
      .http()
      .post('/api/v1/customer/addresses')
      .set('Authorization', customer.auth)
      .send({ ...address, ...override })
      .expect(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('isolates addresses between customers (no IDOR)', async () => {
    const owner = await h.actor('CUSTOMER');
    const other = await h.actor('CUSTOMER');
    const created = await h
      .http()
      .post('/api/v1/customer/addresses')
      .set('Authorization', owner.auth)
      .send(address)
      .expect(201);
    const id = (created.body as { data: { id: string } }).data.id;

    await h
      .http()
      .patch(`/api/v1/customer/addresses/${id}`)
      .set('Authorization', other.auth)
      .send({ city: 'X' })
      .expect(404);
    await h
      .http()
      .delete(`/api/v1/customer/addresses/${id}`)
      .set('Authorization', other.auth)
      .expect(404);
    await h
      .http()
      .post(`/api/v1/customer/addresses/${id}/default`)
      .set('Authorization', other.auth)
      .expect(404);
    const list = await h
      .http()
      .get('/api/v1/customer/addresses')
      .set('Authorization', other.auth)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toEqual([]);
    await expect(h.prisma.address.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      city: 'Lahore',
    });
  });
});
