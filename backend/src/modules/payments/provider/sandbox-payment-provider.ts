import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { type Redis } from 'ioredis';
import {
  type PaymentNextAction,
  type PaymentProvider,
  type ProviderPayment,
  type ProviderRefund,
  type VerifiedWebhookEvent,
} from './payment-provider';

const SIGNATURE_HEADER = 'x-sandbox-signature';
const TOLERANCE_SECONDS = 300;
const TTL_SECONDS = 7 * 24 * 3600;

/**
 * Development/test stand-in for a real payment provider (ADR-0014 §5). It keeps simulated provider
 * state in Redis, signs webhooks with HMAC-SHA256 (`t=<unix>,v1=<hex>` over `<t>.<body>`) and is
 * refused by configuration validation in staging/production.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';
  private readonly secret: string;

  constructor(
    private readonly redis: Redis,
    secret: string,
  ) {
    this.secret = secret || randomBytes(32).toString('hex');
  }

  async createPayment(input: { reference: string; amount: string; currency: string }) {
    const payment: ProviderPayment = {
      providerPaymentId: `sbx_pay_${randomUUID()}`,
      status: 'PENDING',
      amount: input.amount,
      currency: input.currency,
      failureReason: null,
    };
    await this.save(`pay:${payment.providerPaymentId}`, payment);
    return {
      providerPaymentId: payment.providerPaymentId,
      nextAction: this.nextAction(payment.providerPaymentId),
    };
  }

  nextAction(providerPaymentId: string): PaymentNextAction {
    return {
      type: 'REDIRECT',
      url: `https://sandbox.payments.invalid/checkout/${providerPaymentId}`,
    };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const payment = await this.load<ProviderPayment>(`pay:${providerPaymentId}`);
    if (!payment) throw new Error('Sandbox payment not found');
    return payment;
  }

  async createRefund(input: {
    providerPaymentId: string;
    reference: string;
    amount: string;
    currency: string;
  }): Promise<ProviderRefund> {
    const payment = await this.getPayment(input.providerPaymentId);
    if (payment.status !== 'SUCCEEDED') throw new Error('Sandbox payment is not captured');
    const refund: ProviderRefund = {
      providerRefundId: `sbx_ref_${randomUUID()}`,
      providerPaymentId: input.providerPaymentId,
      status: 'SUCCEEDED',
      amount: input.amount,
      currency: input.currency,
    };
    await this.save(`ref:${refund.providerRefundId}`, refund);
    return refund;
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): VerifiedWebhookEvent | null {
    const header = headers[SIGNATURE_HEADER];
    if (typeof header !== 'string') return null;
    const parts = new Map(header.split(',').map((part) => part.split('=', 2) as [string, string]));
    const timestamp = Number(parts.get('t'));
    const v1 = parts.get('v1');
    const signature = v1 ? Buffer.from(v1, 'hex') : null;
    if (!Number.isInteger(timestamp) || !signature) return null;
    if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return null;
    const expected = this.sign(timestamp, rawBody);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    try {
      return JSON.parse(rawBody.toString('utf8')) as VerifiedWebhookEvent;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ simulation (dev/test only)

  /** Simulates the customer finishing (or failing) the payment at the provider. */
  async simulateOutcome(
    providerPaymentId: string,
    outcome: 'SUCCEEDED' | 'FAILED' | 'AUTHORIZED',
  ): Promise<ProviderPayment> {
    const payment = await this.getPayment(providerPaymentId);
    const updated: ProviderPayment = {
      ...payment,
      status: outcome,
      failureReason: outcome === 'FAILED' ? 'The payment was declined.' : null,
    };
    await this.save(`pay:${providerPaymentId}`, updated);
    return updated;
  }

  /** Builds a signed webhook delivery exactly as the provider would send it. */
  signedWebhook(
    event: VerifiedWebhookEvent,
    at = Date.now(),
  ): { body: Buffer; headers: Record<string, string> } {
    const body = Buffer.from(JSON.stringify(event));
    const timestamp = Math.floor(at / 1000);
    return {
      body,
      headers: {
        [SIGNATURE_HEADER]: `t=${timestamp},v1=${this.sign(timestamp, body).toString('hex')}`,
      },
    };
  }

  private sign(timestamp: number, body: Buffer): Buffer {
    return createHmac('sha256', this.secret).update(`${timestamp}.`).update(body).digest();
  }

  private async save(key: string, value: object): Promise<void> {
    await this.redis.set(`sandbox:payments:${key}`, JSON.stringify(value), 'EX', TTL_SECONDS);
  }

  private async load<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(`sandbox:payments:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }
}
