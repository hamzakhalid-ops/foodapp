import { HttpStatus, Injectable } from '@nestjs/common';
import { type MfaSetup, type MfaStatus } from '@quickbite/validation';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { conflict, notFound } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from '../../common/security/totp';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';

const invalidCode = () =>
  new ApiException(HttpStatus.UNAUTHORIZED, 'AUTH_MFA_INVALID', 'The code is not valid.');

/**
 * TOTP enrolment and verification for admin accounts (AUTH_AUTHORIZATION §34–38). A successful
 * verification marks the current session; admin routes and step-up checks read that timestamp.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  async status(auth: AuthContext): Promise<MfaStatus> {
    const factor = await this.prisma.userMfaFactor.findUnique({ where: { userId: auth.userId } });
    return {
      enrolled: !!factor?.confirmedAt,
      verifiedAt: auth.mfaVerifiedAt?.toISOString() ?? null,
    };
  }

  /** Starts (or restarts, while unconfirmed) enrolment. Replacing a confirmed factor needs a reset. */
  async setup(auth: AuthContext): Promise<MfaSetup> {
    const existing = await this.prisma.userMfaFactor.findUnique({
      where: { userId: auth.userId },
    });
    if (existing?.confirmedAt) {
      throw conflict('INVALID_REQUEST', 'An authenticator is already enrolled.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret, this.config.get('MFA_ENCRYPTION_KEY'));
    await this.prisma.userMfaFactor.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, secretEncrypted },
      update: { secretEncrypted, lastUsedStep: null },
    });
    return {
      secret,
      otpauthUrl: otpauthUrl(secret, user.email ?? user.phone ?? user.id, 'QuickBite'),
    };
  }

  async confirm(auth: AuthContext, code: string, meta: RequestMeta): Promise<MfaStatus> {
    const factor = await this.prisma.userMfaFactor.findUnique({ where: { userId: auth.userId } });
    if (!factor || factor.confirmedAt) {
      throw conflict('INVALID_REQUEST', 'There is no pending authenticator enrolment.');
    }
    await this.check(auth, factor, code, meta);
    await this.prisma.userMfaFactor.update({
      where: { id: factor.id },
      data: { confirmedAt: new Date() },
    });
    await this.audit.record({
      action: 'MFA_ENABLED',
      actorUserId: auth.userId,
      entityType: 'user',
      entityId: auth.userId,
      meta,
    });
    return this.status({ ...auth, mfaVerifiedAt: await this.markSession(auth) });
  }

  async verify(auth: AuthContext, code: string, meta: RequestMeta): Promise<MfaStatus> {
    const factor = await this.prisma.userMfaFactor.findUnique({ where: { userId: auth.userId } });
    if (!factor?.confirmedAt) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'AUTH_MFA_REQUIRED',
        'Set up an authenticator first.',
        { reason: 'MFA_NOT_ENROLLED' },
      );
    }
    await this.check(auth, factor, code, meta);
    return this.status({ ...auth, mfaVerifiedAt: await this.markSession(auth) });
  }

  /** SUPER_ADMIN recovery for a lost authenticator: removes the factor and MFA on all sessions. */
  async reset(userId: string, actorUserId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.userMfaFactor.deleteMany({ where: { userId } });
      if (removed.count === 0) throw notFound('RESOURCE_NOT_FOUND', 'No authenticator enrolled.');
      await tx.userSession.updateMany({ where: { userId }, data: { mfaVerifiedAt: null } });
      await this.audit.record(
        { action: 'MFA_DISABLED', actorUserId, entityType: 'user', entityId: userId, meta },
        tx,
      );
    });
  }

  /** Rate-limited check; the step compare-and-set makes a code single-use even under races. */
  private async check(
    auth: AuthContext,
    factor: { id: string; secretEncrypted: string; lastUsedStep: bigint | null },
    code: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.rateLimit.consume('mfa:user', auth.userId, this.config.get('RATE_LIMIT_MFA_VERIFY'));
    const secret = decryptSecret(factor.secretEncrypted, this.config.get('MFA_ENCRYPTION_KEY'));
    const last = factor.lastUsedStep === null ? null : Number(factor.lastUsedStep);
    const step = verifyTotp(secret, code, last);
    const claimed =
      step !== null &&
      (
        await this.prisma.userMfaFactor.updateMany({
          where: {
            id: factor.id,
            OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
          },
          data: { lastUsedStep: BigInt(step) },
        })
      ).count === 1;
    if (!claimed) {
      await this.audit.record({
        action: 'MFA_FAILED',
        actorUserId: auth.userId,
        entityType: 'user',
        entityId: auth.userId,
        meta,
      });
      throw invalidCode();
    }
  }

  private async markSession(auth: AuthContext): Promise<Date> {
    const now = new Date();
    await this.prisma.userSession.update({
      where: { id: auth.sessionId },
      data: { mfaVerifiedAt: now },
    });
    return now;
  }
}
