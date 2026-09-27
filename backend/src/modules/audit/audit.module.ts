import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Audit module — append-only audit logging for sensitive and financial actions.
 *
 * Owns tables: audit_logs (DATABASE.md §59).
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
