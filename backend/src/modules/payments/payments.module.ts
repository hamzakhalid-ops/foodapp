import { Module } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RiskModule } from '../risk/risk.module';
import {
  AdminPaymentsController,
  PaymentsController,
  PaymentWebhooksController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './provider/payment-provider';
import { SandboxPaymentProvider } from './provider/sandbox-payment-provider';
import { RefundsService } from './refunds.service';
import { SandboxPaymentsController } from './sandbox-payments.controller';

/**
 * Payments module — Online payment and COD, provider abstraction, webhooks, refunds (PAYMENT_RULES).
 *
 * Owns tables: payments, refunds, payment_webhook_events.
 * Implemented in slice: 8 — Payments (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RiskModule],
  controllers: [
    PaymentsController,
    PaymentWebhooksController,
    AdminPaymentsController,
    SandboxPaymentsController,
  ],
  providers: [
    PaymentsService,
    RefundsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService, REDIS_CLIENT],
      // Only the sandbox adapter exists; configuration refuses it outside development/test.
      useFactory: (config: AppConfigService, redis: Redis) =>
        new SandboxPaymentProvider(redis, config.get('PAYMENT_SANDBOX_WEBHOOK_SECRET')),
    },
  ],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
