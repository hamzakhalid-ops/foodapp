import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import { type Socket } from 'socket.io';

/**
 * Socket.IO gateway (docs/notifications/REALTIME_SPEC.md).
 *
 * FAIL-CLOSED FOUNDATION: authentication (Slice 1) and channel authorization do not exist yet, so
 * every connection is rejected. Channel subscriptions (`user:{id}`, `restaurant:{id}`,
 * `order:{id}`, ...) are implemented by the slices that own them, after the connection is
 * authenticated and each subscription is authorized server-side (REALTIME_SPEC §5–10).
 *
 * Realtime is an optimization; clients always recover authoritative state over REST.
 */
@WebSocketGateway({ path: '/realtime', serveClient: false })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket): void {
    this.logger.warn(
      { socket_id: client.id },
      'Realtime connection rejected: authentication not implemented',
    );
    client.emit('error', { code: 'AUTH_TOKEN_INVALID', message: 'Authentication is required.' });
    client.disconnect(true);
  }
}
