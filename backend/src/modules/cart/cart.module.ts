import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * Cart module — Server-side cart and backend recalculation (API_SPEC §32–36).
 *
 * Owns tables: carts, cart_items, cart_item_variations, cart_item_add_ons (ADR-0014 §4).
 * Implemented in slice: 6 — Cart (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RestaurantsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
