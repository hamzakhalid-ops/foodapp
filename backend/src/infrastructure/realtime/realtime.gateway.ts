import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { type Redis } from 'ioredis';
import { type Server, type Socket } from 'socket.io';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { SessionAuthenticator } from '../../modules/auth/session-authenticator';
import { PrismaService } from '../database/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ChannelAuthorizer } from './channel-authorizer';
import { REALTIME_PUBSUB_CHANNEL, type RealtimeEnvelope } from './realtime.publisher';

/** How often live sockets are re-checked against their server-side session (REALTIME_SPEC §6). */
const SESSION_CHECK_MS = 30_000;

/** `socket.data` is untyped in Socket.IO; the auth middleware always sets `auth`. */
const authOf = (socket: Socket): AuthContext => (socket.data as { auth: AuthContext }).auth;

interface SubscribeAck {
  ok: boolean;
  channel?: string;
  error?: { code: string; message: string };
}

/**
 * Socket.IO gateway (REALTIME_SPEC, ADR-0014 §7). Connections authenticate with the HTTP access
 * token (`auth.token` or an `Authorization: Bearer` header) and are joined to `user:{id}` (and
 * `rider:{id}` for riders). Other channels require an explicit, server-authorized `subscribe`.
 * Events arrive from any process through Redis pub/sub. Realtime is an optimisation: clients
 * recover authoritative state over REST.
 */
@WebSocketGateway({ path: '/realtime', serveClient: false })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private subscriber: Redis | null = null;
  private sessionTimer: NodeJS.Timeout | null = null;

  @WebSocketServer() private server!: Server;

  constructor(
    private readonly sessions: SessionAuthenticator,
    private readonly channels: ChannelAuthorizer,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = handshakeToken(socket);
      if (!token) {
        next(new Error('AUTH_TOKEN_INVALID'));
        return;
      }
      this.sessions
        .authenticate(token, { allowUnverified: false })
        .then((auth) => {
          (socket.data as { auth: AuthContext }).auth = auth;
          next();
        })
        .catch((error: unknown) => {
          next(new Error(error instanceof ApiException ? error.code : 'AUTH_TOKEN_INVALID'));
        });
    });

    this.subscriber = this.redis.duplicate();
    this.subscriber.on('error', (error: unknown) => {
      this.logger.warn({ err: error }, 'Realtime Redis subscriber error');
    });
    this.subscriber.on('message', (_channel: string, message: string) => {
      const envelope = JSON.parse(message) as RealtimeEnvelope;
      server.to(envelope.channel).emit(envelope.eventType, envelope);
    });
    void this.subscriber.subscribe(REALTIME_PUBSUB_CHANNEL).catch((error: unknown) => {
      this.logger.error({ err: error }, 'Realtime subscription to Redis failed');
    });

    this.sessionTimer = setInterval(() => void this.revalidateSessions(), SESSION_CHECK_MS);
    this.sessionTimer.unref();
  }

  async handleConnection(socket: Socket): Promise<void> {
    const auth = authOf(socket);
    await socket.join(`user:${auth.userId}`);
    if (auth.roles.includes('RIDER')) {
      const rider = await this.prisma.riderProfile.findUnique({ where: { userId: auth.userId } });
      if (rider) await socket.join(`rider:${rider.id}`);
    }
    socket.emit('session.ready', { userId: auth.userId });
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { channel?: unknown } | undefined,
  ): Promise<SubscribeAck> {
    const channel = typeof body?.channel === 'string' ? body.channel : '';
    if (!(await this.channels.canSubscribe(authOf(socket), channel))) {
      return {
        ok: false,
        error: { code: 'AUTHZ_FORBIDDEN', message: 'You cannot subscribe to this channel.' },
      };
    }
    await socket.join(channel);
    return { ok: true, channel };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { channel?: unknown } | undefined,
  ): Promise<SubscribeAck> {
    const channel = typeof body?.channel === 'string' ? body.channel : '';
    await socket.leave(channel);
    return { ok: true, channel };
  }

  /** Revoked/expired sessions and suspended accounts stop receiving events (REALTIME_SPEC §6). */
  async revalidateSessions(): Promise<void> {
    const sockets = await this.server.fetchSockets();
    const sessionOf = (socket: (typeof sockets)[number]) =>
      (socket.data as { auth: AuthContext }).auth.sessionId;
    const inactive = await this.sessions.inactiveSessions([...new Set(sockets.map(sessionOf))]);
    for (const socket of sockets) {
      if (inactive.has(sessionOf(socket))) {
        socket.emit('error', { code: 'AUTH_TOKEN_INVALID', message: 'Your session has ended.' });
        socket.disconnect(true);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    if (this.subscriber) this.subscriber.disconnect();
    await Promise.resolve();
  }
}

function handshakeToken(socket: Socket): string | null {
  const fromAuth: unknown = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
  const header = socket.handshake.headers.authorization;
  const [scheme, value] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
