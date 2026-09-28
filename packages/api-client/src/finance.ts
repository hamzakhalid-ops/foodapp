import {
  type AdjustmentListQuery,
  type AdminSettlementListQuery,
  type CreateFinancialAdjustmentRequest,
  type EarningListQuery,
  type FinanceRangeQuery,
  type FinancialAdjustment,
  financialAdjustmentSchema,
  type Invoice,
  invoiceSchema,
  type Payout,
  type PayoutListQuery,
  payoutSchema,
  type ReconciliationReport,
  reconciliationReportSchema,
  type RestaurantEarning,
  restaurantEarningSchema,
  type RestaurantEarningsSummary,
  restaurantEarningsSummarySchema,
  type RestaurantFeesSummary,
  restaurantFeesSummarySchema,
  type RiderEarning,
  riderEarningSchema,
  type RiderEarningsSummary,
  riderEarningsSummarySchema,
  type Settlement,
  type SettlementDetail,
  settlementDetailSchema,
  type SettlementListQuery,
  settlementSchema,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);

/** Restaurant owner finances (docs/api/API_SPEC.md §59–60). Operators receive 403. */
export function createRestaurantFinanceApi(client: ApiClient) {
  return {
    summary: async (query: FinanceRangeQuery = {}): Promise<RestaurantEarningsSummary> =>
      (
        await client.request({
          method: 'GET',
          path: '/restaurant/earnings',
          schema: restaurantEarningsSummarySchema,
          query,
        })
      ).data,
    fees: async (query: FinanceRangeQuery = {}): Promise<RestaurantFeesSummary> =>
      (
        await client.request({
          method: 'GET',
          path: '/restaurant/earnings/fees',
          schema: restaurantFeesSummarySchema,
          query,
        })
      ).data,
    transactions: (
      query: Partial<EarningListQuery> = {},
    ): Promise<ApiResult<RestaurantEarning[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurant/earnings/transactions',
        schema: z.array(restaurantEarningSchema),
        query,
      }),
    earning: async (earningId: string): Promise<RestaurantEarning> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurant/earnings/${id(earningId)}`,
          schema: restaurantEarningSchema,
        })
      ).data,
    settlements: (query: Partial<SettlementListQuery> = {}): Promise<ApiResult<Settlement[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurant/settlements',
        schema: z.array(settlementSchema),
        query,
      }),
    settlement: async (settlementId: string): Promise<SettlementDetail> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurant/settlements/${id(settlementId)}`,
          schema: settlementDetailSchema,
        })
      ).data,
    payouts: (query: Partial<PayoutListQuery> = {}): Promise<ApiResult<Payout[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurant/payouts',
        schema: z.array(payoutSchema),
        query,
      }),
    invoices: (query: { cursor?: string; limit?: number } = {}): Promise<ApiResult<Invoice[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurant/invoices',
        schema: z.array(invoiceSchema),
        query,
      }),
  };
}

/** Rider finances (docs/api/API_SPEC.md §75–76). */
export function createRiderFinanceApi(client: ApiClient) {
  return {
    summary: async (query: FinanceRangeQuery = {}): Promise<RiderEarningsSummary> =>
      (
        await client.request({
          method: 'GET',
          path: '/rider/earnings',
          schema: riderEarningsSummarySchema,
          query,
        })
      ).data,
    transactions: (query: Partial<EarningListQuery> = {}): Promise<ApiResult<RiderEarning[]>> =>
      client.request({
        method: 'GET',
        path: '/rider/earnings/transactions',
        schema: z.array(riderEarningSchema),
        query,
      }),
    earning: async (earningId: string): Promise<RiderEarning> =>
      (
        await client.request({
          method: 'GET',
          path: `/rider/earnings/${id(earningId)}`,
          schema: riderEarningSchema,
        })
      ).data,
    settlements: (query: Partial<SettlementListQuery> = {}): Promise<ApiResult<Settlement[]>> =>
      client.request({
        method: 'GET',
        path: '/rider/settlements',
        schema: z.array(settlementSchema),
        query,
      }),
    settlement: async (settlementId: string): Promise<SettlementDetail> =>
      (
        await client.request({
          method: 'GET',
          path: `/rider/settlements/${id(settlementId)}`,
          schema: settlementDetailSchema,
        })
      ).data,
    payouts: (query: Partial<PayoutListQuery> = {}): Promise<ApiResult<Payout[]>> =>
      client.request({
        method: 'GET',
        path: '/rider/payouts',
        schema: z.array(payoutSchema),
        query,
      }),
  };
}

/**
 * Admin settlements, adjustments and reconciliation (docs/api/API_SPEC.md §103). Approve,
 * process and adjustments require SUPER_ADMIN.
 */
export function createAdminFinanceApi(client: ApiClient) {
  return {
    settlements: (
      query: Partial<AdminSettlementListQuery> = {},
    ): Promise<ApiResult<Settlement[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/settlements',
        schema: z.array(settlementSchema),
        query,
      }),
    settlement: async (settlementId: string): Promise<SettlementDetail> =>
      (
        await client.request({
          method: 'GET',
          path: `/admin/settlements/${id(settlementId)}`,
          schema: settlementDetailSchema,
        })
      ).data,
    approve: async (settlementId: string): Promise<SettlementDetail> =>
      (
        await client.request({
          method: 'POST',
          path: `/admin/settlements/${id(settlementId)}/approve`,
          schema: settlementDetailSchema,
        })
      ).data,
    /** Reuse the same `idempotencyKey` when retrying the same process request. */
    process: async (settlementId: string, idempotencyKey: string): Promise<SettlementDetail> =>
      (
        await client.request({
          method: 'POST',
          path: `/admin/settlements/${id(settlementId)}/process`,
          schema: settlementDetailSchema,
          idempotencyKey,
        })
      ).data,
    adjustments: (
      query: Partial<AdjustmentListQuery> = {},
    ): Promise<ApiResult<FinancialAdjustment[]>> =>
      client.request({
        method: 'GET',
        path: '/admin/financial-adjustments',
        schema: z.array(financialAdjustmentSchema),
        query,
      }),
    createAdjustment: async (
      body: CreateFinancialAdjustmentRequest,
      idempotencyKey: string,
    ): Promise<FinancialAdjustment> =>
      (
        await client.request({
          method: 'POST',
          path: '/admin/financial-adjustments',
          body,
          schema: financialAdjustmentSchema,
          idempotencyKey,
        })
      ).data,
    reconciliation: async (): Promise<ReconciliationReport> =>
      (
        await client.request({
          method: 'GET',
          path: '/admin/finance/reconciliation',
          schema: reconciliationReportSchema,
        })
      ).data,
  };
}
