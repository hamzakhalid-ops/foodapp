import { type Actor, type Harness, type TestRestaurant } from './auth-harness';

/** Shared order fixtures for integration tests (pricing: fee 150, service 25, tax 16%). */
export function orderFixtures(h: Harness) {
  async function configurePricing() {
    const settings = {
      'pricing.delivery_fee': '150',
      'pricing.service_fee': '25',
      'pricing.tax_percent': '16',
    };
    for (const [key, value] of Object.entries(settings)) {
      await h.prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, valueType: 'string' },
        update: { value },
      });
    }
  }

  async function menuItem(restaurant: TestRestaurant, basePrice = '1000') {
    const category = await h.prisma.menuCategory.create({
      data: { restaurantId: restaurant.restaurantId, name: 'Mains' },
    });
    const item = await h.prisma.menuItem.create({
      data: {
        restaurantId: restaurant.restaurantId,
        categoryId: category.id,
        name: 'Karahi',
        basePrice,
      },
    });
    return item.id;
  }

  async function address(customer: Actor, latitude = 31.5204, longitude = 74.3587) {
    const row = await h.prisma.address.create({
      data: {
        userId: customer.userId,
        recipientName: 'Sara Ahmed',
        phone: '+923001234567',
        addressLine1: 'House 12, Street 4',
        city: 'Lahore',
        latitude,
        longitude,
      },
    });
    return row.id;
  }

  let keys = 0;
  /** Places a real order through the API (cart → POST /orders). */
  async function placeOrder(
    options: {
      restaurant?: TestRestaurant;
      customer?: Actor;
      paymentMethod?: 'CASH_ON_DELIVERY' | 'ONLINE_PAYMENT';
    } = {},
  ) {
    await configurePricing();
    const restaurant = options.restaurant ?? (await h.restaurant());
    const customer = options.customer ?? (await h.actor('CUSTOMER'));
    const itemId = await menuItem(restaurant);
    const addressId = await address(customer);
    await h
      .http()
      .post('/api/v1/cart/items')
      .set('Authorization', customer.auth)
      .send({ restaurantId: restaurant.restaurantId, menuItemId: itemId, quantity: 1 })
      .expect(201);
    keys += 1;
    const response = await h
      .http()
      .post('/api/v1/orders')
      .set('Authorization', customer.auth)
      .set('Idempotency-Key', `fixture-order-${keys}-${Date.now()}`)
      .send({ addressId, paymentMethod: options.paymentMethod ?? 'CASH_ON_DELIVERY' })
      .expect(201);
    const order = (response.body as { data: { id: string; orderNumber: string } }).data;
    return { restaurant, customer, orderId: order.id, orderNumber: order.orderNumber };
  }

  return { configurePricing, menuItem, address, placeOrder };
}
