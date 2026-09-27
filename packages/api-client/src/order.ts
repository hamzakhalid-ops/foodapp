import {
  type AddCartItemRequest,
  type Cart,
  cartSchema,
  type CheckoutPreview,
  type CheckoutPreviewRequest,
  checkoutPreviewSchema,
  type CreateOrderRequest,
  type CustomerOrderListQuery,
  type Order,
  orderSchema,
  type OrderStatusView,
  orderStatusViewSchema,
  type OrderSummary,
  orderSummarySchema,
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
    addCartItem: async (body: AddCartItemRequest): Promise<Cart> =>
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
