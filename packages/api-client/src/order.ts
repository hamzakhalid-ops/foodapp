import {
  type AcceptOrderRequest,
  type AddCartItemInput,
  type AdminCancelRequest,
  type Cart,
  cartSchema,
  type CheckoutPreview,
  type CheckoutPreviewRequest,
  checkoutPreviewSchema,
  type CreateOrderRequest,
  type CustomerCancelRequest,
  type CustomerOrderListQuery,
  type Order,
  orderSchema,
  type OrderStatusView,
  orderStatusViewSchema,
  type OrderSummary,
  orderSummarySchema,
  type RestaurantCancelRequest,
  type RestaurantOrderListQuery,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/**
 * Customer cart, checkout and orders (docs/api/API_SPEC.md §32–41). Every amount in the responses
 * is calculated by the backend; the client never sends prices.
 */
export function createOrderApi(client: ApiClient) {
  return {
    getCart: async (): Promise<Cart> =>
      (await client.request({ method: 'GET', path: '/cart', schema: cartSchema })).data,
    addCartItem: async (body: AddCartItemInput): Promise<Cart> =>
      (await client.request({ method: 'POST', path: '/cart/items', body, schema: cartSchema }))
        .data,
    updateCartItem: async (cartItemId: string, quantity: number): Promise<Cart> =>
      (
        await client.request({
          method: 'PATCH',
          path: `/cart/items/${id(cartItemId)}`,
          body: { quantity },
          schema: cartSchema,
        })
      ).data,
    removeCartItem: async (cartItemId: string): Promise<Cart> =>
      (
        await client.request({
          method: 'DELETE',
          path: `/cart/items/${id(cartItemId)}`,
          schema: cartSchema,
        })
      ).data,
    clearCart: async (): Promise<void> => {
      await client.request({ method: 'DELETE', path: '/cart', schema: z.null() });
    },
    recalculateCart: async (): Promise<Cart> =>
      (await client.request({ method: 'POST', path: '/cart/recalculate', schema: cartSchema }))
        .data,

    previewCheckout: async (body: CheckoutPreviewRequest): Promise<CheckoutPreview> =>
      (
        await client.request({
          method: 'POST',
          path: '/checkout/preview',
          body,
          schema: checkoutPreviewSchema,
        })
      ).data,
    /**
     * Reuse the same `idempotencyKey` when retrying the same checkout (see
     * `createIdempotencyKey`); a retry returns the original order instead of a second one.
     */
    createOrder: async (body: CreateOrderRequest, idempotencyKey: string): Promise<Order> =>
      (
        await client.request({
          method: 'POST',
          path: '/orders',
          body,
          schema: orderSchema,
          idempotencyKey,
        })
      ).data,
    getOrder: async (orderId: string): Promise<Order> =>
      (await client.request({ method: 'GET', path: `/orders/${id(orderId)}`, schema: orderSchema }))
        .data,
    getOrderStatus: async (orderId: string): Promise<OrderStatusView> =>
      (
        await client.request({
          method: 'GET',
          path: `/orders/${id(orderId)}/status`,
          schema: orderStatusViewSchema,
        })
      ).data,
    cancelOrder: async (orderId: string, body: CustomerCancelRequest): Promise<Order> =>
      (
        await client.request({
          method: 'POST',
          path: `/orders/${id(orderId)}/cancel`,
          body,
          schema: orderSchema,
        })
      ).data,
    /** Cursor-paginated; `meta.pagination` carries `nextCursor` and `hasMore`. */
    listMyOrders: (
      query: Partial<CustomerOrderListQuery> = {},
    ): Promise<ApiResult<OrderSummary[]>> =>
      client.request({
        method: 'GET',
        path: '/customer/orders',
        schema: z.array(orderSummarySchema),
        query,
      }),
  };
}

/** Restaurant App order handling (docs/api/API_SPEC.md §51–56). */
export function createRestaurantOrderApi(client: ApiClient) {
  const action = async (orderId: string, name: string, body?: unknown): Promise<Order> =>
    (
      await client.request({
        method: 'POST',
        path: `/restaurant/orders/${id(orderId)}/${name}`,
        schema: orderSchema,
        ...(body === undefined ? {} : { body }),
      })
    ).data;
  return {
    listNew: async (): Promise<OrderSummary[]> =>
      (
        await client.request({
          method: 'GET',
          path: '/restaurant/orders/new',
          schema: z.array(orderSummarySchema),
        })
      ).data,
    list: (query: Partial<RestaurantOrderListQuery> = {}): Promise<ApiResult<OrderSummary[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurant/orders',
        schema: z.array(orderSummarySchema),
        query,
      }),
    get: async (orderId: string): Promise<Order> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurant/orders/${id(orderId)}`,
          schema: orderSchema,
        })
      ).data,
    accept: (orderId: string, body: AcceptOrderRequest = {}) => action(orderId, 'accept', body),
    reject: (orderId: string, body: RestaurantCancelRequest) => action(orderId, 'reject', body),
    cancel: (orderId: string, body: RestaurantCancelRequest) => action(orderId, 'cancel', body),
    startPreparing: (orderId: string) => action(orderId, 'preparing'),
    markReady: (orderId: string) => action(orderId, 'ready'),
  };
}

/** Admin order intervention (docs/api/API_SPEC.md §101). */
export function createAdminOrderApi(client: ApiClient) {
  return {
    cancel: async (orderId: string, body: AdminCancelRequest): Promise<Order> =>
      (
        await client.request({
          method: 'POST',
          path: `/admin/orders/${id(orderId)}/cancel`,
          body,
          schema: orderSchema,
        })
      ).data,
  };
}
