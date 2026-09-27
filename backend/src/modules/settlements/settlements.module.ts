import { Module } from '@nestjs/common';

/**
 * Settlements module — Settlement generation, settlement items, reconciliation and invoices (FINANCIAL_SPEC §25–33, §44–46).
 *
 * Owns tables: settlements, settlement_items, invoices.
 * Implemented in slice: 14 — Settlements (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class SettlementsModule {}
