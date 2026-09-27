import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';

/**
 * Customers module — Customer profile and delivery addresses.
 *
 * Owns tables: customer_profiles, addresses.
 * Implemented in slice: 2 — Customer Profile (docs/IMPLEMENTATION_PLAN.md). Slice 1 only creates
 * the profile record at registration.
 */
@Module({
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
