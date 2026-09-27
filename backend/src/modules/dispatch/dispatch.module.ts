import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxProcessor } from '../../common/outbox/outbox.processor';
import { ScheduledTasks } from '../../infrastructure/scheduler/scheduler';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { RidersModule } from '../riders/riders.module';
import { RiskModule } from '../risk/risk.module';
import { DispatchOffersController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

/**
 * Dispatch module — Delivery Dispatch Engine: eligibility, ranking, offers, atomic assignment (ADR-0007).
 *
 * Owns tables: dispatch_offers, dispatch_settings.
 * Implemented in slice: 10 — Dispatch (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [DeliveriesModule, RidersModule, RiskModule],
  controllers: [DispatchOffersController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule implements OnModuleInit {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly outbox: OutboxProcessor,
    private readonly tasks: ScheduledTasks,
  ) {}

  onModuleInit(): void {
    this.outbox.register('order.status_changed', 'dispatch.on-ready', async (event) => {
      const payload = event.payload as { orderId: string; toStatus: string };
      if (payload.toStatus === 'READY_FOR_PICKUP')
        await this.dispatch.onOrderReady(payload.orderId);
    });
    this.tasks.register({ name: 'dispatch-tick', everyMs: 5_000, run: () => this.dispatch.tick() });
  }
}
