import { HttpStatus, Injectable } from '@nestjs/common';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { accountStatusError } from './session.service';
import { TokenService } from './token.service';

/**
 * Access-token authentication shared by HTTP and WebSocket (AUTH_AUTHORIZATION §58–59,
 * REALTIME_SPEC §5–6). The signature is not enough: the server-side session must be active and
 * unexpired, and account status and roles come from the database.
 */
@Injectable()
export class SessionAuthenticator {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(token: string, options: { allowUnverified: boolean }): Promise<AuthContext> {
    const claims = this.tokens.verifyAccessToken(token);
    const session = await this.prisma.userSession.findUnique({
      where: { id: claims.sid },
      include: { user: { include: { roles: { select: { role: true } } } } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw unauthenticated();
    }
    const { user } = session;
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw accountStatusError(user.status);
    }
    if (user.status === UserStatus.PENDING_VERIFICATION && !options.allowUnverified) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'AUTH_PHONE_NOT_VERIFIED',
        'Please verify your phone number to continue.',
      );
    }
    return {
      userId: user.id,
      sessionId: session.id,
      roles: user.roles.map((entry) => entry.role),
      status: user.status,
    };
  }

  /** Session ids from `sessionIds` that are no longer usable (revoked, expired, account blocked). */
  async inactiveSessions(sessionIds: string[]): Promise<Set<string>> {
    if (sessionIds.length === 0) return new Set();
    const active = await this.prisma.userSession.findMany({
      where: {
        id: { in: sessionIds },
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: { notIn: [UserStatus.SUSPENDED, UserStatus.DEACTIVATED] } },
      },
      select: { id: true },
    });
    const ok = new Set(active.map((row) => row.id));
    return new Set(sessionIds.filter((id) => !ok.has(id)));
  }
}

export function unauthenticated(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    'AUTH_TOKEN_INVALID',
    'Authentication is required.',
  );
}
