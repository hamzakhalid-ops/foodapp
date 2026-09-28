import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { AdminConfigurationService } from './admin-configuration.service';
import { AdminReadService } from './admin-read.service';
import { AdminRestaurantsController } from './admin-restaurants.controller';
import { AdminController } from './admin.controller';

/**
 * Admin module — admin operations and system configuration. Acts only through domain modules'
 * services; no direct table manipulation (ADMIN_SPEC §3, §67).
 *
 * Owns tables: system_settings.
 */
@Module({
  imports: [RestaurantsModule, OrdersModule],
  controllers: [AdminRestaurantsController, AdminController],
  providers: [AdminReadService, AdminConfigurationService],
})
export class AdminModule {}
