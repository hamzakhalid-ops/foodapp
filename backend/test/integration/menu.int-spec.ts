import { createHarness, type Harness, type TestRestaurant } from './auth-harness';

/** Slice 4 — Menu (IMPLEMENTATION_PLAN §9) and Slice 5 — Customer Discovery (§10). */
describe('Slice 4 — menu and discovery', () => {
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

  const error = (body: unknown) => (body as { error: { code: string } }).error.code;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;

  interface Item {
    id: string;
    basePrice: string;
    isAvailable: boolean;
    variations: { id: string; name: string; priceAdjustment: string }[];
    addOns: { id: string; price: string }[];
  }

  async function seedMenu(restaurant: TestRestaurant) {
    const auth = restaurant.owner.auth;
    const category = await h
      .http()
      .post('/api/v1/restaurant/menu/categories')
      .set('Authorization', auth)
      .send({ name: 'Karahi', sortOrder: 1 })
      .expect(201);
    const categoryId = data<{ id: string }>(category.body).id;
    const item = await h
      .http()
      .post('/api/v1/restaurant/menu/items')
      .set('Authorization', auth)
      .send({ categoryId, name: 'Chicken Karahi', basePrice: '1200.5' })
      .expect(201);
    const itemId = data<Item>(item.body).id;
    await h
      .http()
      .post(`/api/v1/restaurant/menu/items/${itemId}/variations`)
      .set('Authorization', auth)
      .send({ name: 'Full', priceAdjustment: '800' })
      .expect(201);
    await h
      .http()
      .post(`/api/v1/restaurant/menu/items/${itemId}/add-ons`)
      .set('Authorization', auth)
      .send({ name: 'Extra Naan', price: '60' })
      .expect(201);
    return { categoryId, itemId };
  }

  async function operatorOf(restaurant: TestRestaurant) {
    const operator = await h.actor('RESTAURANT_OPERATOR');
    await h.prisma.restaurantStaff.create({
      data: { restaurantId: restaurant.restaurantId, userId: operator.userId, role: 'OPERATOR' },
    });
    return operator;
  }

  describe('restaurant menu management', () => {
    it('lets the owner build a menu with exact decimal prices', async () => {
      const restaurant = await h.restaurant();
      const { itemId } = await seedMenu(restaurant);
      const response = await h
        .http()
        .get(`/api/v1/restaurant/menu/items/${itemId}`)
        .set('Authorization', restaurant.owner.auth)
        .expect(200);
      const item = data<Item>(response.body);
      expect(item.basePrice).toBe('1200.50');
      expect(item.variations[0]?.priceAdjustment).toBe('800.00');
      expect(item.addOns[0]?.price).toBe('60.00');
    });

    it('rejects negative, malformed and over-precise prices', async () => {
      const restaurant = await h.restaurant();
      const { categoryId } = await seedMenu(restaurant);
      for (const basePrice of ['-1', '12.345', 'abc', 12]) {
        const response = await h
          .http()
          .post('/api/v1/restaurant/menu/items')
          .set('Authorization', restaurant.owner.auth)
          .send({ categoryId, name: 'Bad', basePrice })
          .expect(400);
        expect(error(response.body)).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects a category that belongs to another restaurant', async () => {
      const mine = await h.restaurant();
      const other = await h.restaurant();
      const { categoryId } = await seedMenu(other);
      const response = await h
        .http()
        .post('/api/v1/restaurant/menu/items')
        .set('Authorization', mine.owner.auth)
        .send({ categoryId, name: 'Stolen', basePrice: '10' })
        .expect(404);
      expect(error(response.body)).toBe('RESOURCE_NOT_FOUND');
    });

    it("hides another restaurant's items, variations and add-ons (404)", async () => {
      const mine = await h.restaurant();
      const other = await h.restaurant();
      const { itemId } = await seedMenu(other);
      const variation = await h.prisma.itemVariation.findFirstOrThrow({
        where: { menuItemId: itemId },
      });
      const addOn = await h.prisma.itemAddOn.findFirstOrThrow({ where: { menuItemId: itemId } });
      const auth = mine.owner.auth;
      await h
        .http()
        .get(`/api/v1/restaurant/menu/items/${itemId}`)
        .set('Authorization', auth)
        .expect(404);
      await h
        .http()
        .patch(`/api/v1/restaurant/menu/items/${itemId}`)
        .set('Authorization', auth)
        .send({ basePrice: '1' })
        .expect(404);
      await h
        .http()
        .post(`/api/v1/restaurant/menu/items/${itemId}/availability`)
        .set('Authorization', auth)
        .send({ available: false })
        .expect(404);
      await h
        .http()
        .patch(`/api/v1/restaurant/menu/variations/${variation.id}`)
        .set('Authorization', auth)
        .send({ priceAdjustment: '0' })
        .expect(404);
      await h
        .http()
        .delete(`/api/v1/restaurant/menu/add-ons/${addOn.id}`)
        .set('Authorization', auth)
        .expect(404);
      const unchanged = await h.prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(unchanged.basePrice.toFixed(2)).toBe('1200.50');
    });

    it('lets operators read the menu and toggle availability but not edit it', async () => {
      const restaurant = await h.restaurant();
      const { categoryId, itemId } = await seedMenu(restaurant);
      const operator = await operatorOf(restaurant);
      await h
        .http()
        .get('/api/v1/restaurant/menu/items')
        .set('Authorization', operator.auth)
        .expect(200);
      const toggled = await h
        .http()
        .post(`/api/v1/restaurant/menu/items/${itemId}/availability`)
        .set('Authorization', operator.auth)
        .send({ available: false })
        .expect(200);
      expect(data<Item>(toggled.body).isAvailable).toBe(false);
      const denied = await h
        .http()
        .patch(`/api/v1/restaurant/menu/items/${itemId}`)
        .set('Authorization', operator.auth)
        .send({ basePrice: '1' })
        .expect(403);
      expect(error(denied.body)).toBe('AUTHZ_INSUFFICIENT_PERMISSION');
      await h
        .http()
        .post('/api/v1/restaurant/menu/categories')
        .set('Authorization', operator.auth)
        .send({ name: 'Nope' })
        .expect(403);
      await h
        .http()
        .delete(`/api/v1/restaurant/menu/categories/${categoryId}`)
        .set('Authorization', operator.auth)
        .expect(403);
    });

    it('refuses menu access to customers and anonymous callers', async () => {
      const customer = await h.actor('CUSTOMER');
      await h
        .http()
        .get('/api/v1/restaurant/menu/items')
        .set('Authorization', customer.auth)
        .expect(403);
      await h.http().get('/api/v1/restaurant/menu/items').expect(401);
    });

    it('allows menu setup only after approval', async () => {
      const restaurant = await h.restaurant();
      await h.prisma.restaurant.update({
        where: { id: restaurant.restaurantId },
        data: { approvalStatus: 'SUBMITTED' },
      });
      const response = await h
        .http()
        .post('/api/v1/restaurant/menu/categories')
        .set('Authorization', restaurant.owner.auth)
        .send({ name: 'Early' })
        .expect(409);
      expect(error(response.body)).toBe('RESTAURANT_NOT_APPROVED');
    });

    it('deletes only empty categories and cascades item options on item deletion', async () => {
      const restaurant = await h.restaurant();
      const { categoryId, itemId } = await seedMenu(restaurant);
      const auth = restaurant.owner.auth;
      const blocked = await h
        .http()
        .delete(`/api/v1/restaurant/menu/categories/${categoryId}`)
        .set('Authorization', auth)
        .expect(409);
      expect(error(blocked.body)).toBe('INVALID_REQUEST');
      await h
        .http()
        .delete(`/api/v1/restaurant/menu/items/${itemId}`)
        .set('Authorization', auth)
        .expect(204);
      expect(await h.prisma.itemVariation.count({ where: { menuItemId: itemId } })).toBe(0);
      expect(await h.prisma.itemAddOn.count({ where: { menuItemId: itemId } })).toBe(0);
      await h
        .http()
        .delete(`/api/v1/restaurant/menu/categories/${categoryId}`)
        .set('Authorization', auth)
        .expect(204);
    });

    it('moves an item between its own categories only', async () => {
      const restaurant = await h.restaurant();
      const { itemId } = await seedMenu(restaurant);
      const auth = restaurant.owner.auth;
      const second = await h
        .http()
        .post('/api/v1/restaurant/menu/categories')
        .set('Authorization', auth)
        .send({ name: 'Drinks' })
        .expect(201);
      const secondId = data<{ id: string }>(second.body).id;
      const moved = await h
        .http()
        .patch(`/api/v1/restaurant/menu/items/${itemId}`)
        .set('Authorization', auth)
        .send({ categoryId: secondId, description: 'Now a drink' })
        .expect(200);
      expect(data<{ categoryId: string }>(moved.body).categoryId).toBe(secondId);
      const listed = await h
        .http()
        .get(`/api/v1/restaurant/menu/items?categoryId=${secondId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(data<Item[]>(listed.body)).toHaveLength(1);
    });
  });

  describe('customer discovery (public)', () => {
    interface Summary {
      id: string;
      name: string;
      status: string;
      isOrderableNow: boolean;
      distanceKm: number | null;
      deliversToLocation: boolean | null;
      deliveryFee: string | null;
      minimumOrderAmount: string | null;
    }

    it('lists visible restaurants with distance, delivery reach and orderability', async () => {
      const near = await h.restaurant({ name: 'Near Grill', deliveryRadius: 3 });
      // ~11 km north of the caller
      await h.restaurant({ name: 'Far Tikka', latitude: 31.62, deliveryRadius: 5 });
      const hidden = await h.restaurant({ name: 'Suspended Place' });
      await h.prisma.restaurant.update({
        where: { id: hidden.restaurantId },
        data: { status: 'SUSPENDED' },
      });
      const pending = await h.restaurant({ name: 'Pending Place' });
      await h.prisma.restaurant.update({
        where: { id: pending.restaurantId },
        data: { approvalStatus: 'SUBMITTED' },
      });
      await h.prisma.systemSetting.create({
        data: { key: 'pricing.delivery_fee', value: '150', valueType: 'string' },
      });

      const response = await h
        .http()
        .get('/api/v1/restaurants?latitude=31.5204&longitude=74.3587&sort=distance')
        .expect(200);
      const rows = data<Summary[]>(response.body);
      expect(rows.map((row) => row.name)).toEqual(['Near Grill', 'Far Tikka']);
      expect(rows[0]).toMatchObject({
        id: near.restaurantId,
        distanceKm: 0,
        deliversToLocation: true,
        isOrderableNow: true,
        deliveryFee: '150.00',
        minimumOrderAmount: '0.00',
      });
      expect(rows[1]).toMatchObject({ deliversToLocation: false });
      expect(
        (response.body as { meta: { pagination: { total: number } } }).meta.pagination.total,
      ).toBe(2);

      const withinRadius = await h
        .http()
        .get('/api/v1/restaurants?latitude=31.5204&longitude=74.3587&radius=5')
        .expect(200);
      expect(data<Summary[]>(withinRadius.body).map((row) => row.name)).toEqual(['Near Grill']);
    });

    it('reports offline restaurants as visible but not orderable, and filters by status', async () => {
      const offline = await h.restaurant({ name: 'Sleepy Diner' });
      await h.prisma.restaurant.update({
        where: { id: offline.restaurantId },
        data: { status: 'OFFLINE' },
      });
      await h.restaurant({ name: 'Awake Diner' });
      const all = await h.http().get('/api/v1/restaurants').expect(200);
      const sleepy = data<Summary[]>(all.body).find((row) => row.name === 'Sleepy Diner');
      expect(sleepy).toMatchObject({ status: 'OFFLINE', isOrderableNow: false, distanceKm: null });
      const online = await h.http().get('/api/v1/restaurants?status=ONLINE').expect(200);
      expect(data<Summary[]>(online.body).map((row) => row.name)).toEqual(['Awake Diner']);
    });

    it('validates discovery query parameters', async () => {
      const response = await h.http().get('/api/v1/restaurants?latitude=31.5').expect(400);
      expect(error(response.body)).toBe('VALIDATION_ERROR');
      await h.http().get('/api/v1/restaurants?sort=distance').expect(400);
      await h.http().get('/api/v1/restaurants?latitude=200&longitude=1').expect(400);
    });

    it('returns public details without sensitive data and 404 for hidden restaurants', async () => {
      const restaurant = await h.restaurant({ name: 'Open Kitchen' });
      const response = await h
        .http()
        .get(`/api/v1/restaurants/${restaurant.restaurantId}?latitude=31.5204&longitude=74.3587`)
        .expect(200);
      const details = data<Record<string, unknown>>(response.body);
      expect(details).toMatchObject({ name: 'Open Kitchen', deliversToLocation: true });
      expect(details).not.toHaveProperty('phone');
      expect(details).not.toHaveProperty('email');
      expect(details).not.toHaveProperty('approvalStatus');
      expect(details.operatingHours).toHaveLength(7);

      await h.prisma.restaurant.update({
        where: { id: restaurant.restaurantId },
        data: { status: 'CLOSED' },
      });
      const gone = await h.http().get(`/api/v1/restaurants/${restaurant.restaurantId}`).expect(404);
      expect(error(gone.body)).toBe('RESTAURANT_NOT_FOUND');
      await h.http().get(`/api/v1/restaurants/${restaurant.restaurantId}/menu`).expect(404);
    });

    it('serves the public menu: active categories/options only, unavailable items flagged', async () => {
      const restaurant = await h.restaurant();
      const { itemId } = await seedMenu(restaurant);
      const auth = restaurant.owner.auth;
      await h
        .http()
        .post(`/api/v1/restaurant/menu/items/${itemId}/variations`)
        .set('Authorization', auth)
        .send({ name: 'Retired', isActive: false })
        .expect(201);
      await h
        .http()
        .post(`/api/v1/restaurant/menu/items/${itemId}/availability`)
        .set('Authorization', auth)
        .send({ available: false })
        .expect(200);
      const hiddenCategory = await h
        .http()
        .post('/api/v1/restaurant/menu/categories')
        .set('Authorization', auth)
        .send({ name: 'Secret', isActive: false })
        .expect(201);
      await h
        .http()
        .post('/api/v1/restaurant/menu/items')
        .set('Authorization', auth)
        .send({
          categoryId: data<{ id: string }>(hiddenCategory.body).id,
          name: 'Hidden',
          basePrice: '1',
        })
        .expect(201);

      const response = await h
        .http()
        .get(`/api/v1/restaurants/${restaurant.restaurantId}/menu`)
        .expect(200);
      const menu = data<{
        isOrderableNow: boolean;
        categories: { name: string; items: Item[] }[];
      }>(response.body);
      expect(menu.isOrderableNow).toBe(true);
      expect(menu.categories.map((category) => category.name)).toEqual(['Karahi']);
      expect(menu.categories[0]?.items).toMatchObject([
        { id: itemId, isAvailable: false, basePrice: '1200.50', variations: [{ name: 'Full' }] },
      ]);
      expect(menu.categories[0]?.items[0]?.variations[0]).not.toHaveProperty('isActive');
    });

    it('searches restaurants and menu items', async () => {
      const grill = await h.restaurant({ name: 'Lahore Grill' });
      await seedMenu(grill);
      await h.restaurant({ name: 'Sushi Bar' });

      const both = await h.http().get('/api/v1/search?q=karahi').expect(200);
      const result = data<{
        restaurants: Summary[];
        menuItems: { name: string; restaurant: Summary }[];
      }>(both.body);
      expect(result.restaurants).toHaveLength(0);
      expect(result.menuItems.map((item) => item.name)).toEqual(['Chicken Karahi']);
      expect(result.menuItems[0]?.restaurant.name).toBe('Lahore Grill');

      const restaurants = await h.http().get('/api/v1/search?q=grill&type=RESTAURANT').expect(200);
      expect(
        data<{ restaurants: Summary[]; menuItems: unknown[] }>(restaurants.body).restaurants.map(
          (row) => row.name,
        ),
      ).toEqual(['Lahore Grill']);

      await h.http().get('/api/v1/search').expect(400);
    });
  });
});
