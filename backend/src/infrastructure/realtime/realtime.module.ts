import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { DeliveriesModule } from '../../modules/deliveries/deliveries.module';
import { OrdersModule } from '../../modules/orders/orders.module';
import { ChannelAuthorizer } from './channel-authorizer';
import { RealtimeGateway } from './realtime.gateway';

/** Socket.IO gateway — API process only (the worker publishes through RealtimePublisher). */
@Module({
  imports: [AuthModule, OrdersModule, DeliveriesModule],
  providers: [RealtimeGateway, ChannelAuthorizer],
})
export class RealtimeModule {}
