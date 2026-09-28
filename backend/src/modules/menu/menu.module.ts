import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

/**
 * Menu module — Categories, items, variations, add-ons and item availability. Authoritative menu prices (ARCHITECTURE §9).
 *
 * Owns tables: menu_categories, menu_items, item_variations, item_add_ons.
 * Implemented in slice: 4 — Menu (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RestaurantsModule],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
