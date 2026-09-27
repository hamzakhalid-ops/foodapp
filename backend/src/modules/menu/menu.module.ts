import { Module } from '@nestjs/common';

/**
 * Menu module — Categories, items, variations, add-ons and item availability. Authoritative menu prices (ARCHITECTURE §9).
 *
 * Owns tables: menu_categories, menu_items, item_variations, item_add_ons.
 * Implemented in slice: 4 — Menu (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class MenuModule {}
