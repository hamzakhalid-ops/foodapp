import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Customers module — Customer profile and delivery addresses.
 *
 * Owns tables: customer_profiles, addresses.
 * Implemented in slice: 2 — Customer Profile (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
