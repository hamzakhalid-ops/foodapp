import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import {
  type SandboxPaymentOutcomeRequest,
  sandboxPaymentOutcomeRequestSchema,
} from '@quickbite/validation';
import { Public } from '../../common/auth/auth.decorators';
import { notFound } from '../../common/http/errors';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider/payment-provider';
import { SandboxPaymentProvider } from './provider/sandbox-payment-provider';

/**
 * Development/test only (ADR-0014 §5): plays the customer at the sandbox provider and delivers the
 * resulting signed webhook through the normal webhook path. Returns 404 unless the sandbox adapter
 * is active, and configuration refuses the sandbox in staging/production.
 */
@Controller('sandbox/payments')
@Public()
export class SandboxPaymentsController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly payments: PaymentsService,
  ) {}

  @Post(':providerPaymentId/outcome')
  @HttpCode(HttpStatus.OK)
  async outcome(
    @Param('providerPaymentId') providerPaymentId: string,
    @Body(new ZodValidationPipe(sandboxPaymentOutcomeRequestSchema))
    body: SandboxPaymentOutcomeRequest,
  ): Promise<{ status: string }> {
    if (!(this.provider instanceof SandboxPaymentProvider)) throw notFound();
    const payment = await this.provider
      .simulateOutcome(providerPaymentId, body.outcome)
      .catch(() => {
        throw notFound();
      });
    const webhook = this.provider.signedWebhook({
      eventId: randomUUID(),
      type: 'payment',
      payment,
    });
    await this.payments.handleWebhook(this.provider.name, webhook.body, webhook.headers);
    return { status: payment.status };
  }
}
