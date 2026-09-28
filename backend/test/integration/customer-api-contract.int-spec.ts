import { type AddressInfo } from 'node:net';
import {
  ApiClient,
  ApiError,
  createAuthApi,
  createCustomerApi,
  createCustomerPromotionApi,
  createDiscoveryApi,
  createIdempotencyKey,
  createNotificationApi,
  createOrderApi,
  createPaymentApi,
  createReviewApi,
  createSupportApi,
} from '@quickbite/api-client';
import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { createHarness, type Harness, newCustomer } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/**
 * Contract test for the Customer app: every call goes through the real `@quickbite/api-client`
 * against the running API, so each response is parsed by the shared Zod schemas the app uses.
 * A backend response that drifts from `@quickbite/validation` fails here instead of in the app.
 */
describe('Customer API contract (@quickbite/api-client)', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let baseUrl: string;
  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
    await h.app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${String((h.app.getHttpServer().address() as AddressInfo).port)}`;
    await h.reset();
  });
  afterAll(async () => {
    await h.app.close();
  });

  it('parses every customer-journey response with the shared schemas', async () => {
    let token: string | null = null;
    const client = new ApiClient({ baseUrl, getAccessToken: () => token });
    const auth = createAuthApi(client);
    const customer = createCustomerApi(client);
    const discovery = createDiscoveryApi(client);
    const orders = createOrderApi(client);
    const payments = createPaymentApi(client);
    const notifications = createNotificationApi(client);
    const reviews = createReviewApi(client);
    const support = createSupportApi(client);
    const promotions = createCustomerPromotionApi(client);

    await f.configurePricing();
    const restaurant = await h.restaurant();
    const itemId = await f.menuItem(restaurant, '850.00');

    // Registration, login, verification, identity.
    const identity = newCustomer();
    await auth.register(identity);
    const login = await auth.login({ identifier: identity.email, password: identity.password });
    token = login.accessToken;
    await auth.verifyPhone({ code: h.sender.lastPhoneCode() });
    expect((await auth.me()).roles).toEqual(['CUSTOMER']);
    await customer.updateProfile({ firstName: 'Ayesha' });
    expect((await customer.getProfile()).firstName).toBe('Ayesha');

    // Addresses and discovery.
    const address = await customer.createAddress({
      recipientName: 'Ayesha Khan',
      phone: identity.phone,
      addressLine1: 'House 3, Street 9',
      city: 'Lahore',
      latitude: 31.5204,
      longitude: 74.3587,
    });
    expect(await customer.listAddresses()).toHaveLength(1);
    const listed = await discovery.listRestaurants({ latitude: 31.5204, longitude: 74.3587 });
    expect(listed.data.map((row) => row.id)).toContain(restaurant.restaurantId);
    await discovery.getRestaurant(restaurant.restaurantId, {
      latitude: 31.5204,
      longitude: 74.3587,
    });
    expect(JSON.stringify(await discovery.getMenu(restaurant.restaurantId))).toContain(itemId);
    await discovery.search({ q: 'Test' });
    expect(await promotions.forRestaurant(restaurant.restaurantId)).toEqual([]);

    // Cart, checkout, order, status, history, payment methods.
    const cart = await orders.addCartItem({
      restaurantId: restaurant.restaurantId,
      menuItemId: itemId,
      quantity: 1,
    });
    const cartItemId = cart.items[0]?.id ?? '';
    await orders.updateCartItem(cartItemId, 2);
    await orders.recalculateCart();
    const preview = await orders.previewCheckout({
      addressId: address.id,
      paymentMethod: 'CASH_ON_DELIVERY',
    });
    expect(preview.subtotal).toBe('1700.00');
    const methods = await payments.listPaymentMethods();
    expect(methods.map((row) => row.method)).toContain('CASH_ON_DELIVERY');
    const order = await orders.createOrder(
      { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' },
      createIdempotencyKey('contract-order'),
    );
    expect(order.status).toBe('PENDING');
    await orders.getOrder(order.id);
    expect((await orders.getOrderStatus(order.id)).status).toBe('PENDING');
    expect((await orders.listMyOrders()).data.map((row) => row.id)).toEqual([order.id]);
    expect((await orders.getCart()).items).toEqual([]);

    // Notifications created by the outbox.
    await h.app.get(OutboxProcessor).drain();
    const inbox = await notifications.list();
    expect(inbox.data.length).toBeGreaterThan(0);
    await notifications.markRead(inbox.data[0]?.id ?? '');
    await notifications.preferences();

    // Review eligibility, review and structured API errors.
    expect((await reviews.eligibility(order.id)).eligible).toBe(false);
    await h.prisma.order.update({
      where: { id: order.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    await reviews.create(order.id, { rating: 5, comment: 'Great' });
    expect((await reviews.getForOrder(order.id)).rating).toBe(5);
    const duplicate = await reviews.create(order.id, { rating: 4 }).catch((e: unknown) => e);
    expect(duplicate).toBeInstanceOf(ApiError);
    expect((duplicate as ApiError).code).toBe('REVIEW_ALREADY_EXISTS');

    // Customer cancellation of a second order.
    await orders.addCartItem({
      restaurantId: restaurant.restaurantId,
      menuItemId: itemId,
      quantity: 1,
    });
    const second = await orders.createOrder(
      { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' },
      createIdempotencyKey('contract-order'),
    );
    expect(
      (await orders.cancelOrder(second.id, { reasonCode: 'CUSTOMER_CHANGED_MIND' })).status,
    ).toBe('CANCELLED_BY_CUSTOMER');

    // Support.
    const ticket = await support.create({
      subject: 'Late order',
      category: 'ORDER_PROBLEM',
      message: 'Where is it?',
      orderId: order.id,
    });
    await support.sendMessage(ticket.id, 'Any update?');
    expect((await support.list()).data).toHaveLength(1);
    await support.get(ticket.id);

    await auth.logout();
    token = null;
  });
});
