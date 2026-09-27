import { Module } from '@nestjs/common';

/**
 * Audit module — Append-only audit logging for sensitive and financial actions.
 *
 * Owns tables: audit_logs.
 * Implemented in slice: Cross-slice (first use: 1 — Authentication) (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class AuditModule {}
