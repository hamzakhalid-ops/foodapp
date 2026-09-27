import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { AdminRestaurantsController } from './admin-restaurants.controller';

/**
 * Admin module — admin operations and system configuration. Acts only through domain modules'
 * services; no direct table manipulation (ADMIN_SPEC §3, §67).
 *
 * Owns tables: system_settings.
 */
@Module({
  imports: [RestaurantsModule],
  controllers: [AdminRestaurantsController],
})
export class AdminModule {}
