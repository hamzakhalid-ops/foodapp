import { type Actor, createHarness, type Harness, type TestRestaurant } from './auth-harness';

/** Slices 6–7 — Cart and Checkout (IMPLEMENTATION_PLAN §11–12). */
describe('Slice 5 — cart, checkout and order creation', () => {
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

  interface CartView {
    restaurant: { id: string } | null;
    items: { id: string; unitPrice: string; lineTotal: string; isAvailable: boolean }[];
    subtotal: string;
    deliveryFee: string;
    serviceFee: string;
    tax: string;
    total: string;
    currency: string;
    issues: { code: string; cartItemId: string | null }[];
    isCheckoutReady: boolean;
  }
  interface OrderView {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    subtotal: string;
    totalAmount: string;
    deliveryAddress: { addressText: string; latitude: number };
    items: { name: string; unitPrice: string; subtotal: string; variations: { name: string }[] }[];
  }

  async function configurePricing() {
    const settings = {
      'pricing.delivery_fee': '150',
      'pricing.service_fee': '25',
      'pricing.tax_percent': '16',
    };
    for (const [key, value] of Object.entries(settings)) {
      await h.prisma.systemSetting.create({ data: { key, value, valueType: 'string' } });
    }
  }

  /** A restaurant with one item (base 1000) that has sizes Regular (+0) / Large (+300) and one add-on (+50). */
  async function menu(restaurant: TestRestaurant, basePrice = '1000') {
    const category = await h.prisma.menuCategory.create({
      data: { restaurantId: restaurant.restaurantId, name: 'Mains' },
    });
    const item = await h.prisma.menuItem.create({
      data: {
        restaurantId: restaurant.restaurantId,
        categoryId: category.id,
        name: 'Biryani',
        basePrice,
        variations: { create: [{ name: 'Regular' }, { name: 'Large', priceAdjustment: '300' }] },
        addOns: { create: [{ name: 'Raita', price: '50' }] },
      },
      include: { variations: true, addOns: true },
    });
    const large = item.variations.find((variation) => variation.name === 'Large');
    const raita = item.addOns[0];
    if (!large || !raita) throw new Error('menu fixture');
    return { itemId: item.id, largeId: large.id, raitaId: raita.id, category };
  }

  async function address(customer: Actor, latitude = 31.5204, longitude = 74.3587) {
    const row = await h.prisma.address.create({
      data: {
        userId: customer.userId,
        recipientName: 'Sara Ahmed',
        phone: '+923001234567',
        addressLine1: 'House 12, Street 4',
        addressLine2: 'Gulberg III',
        city: 'Lahore',
        latitude,
        longitude,
        deliveryInstructions: 'Ring twice',
      },
    });
    return row.id;
  }

  const addToCart = (customer: Actor, body: Record<string, unknown>) =>
    h.http().post('/api/v1/cart/items').set('Authorization', customer.auth).send(body);

  const placeOrder = (
    customer: Actor,
    body: Record<string, unknown>,
    key = `order-${Math.random().toString(36).slice(2)}`,
  ) =>
    h
      .http()
      .post('/api/v1/orders')
      .set('Authorization', customer.auth)
      .set('Idempotency-Key', key)
      .send(body);

  async function readyCart() {
    await configurePricing();
    const restaurant = await h.restaurant({ minimumOrderAmount: '500' });
    const m = await menu(restaurant);
    const customer = await h.actor('CUSTOMER');
    const addressId = await address(customer);
    await addToCart(customer, {
      restaurantId: restaurant.restaurantId,
      menuItemId: m.itemId,
      quantity: 2,
      variationIds: [m.largeId],
      addOnIds: [m.raitaId],
    }).expect(201);
    return { restaurant, m, customer, addressId };
  }

  describe('cart', () => {
    it('prices the cart on the server: (1000 + 300 + 50) × 2 with fees and tax', async () => {
      const { customer } = await readyCart();
      const response = await h
        .http()
        .get('/api/v1/cart')
        .set('Authorization', customer.auth)
        .expect(200);
      const cart = data<CartView>(response.body);
      expect(cart.items[0]).toMatchObject({
        unitPrice: '1350.00',
        lineTotal: '2700.00',
        isAvailable: true,
      });
      expect(cart).toMatchObject({
        subtotal: '2700.00',
        deliveryFee: '150.00',
        serviceFee: '25.00',
        tax: '432.00',
        total: '3307.00',
        currency: 'PKR',
        isCheckoutReady: true,
        issues: [],
      });
    });

    it('reflects menu price changes made after the item was added', async () => {
      const { customer, m } = await readyCart();
      await h.prisma.menuItem.update({ where: { id: m.itemId }, data: { basePrice: '1100' } });
      const response = await h
        .http()
        .post('/api/v1/cart/recalculate')
        .set('Authorization', customer.auth)
        .expect(200);
      expect(data<CartView>(response.body).subtotal).toBe('2900.00');
    });

    it('ignores nothing the client sends about prices: unknown fields are rejected', async () => {
      const { customer, restaurant, m } = await readyCart();
      const response = await addToCart(customer, {
        restaurantId: restaurant.restaurantId,
        menuItemId: m.itemId,
        quantity: 1,
        variationIds: [m.largeId],
        price: '1',
      }).expect(400);
      expect(error(response.body)).toBe('VALIDATION_ERROR');
    });

    it('allows one restaurant per cart until the cart is cleared', async () => {
      const { customer } = await readyCart();
      const other = await h.restaurant();
      const otherMenu = await menu(other);
      const body = {
        restaurantId: other.restaurantId,
        menuItemId: otherMenu.itemId,
        quantity: 1,
        variationIds: [otherMenu.largeId],
      };
      const mismatch = await addToCart(customer, body).expect(409);
      expect(error(mismatch.body)).toBe('CART_RESTAURANT_MISMATCH');
      await h.http().delete('/api/v1/cart').set('Authorization', customer.auth).expect(204);
      await addToCart(customer, body).expect(201);
    });

    it('validates variations, add-ons, availability and item ownership', async () => {
      await configurePricing();
      const restaurant = await h.restaurant();
      const m = await menu(restaurant);
      const other = await menu(await h.restaurant());
      const customer = await h.actor('CUSTOMER');
      const base = { restaurantId: restaurant.restaurantId, menuItemId: m.itemId, quantity: 1 };

      expect(error((await addToCart(customer, base).expect(422)).body)).toBe('INVALID_VARIATION');
      expect(
        error(
          (await addToCart(customer, { ...base, variationIds: [other.largeId] }).expect(422)).body,
        ),
      ).toBe('INVALID_VARIATION');
      expect(
        error(
          (
            await addToCart(customer, {
              ...base,
              variationIds: [m.largeId],
              addOnIds: [other.raitaId],
            }).expect(422)
          ).body,
        ),
      ).toBe('INVALID_ADD_ON');
      expect(
        error(
          (
            await addToCart(customer, {
              ...base,
              menuItemId: other.itemId,
              variationIds: [other.largeId],
            }).expect(404)
          ).body,
        ),
      ).toBe('MENU_ITEM_NOT_FOUND');
      await h.prisma.menuItem.update({ where: { id: m.itemId }, data: { isAvailable: false } });
      expect(
        error((await addToCart(customer, { ...base, variationIds: [m.largeId] }).expect(422)).body),
      ).toBe('ORDER_ITEM_UNAVAILABLE');
    });

    it('updates and removes only the caller’s own cart items', async () => {
      const { customer } = await readyCart();
      const cart = data<CartView>(
        (await h.http().get('/api/v1/cart').set('Authorization', customer.auth)).body,
      );
      const lineId = cart.items[0]?.id ?? '';
      const intruder = await h.actor('CUSTOMER');
      await h
        .http()
        .patch(`/api/v1/cart/items/${lineId}`)
        .set('Authorization', intruder.auth)
        .send({ quantity: 5 })
        .expect(404);
      await h
        .http()
        .delete(`/api/v1/cart/items/${lineId}`)
        .set('Authorization', intruder.auth)
        .expect(404);
      const updated = await h
        .http()
        .patch(`/api/v1/cart/items/${lineId}`)
        .set('Authorization', customer.auth)
        .send({ quantity: 3 })
        .expect(200);
      expect(data<CartView>(updated.body).subtotal).toBe('4050.00');
      const removed = await h
        .http()
        .delete(`/api/v1/cart/items/${lineId}`)
        .set('Authorization', customer.auth)
        .expect(200);
      expect(data<CartView>(removed.body)).toMatchObject({
        restaurant: null,
        items: [],
        total: '0.00',
      });
    });

    it('is only for customers', async () => {
      const owner = await h.actor('RESTAURANT_OWNER');
      await h.http().get('/api/v1/cart').set('Authorization', owner.auth).expect(403);
      await h.http().get('/api/v1/cart').expect(401);
    });
  });

  describe('checkout', () => {
    it('previews the authoritative totals without creating an order', async () => {
      const { customer, addressId, restaurant } = await readyCart();
      const response = await h
        .http()
        .post('/api/v1/checkout/preview')
        .set('Authorization', customer.auth)
        .send({ addressId, paymentMethod: 'CASH_ON_DELIVERY' })
        .expect(200);
      expect(data(response.body)).toEqual({
        restaurantId: restaurant.restaurantId,
        addressId,
        subtotal: '2700.00',
        discount: '0.00',
        deliveryFee: '150.00',
        tax: '432.00',
        serviceFee: '25.00',
        total: '3307.00',
        currency: 'PKR',
        paymentMethod: 'CASH_ON_DELIVERY',
        promotionCode: null,
      });
      expect(await h.prisma.order.count()).toBe(0);
    });

    it('blocks checkout for unavailable items, offline restaurants and unmet minimums', async () => {
      const { customer, addressId, m, restaurant } = await readyCart();
      const preview = () =>
        h
          .http()
          .post('/api/v1/checkout/preview')
          .set('Authorization', customer.auth)
          .send({ addressId, paymentMethod: 'CASH_ON_DELIVERY' });

      await h.prisma.menuItem.update({ where: { id: m.itemId }, data: { isAvailable: false } });
      expect(error((await preview().expect(422)).body)).toBe('ORDER_ITEM_UNAVAILABLE');
      await h.prisma.menuItem.update({ where: { id: m.itemId }, data: { isAvailable: true } });

      await h.prisma.restaurant.update({
        where: { id: restaurant.restaurantId },
        data: { status: 'OFFLINE' },
      });
      expect(error((await preview().expect(422)).body)).toBe('RESTAURANT_NOT_AVAILABLE');
      await h.prisma.restaurant.update({
        where: { id: restaurant.restaurantId },
        data: { status: 'ONLINE' },
      });

      // Minimum boundary: subtotal 2700 — exactly equal passes, one paisa more fails.
      await h.prisma.restaurantDeliverySettings.update({
        where: { restaurantId: restaurant.restaurantId },
        data: { minimumOrderAmount: '2700' },
      });
      await preview().expect(200);
      await h.prisma.restaurantDeliverySettings.update({
        where: { restaurantId: restaurant.restaurantId },
        data: { minimumOrderAmount: '2700.01' },
      });
      expect(error((await preview().expect(422)).body)).toBe('ORDER_MINIMUM_NOT_MET');
    });

    it('rejects addresses outside the delivery radius or owned by someone else', async () => {
      const { customer } = await readyCart();
      const far = await address(customer, 31.7, 74.3587); // ~20 km away, radius 10 km
      const farResponse = await h
        .http()
        .post('/api/v1/checkout/preview')
        .set('Authorization', customer.auth)
        .send({ addressId: far, paymentMethod: 'CASH_ON_DELIVERY' })
        .expect(422);
      expect(error(farResponse.body)).toBe('ADDRESS_NOT_SERVICEABLE');
      const stranger = await address(await h.actor('CUSTOMER'));
      await h
        .http()
        .post('/api/v1/checkout/preview')
        .set('Authorization', customer.auth)
        .send({ addressId: stranger, paymentMethod: 'CASH_ON_DELIVERY' })
        .expect(404);
    });

    it('fails closed when pricing settings are not configured', async () => {
      const { customer, addressId } = await readyCart();
      await h.prisma.systemSetting.deleteMany({ where: { key: 'pricing.tax_percent' } });
      const response = await h
        .http()
        .post('/api/v1/checkout/preview')
        .set('Authorization', customer.auth)
        .send({ addressId, paymentMethod: 'CASH_ON_DELIVERY' })
        .expect(503);
      expect(error(response.body)).toBe('INTERNAL_ERROR');
    });

    it('rejects unknown promotion codes', async () => {
      const { customer, addressId } = await readyCart();
      const response = await placeOrder(customer, {
        addressId,
        paymentMethod: 'CASH_ON_DELIVERY',
        promotionCode: 'SAVE10',
      }).expect(422);
      expect(error(response.body)).toBe('PROMOTION_NOT_FOUND');
    });
  });

  describe('order creation', () => {
    it('creates a PENDING order with snapshots, payment, history and an outbox event, then empties the cart', async () => {
      const { customer, addressId, m, restaurant } = await readyCart();
      const response = await placeOrder(customer, {
        addressId,
        paymentMethod: 'CASH_ON_DELIVERY',
        instructions: 'Call on arrival',
      }).expect(201);
      const order = data<OrderView>(response.body);
      expect(order).toMatchObject({
        status: 'PENDING',
        paymentStatus: 'PENDING',
        subtotal: '2700.00',
        totalAmount: '3307.00',
        deliveryAddress: { addressText: 'House 12, Street 4, Gulberg III', latitude: 31.5204 },
        items: [
          {
            name: 'Biryani',
            unitPrice: '1000.00',
            subtotal: '2700.00',
            variations: [{ name: 'Large' }],
          },
        ],
      });
      expect(order.orderNumber).toMatch(/^QB-\d{6,}$/);

      const payment = await h.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(payment).toMatchObject({
        method: 'CASH_ON_DELIVERY',
        status: 'PENDING',
        provider: null,
      });
      expect(payment.amount.toFixed(2)).toBe('3307.00');
      expect(
        await h.prisma.orderStatusHistory.count({
          where: { orderId: order.id, toStatus: 'PENDING' },
        }),
      ).toBe(1);
      const event = await h.prisma.outboxEvent.findFirstOrThrow({
        where: { eventType: 'order.created' },
      });
      expect(event.aggregateId).toBe(order.id);
      expect(await h.prisma.cartItem.count()).toBe(0);

      // Later menu edits and address edits never change the order.
      await h.prisma.menuItem.update({
        where: { id: m.itemId },
        data: { basePrice: '5000', name: 'Renamed' },
      });
      await h.prisma.address.update({
        where: { id: addressId },
        data: { addressLine1: 'Moved away' },
      });
      const reread = await h
        .http()
        .get(`/api/v1/orders/${order.id}`)
        .set('Authorization', customer.auth)
        .expect(200);
      expect(data<OrderView>(reread.body)).toMatchObject({
        subtotal: '2700.00',
        items: [{ name: 'Biryani', unitPrice: '1000.00' }],
        deliveryAddress: { addressText: 'House 12, Street 4, Gulberg III' },
      });
      expect(restaurant.restaurantId).toBeDefined();
    });

    it('requires an Idempotency-Key and replays retries without creating a second order', async () => {
      const { customer, addressId } = await readyCart();
      const body = { addressId, paymentMethod: 'CASH_ON_DELIVERY' };
      const missing = await h
        .http()
        .post('/api/v1/orders')
        .set('Authorization', customer.auth)
        .send(body)
        .expect(400);
      expect(error(missing.body)).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const first = await placeOrder(customer, body, 'checkout-key-1').expect(201);
      const retry = await placeOrder(customer, body, 'checkout-key-1').expect(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(data<OrderView>(retry.body).id).toBe(data<OrderView>(first.body).id);
      expect(await h.prisma.order.count()).toBe(1);

      const again = await placeOrder(customer, body, 'checkout-key-2').expect(422);
      expect(error(again.body)).toBe('INVALID_REQUEST');
    });

    it('creates exactly one order when two checkouts race with different keys', async () => {
      const { customer, addressId } = await readyCart();
      const body = { addressId, paymentMethod: 'CASH_ON_DELIVERY' };
      const results = await Promise.all([
        placeOrder(customer, body, 'race-key-aaaa'),
        placeOrder(customer, body, 'race-key-bbbb'),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 422]);
      expect(await h.prisma.order.count()).toBe(1);
      expect(await h.prisma.payment.count()).toBe(1);
    });

    it('rolls back everything when order creation fails mid-transaction', async () => {
      const { customer, addressId } = await readyCart();
      // Force the payments insert to fail inside the order transaction.
      await h.prisma.$executeRawUnsafe(
        `ALTER TABLE payments ADD CONSTRAINT test_block_payments CHECK (amount < 0) NOT VALID`,
      );
      try {
        await placeOrder(customer, { addressId, paymentMethod: 'CASH_ON_DELIVERY' }).expect(500);
      } finally {
        await h.prisma.$executeRawUnsafe(
          `ALTER TABLE payments DROP CONSTRAINT test_block_payments`,
        );
      }
      expect(await h.prisma.order.count()).toBe(0);
      expect(await h.prisma.outboxEvent.count({ where: { eventType: 'order.created' } })).toBe(0);
      expect(await h.prisma.cartItem.count()).toBe(1);
    });
  });

  describe('order access', () => {
    async function placed(paymentMethod: 'CASH_ON_DELIVERY' | 'ONLINE_PAYMENT') {
      const context = await readyCart();
      const response = await placeOrder(context.customer, {
        addressId: context.addressId,
        paymentMethod,
      }).expect(201);
      return { ...context, orderId: data<OrderView>(response.body).id };
    }

    it('lets the customer, the restaurant and admins see a cash order; nobody else', async () => {
      const { orderId, restaurant, customer } = await placed('CASH_ON_DELIVERY');
      await h
        .http()
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', customer.auth)
        .expect(200);
      await h
        .http()
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', restaurant.owner.auth)
        .expect(200);
      const admin = await h.actor('ADMIN');
      await h.http().get(`/api/v1/orders/${orderId}`).set('Authorization', admin.auth).expect(200);
      for (const outsider of [
        await h.actor('CUSTOMER'),
        (await h.restaurant()).owner,
        await h.actor('RIDER'),
      ]) {
        const response = await h
          .http()
          .get(`/api/v1/orders/${orderId}`)
          .set('Authorization', outsider.auth)
          .expect(404);
        expect(error(response.body)).toBe('ORDER_NOT_FOUND');
      }
    });

    it('keeps unpaid online orders away from the restaurant', async () => {
      const { orderId, restaurant, customer } = await placed('ONLINE_PAYMENT');
      await h
        .http()
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', customer.auth)
        .expect(200);
      await h
        .http()
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', restaurant.owner.auth)
        .expect(404);
    });

    it('returns status history', async () => {
      const { orderId, customer } = await placed('CASH_ON_DELIVERY');
      const response = await h
        .http()
        .get(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', customer.auth)
        .expect(200);
      expect(data(response.body)).toMatchObject({
        orderId,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        history: [{ fromStatus: null, toStatus: 'PENDING' }],
      });
    });

    it('pages the customer order history with a cursor', async () => {
      const { customer, restaurant, m, addressId } = await readyCart();
      await placeOrder(customer, { addressId, paymentMethod: 'CASH_ON_DELIVERY' }).expect(201);
      for (let i = 0; i < 2; i += 1) {
        await addToCart(customer, {
          restaurantId: restaurant.restaurantId,
          menuItemId: m.itemId,
          quantity: 1,
          variationIds: [m.largeId],
        }).expect(201);
        await placeOrder(customer, { addressId, paymentMethod: 'CASH_ON_DELIVERY' }).expect(201);
      }
      const first = await h
        .http()
        .get('/api/v1/customer/orders?limit=2')
        .set('Authorization', customer.auth)
        .expect(200);
      const meta = (
        first.body as { meta: { pagination: { nextCursor: string | null; hasMore: boolean } } }
      ).meta.pagination;
      expect(data<unknown[]>(first.body)).toHaveLength(2);
      expect(meta.hasMore).toBe(true);
      const second = await h
        .http()
        .get(`/api/v1/customer/orders?limit=2&cursor=${meta.nextCursor ?? ''}`)
        .set('Authorization', customer.auth)
        .expect(200);
      const ids = [
        ...data<{ id: string }[]>(first.body),
        ...data<{ id: string }[]>(second.body),
      ].map((row) => row.id);
      expect(new Set(ids).size).toBe(3);
      expect(
        (second.body as { meta: { pagination: { hasMore: boolean } } }).meta.pagination.hasMore,
      ).toBe(false);
      await h
        .http()
        .get('/api/v1/customer/orders?cursor=garbage')
        .set('Authorization', customer.auth)
        .expect(400);
      const other = await h.actor('CUSTOMER');
      const empty = await h
        .http()
        .get('/api/v1/customer/orders')
        .set('Authorization', other.auth)
        .expect(200);
      expect(data<unknown[]>(empty.body)).toHaveLength(0);
    });
  });
});
