import { Module, type OnModuleInit } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { ScheduledTasks } from '../../infrastructure/scheduler/scheduler';
import { PayoutsService } from './payouts.service';
import { PAYOUT_PROVIDER } from './provider/payout-provider';
import { SandboxPayoutProvider } from './provider/sandbox-payout-provider';
import { SandboxPayoutsController } from './sandbox-payouts.controller';

/**
 * Payouts module — Payout initiation and state via provider abstraction; idempotent (FINANCIAL_SPEC §34–39).
 *
 * Owns tables: payouts.
 * Implemented in slice: 14 — Settlements (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  controllers: [SandboxPayoutsController],
  providers: [
    PayoutsService,
    {
      provide: PAYOUT_PROVIDER,
      inject: [REDIS_CLIENT],
      // Only the sandbox adapter exists; configuration refuses it outside development/test.
      useFactory: (redis: Redis) => new SandboxPayoutProvider(redis),
    },
  ],
  exports: [PayoutsService],
})
export class PayoutsModule implements OnModuleInit {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly tasks: ScheduledTasks,
  ) {}

  onModuleInit(): void {
    this.tasks.register({ name: 'payouts-sync', everyMs: 60_000, run: () => this.payouts.sync() });
  }
}
