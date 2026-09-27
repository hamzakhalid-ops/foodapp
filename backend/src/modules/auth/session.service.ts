import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/http/api.exception';
import { type RequestMeta } from '../../common/http/request-meta';
import { generateOpaqueToken, sha256 } from '../../common/security/secrets';
import { AppConfigService } from '../../config/app-config.service';
import { type Prisma, SessionRevokedReason, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
}

/**
 * Server-side sessions and refresh-token rotation (AUTH_AUTHORIZATION §20–29, DATABASE.md §5.1).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async create(tx: Tx, userId: string, meta: RequestMeta): Promise<IssuedSession> {
    const now = Date.now();
    const session = await tx.userSession.create({
      data: {
        userId,
        expiresAt: new Date(now + this.config.get('SESSION_MAX_LIFETIME_SECONDS') * 1000),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    const refreshToken = await this.issueRefreshToken(tx, session.id, session.expiresAt);
    return { sessionId: session.id, refreshToken };
  }

  /**
   * Rotates a refresh token. A token can be used once; presenting a used token revokes the whole
   * session (reuse detection, §25). Concurrent use of the same token is treated as reuse.
   */
  async rotate(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<{ userId: string } & IssuedSession> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { session: { include: { user: true } } },
    });
    if (!record) throw this.refreshInvalid();

    const { session } = record;
    if (record.usedAt) {
      await this.handleReuse(session.id, session.userId, meta);
      throw this.refreshInvalid();
    }
    const now = new Date();
    if (session.revokedAt || session.expiresAt <= now || record.expiresAt <= now) {
      throw this.refreshInvalid();
    }
    if (
      session.user.status === UserStatus.SUSPENDED ||
      session.user.status === UserStatus.DEACTIVATED
    ) {
      await this.revoke(session.id, SessionRevokedReason.ACCOUNT_SUSPENDED);
      throw accountStatusError(session.user.status);
    }

    const rotated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) return null;
      await tx.userSession.update({ where: { id: session.id }, data: { lastUsedAt: now } });
      return this.issueRefreshToken(tx, session.id, session.expiresAt);
    });

    if (!rotated) {
      await this.handleReuse(session.id, session.userId, meta);
      throw this.refreshInvalid();
    }
    return { userId: session.userId, sessionId: session.id, refreshToken: rotated };
  }

  /** Revokes one session if still active. Returns true when this call revoked it. */
  async revoke(
    sessionId: string,
    reason: SessionRevokedReason,
    tx: Tx = this.prisma,
  ): Promise<boolean> {
    const result = await tx.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count === 1;
  }

  async revokeAllForUser(tx: Tx, userId: string, reason: SessionRevokedReason): Promise<number> {
    const result = await tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  private async issueRefreshToken(
    tx: Tx,
    sessionId: string,
    sessionExpiresAt: Date,
  ): Promise<string> {
    const token = generateOpaqueToken();
    const ttlExpiry = Date.now() + this.config.get('REFRESH_TOKEN_TTL_SECONDS') * 1000;
    await tx.refreshToken.create({
      data: {
        sessionId,
        tokenHash: sha256(token),
        // A refresh token never outlives its session (§67).
        expiresAt: new Date(Math.min(ttlExpiry, sessionExpiresAt.getTime())),
      },
    });
    return token;
  }

  private async handleReuse(sessionId: string, userId: string, meta: RequestMeta): Promise<void> {
    const revoked = await this.revoke(sessionId, SessionRevokedReason.REFRESH_TOKEN_REUSE);
    await this.audit.record({
      action: AUDIT_ACTIONS.REFRESH_TOKEN_REUSE_DETECTED,
      actorUserId: userId,
      entityType: 'SESSION',
      entityId: sessionId,
      metadata: { sessionRevoked: revoked },
      meta,
    });
  }

  private refreshInvalid() {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'AUTH_REFRESH_TOKEN_INVALID',
      'The session is no longer valid. Please log in again.',
    );
  }
}

export function accountStatusError(status: UserStatus): ApiException {
  return status === UserStatus.SUSPENDED
    ? new ApiException(HttpStatus.FORBIDDEN, 'AUTH_ACCOUNT_SUSPENDED', 'This account is suspended.')
    : new ApiException(HttpStatus.FORBIDDEN, 'AUTH_ACCOUNT_DISABLED', 'This account is disabled.');
}
