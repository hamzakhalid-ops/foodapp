import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxProcessor } from '../../common/outbox/outbox.processor';
import { ScheduledTasks } from '../../infrastructure/scheduler/scheduler';
import { PayoutsModule } from '../payouts/payouts.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RidersModule } from '../riders/riders.module';
import { ReconciliationService } from './reconciliation.service';
import {
  AdminSettlementsController,
  RestaurantSettlementsController,
  RiderSettlementsController,
} from './settlements.controller';
import { SettlementsService } from './settlements.service';

/**
 * Settlements module — Settlement generation, settlement items, reconciliation, invoices and
 * manual financial adjustments (FINANCIAL_SPEC §17–18, §25–33, §44–46, §50–52).
 *
 * Owns tables: settlements, settlement_items, invoices, financial_adjustments.
 * Implemented in slice: 14 — Settlements (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [PayoutsModule, RestaurantsModule, RidersModule],
  controllers: [
    RestaurantSettlementsController,
    RiderSettlementsController,
    AdminSettlementsController,
  ],
  providers: [SettlementsService, ReconciliationService],
  exports: [SettlementsService, ReconciliationService],
})
export class SettlementsModule implements OnModuleInit {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly reconciliation: ReconciliationService,
    private readonly outbox: OutboxProcessor,
    private readonly tasks: ScheduledTasks,
  ) {}

  onModuleInit(): void {
    this.outbox.register('payout.status_changed', 'settlements.payout-finished', async (event) => {
      await this.settlements.onPayoutFinished(
        event.payload as { settlementId: string; payoutId: string; status: string },
      );
    });
    this.tasks.register({
      name: 'settlements-generate',
      everyMs: 3_600_000,
      run: async () => {
        await this.settlements.generate();
      },
    });
    this.tasks.register({
      name: 'financial-reconciliation',
      everyMs: 3_600_000,
      run: () => this.reconciliation.alert(),
    });
  }
}
