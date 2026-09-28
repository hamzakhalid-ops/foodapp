/** Provider-side payout status after verification with the provider. */
export type ProviderPayoutStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ProviderPayout {
  providerReference: string;
  /** Our payout id, echoed back by the provider. */
  reference: string;
  status: ProviderPayoutStatus;
  /** Decimal string with 2 places. */
  amount: string;
  currency: string;
  failureReason: string | null;
}

/**
 * Payout provider port (FINANCIAL_SPEC §39, CLAUDE.md §20). Business logic depends on this
 * interface only; adapters are never called inside a database transaction.
 */
export interface PayoutProvider {
  readonly name: string;
  /**
   * Idempotent on `reference`: repeating the call for the same payout returns the existing
   * provider payout instead of transferring twice (FINANCIAL_SPEC §37).
   */
  createPayout(input: {
    reference: string;
    recipientType: 'RESTAURANT' | 'RIDER';
    recipientId: string;
    amount: string;
    currency: string;
  }): Promise<ProviderPayout>;
  getPayout(providerReference: string): Promise<ProviderPayout>;
}

export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');
