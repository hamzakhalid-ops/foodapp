/** Provider-side payment status after verification with the provider. */
export type ProviderPaymentStatus = 'PENDING' | 'AUTHORIZED' | 'SUCCEEDED' | 'FAILED';
export type ProviderRefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export interface ProviderPayment {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  /** Decimal string with 2 places. */
  amount: string;
  currency: string;
  failureReason: string | null;
}

export interface ProviderRefund {
  providerRefundId: string;
  providerPaymentId: string;
  status: ProviderRefundStatus;
  amount: string;
  currency: string;
}

/** A webhook whose signature and freshness were verified by the adapter. */
export type VerifiedWebhookEvent =
  | { eventId: string; type: 'payment'; payment: ProviderPayment }
  | { eventId: string; type: 'refund'; refund: ProviderRefund };

/** What the customer's app must do to complete the payment with the provider. */
export interface PaymentNextAction {
  type: 'REDIRECT';
  url: string;
}

/**
 * Payment provider port (CLAUDE.md §20, ADR-0008). Business logic depends on this interface only;
 * adapters are never called inside a database transaction (CLAUDE.md §9).
 */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: {
    reference: string;
    amount: string;
    currency: string;
  }): Promise<{ providerPaymentId: string; nextAction: PaymentNextAction }>;
  nextAction(providerPaymentId: string): PaymentNextAction;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  createRefund(input: {
    providerPaymentId: string;
    reference: string;
    amount: string;
    currency: string;
  }): Promise<ProviderRefund>;
  /** Returns null when the signature, timestamp or payload is invalid. */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): VerifiedWebhookEvent | null;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
