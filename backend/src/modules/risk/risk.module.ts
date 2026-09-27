import { Module } from '@nestjs/common';

/**
 * Risk module — Trust & Risk Engine — signals, configurable rules, flags, restrictions for CUSTOMER / RESTAURANT / RIDER (RISK_RULES).
 *
 * Owns tables: risk_events, risk_rules, risk_flags, risk_restrictions.
 * Implemented in slice: 7 — Checkout (integration) / 18 — Admin Operations (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class RiskModule {}
