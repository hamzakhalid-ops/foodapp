import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { RestaurantStaffModule } from './restaurant-staff/restaurant-staff.module';
import { MenuModule } from './menu/menu.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrdersModule } from './orders/orders.module';
import { CancellationModule } from './cancellation/cancellation.module';
import { PaymentsModule } from './payments/payments.module';
import { RidersModule } from './riders/riders.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { RiskModule } from './risk/risk.module';
import { PromotionsModule } from './promotions/promotions.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';
import { EarningsModule } from './earnings/earnings.module';
import { SettlementsModule } from './settlements/settlements.module';
import { PayoutsModule } from './payouts/payouts.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';

/**
 * Domain module boundaries of the modular monolith (ADR-0001).
 * These are in-process modules, not services. See src/modules/README.md.
 */
export const DOMAIN_MODULES = [
  AuthModule,
  UsersModule,
  CustomersModule,
  RestaurantsModule,
  RestaurantStaffModule,
  MenuModule,
  DiscoveryModule,
  CartModule,
  CheckoutModule,
  OrdersModule,
  CancellationModule,
  PaymentsModule,
  RidersModule,
  DispatchModule,
  DeliveriesModule,
  RiskModule,
  PromotionsModule,
  ReviewsModule,
  NotificationsModule,
  SupportModule,
  EarningsModule,
  SettlementsModule,
  PayoutsModule,
  AdminModule,
  AuditModule,
];
