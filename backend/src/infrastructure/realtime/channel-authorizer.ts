import { Injectable } from '@nestjs/common';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { DeliveriesService } from '../../modules/deliveries/deliveries.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { SupportService } from '../../modules/support/support.service';
import { PrismaService } from '../database/prisma.service';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATTERNS = {
  user: new RegExp(`^user:(${UUID})$`),
  order: new RegExp(`^order:(${UUID})$`),
  delivery: new RegExp(`^delivery:(${UUID})$`),
  restaurant: new RegExp(`^restaurant:(${UUID})(?::(orders|operations))?$`),
  rider: new RegExp(`^rider:(${UUID})$`),
  admin: /^admin:(operations|orders|dispatch|risk|support)$/,
  supportTicket: new RegExp(`^support_ticket:(${UUID})$`),
};
const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/**
 * Server-side subscription authorization (REALTIME_SPEC §7–14): the same ownership and tenant
 * rules as the REST API. Unknown channels are refused.
 */
@Injectable()
export class ChannelAuthorizer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly deliveries: DeliveriesService,
    private readonly support: SupportService,
  ) {}

  async canSubscribe(auth: AuthContext, channel: string): Promise<boolean> {
    const match = (pattern: RegExp) => pattern.exec(channel)?.[1];
    const userId = match(PATTERNS.user);
    if (userId) return userId === auth.userId;
    const orderId = match(PATTERNS.order);
    if (orderId) return this.orders.canViewById(orderId, auth);
    const deliveryId = match(PATTERNS.delivery);
    if (deliveryId) return this.deliveries.canView(deliveryId, auth);
    const restaurantId = match(PATTERNS.restaurant);
    if (restaurantId) {
      const staff = await this.prisma.restaurantStaff.count({
        where: { userId: auth.userId, restaurantId, status: 'ACTIVE' },
      });
      return staff > 0;
    }
    const riderId = match(PATTERNS.rider);
    if (riderId) {
      const rider = await this.prisma.riderProfile.findUnique({ where: { id: riderId } });
      return rider?.userId === auth.userId;
    }
    const ticketId = match(PATTERNS.supportTicket);
    if (ticketId) return this.support.canView(auth, ticketId);
    if (PATTERNS.admin.test(channel)) return auth.roles.some((role) => ADMIN_ROLES.has(role));
    return false;
  }
}
