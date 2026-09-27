import { randomUUID } from 'node:crypto';
import { type Redis } from 'ioredis';
import { type PayoutProvider, type ProviderPayout } from './payout-provider';

const TTL_SECONDS = 30 * 24 * 3600;

/**
 * Development/test stand-in for a payout provider. Payouts stay PROCESSING until
 * `simulateOutcome` settles them; state lives in Redis. Refused in staging/production by
 * configuration validation.
 */
export class SandboxPayoutProvider implements PayoutProvider {
  readonly name = 'sandbox';

  constructor(private readonly redis: Redis) {}

  async createPayout(input: {
    reference: string;
    recipientType: 'RESTAURANT' | 'RIDER';
    recipientId: string;
    amount: string;
    currency: string;
  }): Promise<ProviderPayout> {
    const payout: ProviderPayout = {
      providerReference: `sbx_po_${randomUUID()}`,
      reference: input.reference,
      status: 'PROCESSING',
      amount: input.amount,
      currency: input.currency,
      failureReason: null,
    };
    const claimed = await this.redis.set(
      this.key(`ref:${input.reference}`),
      payout.providerReference,
      'EX',
      TTL_SECONDS,
      'NX',
    );
    if (claimed !== 'OK') {
      const existing = await this.redis.get(this.key(`ref:${input.reference}`));
      return this.getPayout(existing ?? '');
    }
    await this.save(payout);
    return payout;
  }

  async getPayout(providerReference: string): Promise<ProviderPayout> {
    const raw = await this.redis.get(this.key(`po:${providerReference}`));
    if (!raw) throw new Error('Sandbox payout not found');
    return JSON.parse(raw) as ProviderPayout;
  }

  async simulateOutcome(
    providerReference: string,
    outcome: 'COMPLETED' | 'FAILED',
  ): Promise<ProviderPayout> {
    const payout = await this.getPayout(providerReference);
    if (payout.status !== 'PROCESSING') return payout;
    const updated: ProviderPayout = {
      ...payout,
      status: outcome,
      failureReason: outcome === 'FAILED' ? 'Sandbox: payout rejected by destination bank' : null,
    };
    await this.save(updated);
    return updated;
  }

  private async save(payout: ProviderPayout): Promise<void> {
    await this.redis.set(
      this.key(`po:${payout.providerReference}`),
      JSON.stringify(payout),
      'EX',
      TTL_SECONDS,
    );
  }

  private key(suffix: string): string {
    return `sandbox:payouts:${suffix}`;
  }
}
