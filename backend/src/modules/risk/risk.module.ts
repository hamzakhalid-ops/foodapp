import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxProcessor } from '../../common/outbox/outbox.processor';
import { RiskAdminService } from './risk-admin.service';
import { RiskAdminController } from './risk.controller';
import { RiskService } from './risk.service';

/**
 * Risk module — Trust & Risk Engine — signals, configurable rules, flags, restrictions for CUSTOMER / RESTAURANT / RIDER (RISK_RULES).
 *
 * Owns tables: risk_events, risk_rules, risk_flags, risk_restrictions.
 * Implemented in slice: Cross-slice (first use: 7 — Checkout) (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  controllers: [RiskAdminController],
  providers: [RiskService, RiskAdminService],
  exports: [RiskService, RiskAdminService],
})
export class RiskModule implements OnModuleInit {
  constructor(
    private readonly risk: RiskService,
    private readonly outbox: OutboxProcessor,
  ) {}

  onModuleInit(): void {
    this.outbox.register('risk.event_recorded', 'risk.evaluate', async (event) => {
      await this.risk.evaluate((event.payload as { riskEventId: string }).riskEventId);
    });
  }
}
