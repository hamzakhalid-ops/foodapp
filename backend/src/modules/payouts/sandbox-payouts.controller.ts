import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import {
  type SandboxPayoutOutcomeRequest,
  sandboxPayoutOutcomeRequestSchema,
} from '@quickbite/validation';
import { Public } from '../../common/auth/auth.decorators';
import { notFound } from '../../common/http/errors';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { PayoutsService } from './payouts.service';
import { PAYOUT_PROVIDER, type PayoutProvider } from './provider/payout-provider';
import { SandboxPayoutProvider } from './provider/sandbox-payout-provider';

/**
 * Development/test only: plays the payout provider's final answer, then lets the backend verify
 * it through the normal provider lookup. Returns 404 unless the sandbox adapter is active.
 */
@Controller('sandbox/payouts')
@Public()
export class SandboxPayoutsController {
  constructor(
    @Inject(PAYOUT_PROVIDER) private readonly provider: PayoutProvider,
    private readonly payouts: PayoutsService,
  ) {}

  @Post(':providerReference/outcome')
  @HttpCode(HttpStatus.OK)
  async outcome(
    @Param('providerReference') providerReference: string,
    @Body(new ZodValidationPipe(sandboxPayoutOutcomeRequestSchema))
    body: SandboxPayoutOutcomeRequest,
  ): Promise<{ status: string }> {
    if (!(this.provider instanceof SandboxPayoutProvider)) throw notFound();
    const payout = await this.provider
      .simulateOutcome(providerReference, body.outcome)
      .catch(() => {
        throw notFound();
      });
    await this.payouts.refreshByReference(providerReference);
    return { status: payout.status };
  }
}
