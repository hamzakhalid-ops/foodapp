import {
  type AdminPaymentListQuery,
  type AdminRefundListQuery,
  type CreatePaymentRequest,
  type Payment,
  type PaymentMethodInfo,
  paymentMethodInfoSchema,
  paymentSchema,
  type Refund,
  type RefundDecisionRequest,
  type RefundRequest,
  refundSchema,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/**
 * Customer payments (docs/api/API_SPEC.md §77–80). The app opens `nextAction.url` for the
 * provider and then calls `confirmPayment`; only the backend decides whether payment succeeded.
 */
export function createPaymentApi(client: ApiClient) {
  return {
    listPaymentMethods: async (): Promise<PaymentMethodInfo[]> =>
      (
        await client.request({
          method: 'GET',
          path: '/payment-methods',
          schema: z.array(paymentMethodInfoSchema),
        })
      ).data,
    /** Reuse the same `idempotencyKey` when retrying the same payment start. */
    startPayment: async (body: CreatePaymentRequest, idempotencyKey: string): Promise<Payment> =>
      (
        await client.request({
          method: 'POST',
          path: '/payments',
          body,
          schema: paymentSchema,
          idempotencyKey,
        })
      ).data,
    getPayment: async (paymentId: string): Promise<Payment> =>
      (
        await client.request({
          method: 'GET',
          path: `/payments/${id(paymentId)}`,
          schema: paymentSchema,
        })
      ).data,
    confirmPayment: async (paymentId: string): Promise<Payment> =>
      (
        await client.request({
          method: 'POST',
          path: `/payments/${id(paymentId)}/confirm`,
          schema: paymentSchema,
        })
      ).data,
  };
}

const decisionResultSchema = z.object({
  decision: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'NO_REFUND']),
  refund: refundSchema.nullable(),
});

/** Admin payments and refunds (docs/api/API_SPEC.md §82, §102; ADR-0014 §9). */
export function createAdminPaymentApi(client: ApiClient) {
  return {
    listPayments: (query: Partial<AdminPaymentListQuery> = {}): Promise<ApiResult<Payment[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/payments',
        schema: z.array(paymentSchema),
        query,
      }),
    getPayment: async (paymentId: string): Promise<Payment> =>
      (
        await client.request({
          method: 'GET',
          path: `/admin/payments/${id(paymentId)}`,
          schema: paymentSchema,
        })
      ).data,
    listRefunds: (query: Partial<AdminRefundListQuery> = {}): Promise<ApiResult<Refund[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/refunds',
        schema: z.array(refundSchema),
        query,
      }),
    getRefund: async (refundId: string): Promise<Refund> =>
      (
        await client.request({
          method: 'GET',
          path: `/admin/refunds/${id(refundId)}`,
          schema: refundSchema,
        })
      ).data,
    refund: async (
      paymentId: string,
      body: RefundRequest,
      idempotencyKey: string,
    ): Promise<Refund> =>
      (
        await client.request({
          method: 'POST',
          path: `/payments/${id(paymentId)}/refund`,
          body,
          schema: refundSchema,
          idempotencyKey,
        })
      ).data,
    decideRefund: async (orderId: string, body: RefundDecisionRequest, idempotencyKey: string) =>
      (
        await client.request({
          method: 'POST',
          path: `/admin/orders/${id(orderId)}/refund-decision`,
          body,
          schema: decisionResultSchema,
          idempotencyKey,
        })
      ).data,
  };
}
