import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/http/api.exception';
import {
  constantTimeEqual,
  generateNumericCode,
  generateOpaqueToken,
  hmacSha256,
  sha256,
} from '../../common/security/secrets';
import { AppConfigService } from '../../config/app-config.service';
import {
  type Prisma,
  type VerificationChallenge,
  VerificationChallengeType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

type Tx = Prisma.TransactionClient;
type TokenChallengeType = Exclude<VerificationChallengeType, 'PHONE_VERIFICATION'>;

/**
 * One-time verification challenges (DATABASE.md §5.1, AUTH_AUTHORIZATION §14–17, §31–33).
 *
 * - Phone: 6-digit OTP, stored as HMAC(challengeId:code), limited attempts.
 * - Email verification / password reset: 256-bit token, stored as SHA-256, looked up by hash.
 * Plaintext secrets are returned to the caller only for delivery and are never persisted.
 */
@Injectable()
export class ChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async createPhoneChallenge(tx: Tx, userId: string, phone: string): Promise<string> {
    await this.invalidateActive(tx, userId, VerificationChallengeType.PHONE_VERIFICATION);
    const id = randomUUID();
    const code = generateNumericCode(6);
    await tx.verificationChallenge.create({
      data: {
        id,
        userId,
        type: VerificationChallengeType.PHONE_VERIFICATION,
        target: phone,
        secretHash: this.otpHash(id, code),
        maxAttempts: this.config.get('AUTH_OTP_MAX_ATTEMPTS'),
        expiresAt: this.expiresIn(this.config.get('AUTH_PHONE_OTP_TTL_SECONDS')),
      },
    });
    return code;
  }

  async createTokenChallenge(
    tx: Tx,
    userId: string,
    type: TokenChallengeType,
    target: string,
  ): Promise<string> {
    await this.invalidateActive(tx, userId, type);
    const token = generateOpaqueToken();
    const ttl =
      type === VerificationChallengeType.EMAIL_VERIFICATION
        ? this.config.get('AUTH_EMAIL_VERIFICATION_TTL_SECONDS')
        : this.config.get('AUTH_PASSWORD_RESET_TTL_SECONDS');
    await tx.verificationChallenge.create({
      data: {
        userId,
        type,
        target,
        secretHash: sha256(token),
        maxAttempts: 1,
        expiresAt: this.expiresIn(ttl),
      },
    });
    return token;
  }

  /**
   * Checks a phone code for the user's current phone. On a wrong code the attempt is counted
   * atomically; the challenge becomes unusable once the limit is reached.
   * Returns the challenge id to consume inside the caller's transaction.
   */
  async checkPhoneCode(userId: string, phone: string, code: string): Promise<string> {
    const challenge = await this.prisma.verificationChallenge.findFirst({
      where: {
        userId,
        type: VerificationChallengeType.PHONE_VERIFICATION,
        target: phone,
        consumedAt: null,
        invalidatedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw this.codeInvalid();
    this.assertUsable(challenge);

    if (!constantTimeEqual(challenge.secretHash, this.otpHash(challenge.id, code))) {
      const updated = await this.prisma.verificationChallenge.updateMany({
        where: { id: challenge.id, attempts: { lt: challenge.maxAttempts } },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count === 0 || challenge.attempts + 1 >= challenge.maxAttempts) {
        throw this.tooManyAttempts();
      }
      throw this.codeInvalid();
    }
    return challenge.id;
  }

  /** Finds a usable token challenge by its token (does not consume it). */
  async findTokenChallenge(
    type: TokenChallengeType,
    token: string,
  ): Promise<VerificationChallenge | null> {
    const challenge = await this.prisma.verificationChallenge.findUnique({
      where: { secretHash: sha256(token) },
    });
    if (!challenge || challenge.type !== type) return null;
    return challenge;
  }

  /** Throws the appropriate API error when the challenge can no longer be used. */
  assertUsable(challenge: VerificationChallenge, expiredError = this.codeExpired()): void {
    if (challenge.consumedAt || challenge.invalidatedAt) throw this.codeInvalid();
    if (challenge.attempts >= challenge.maxAttempts) throw this.tooManyAttempts();
    if (challenge.expiresAt.getTime() <= Date.now()) throw expiredError;
  }

  /** Single-use consumption; returns false if it was consumed concurrently. */
  async consume(tx: Tx, challengeId: string): Promise<boolean> {
    const result = await tx.verificationChallenge.updateMany({
      where: { id: challengeId, consumedAt: null, invalidatedAt: null },
      data: { consumedAt: new Date() },
    });
    return result.count === 1;
  }

  invalidateActive(tx: Tx, userId: string, type: VerificationChallengeType): Promise<unknown> {
    return tx.verificationChallenge.updateMany({
      where: { userId, type, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
  }

  private otpHash(challengeId: string, code: string): string {
    return hmacSha256(this.config.get('AUTH_SECRET_HASH_KEY'), `${challengeId}:${code}`);
  }

  private expiresIn(seconds: number): Date {
    return new Date(Date.now() + seconds * 1000);
  }

  private codeInvalid() {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'AUTH_VERIFICATION_CODE_INVALID',
      'The verification code is invalid.',
    );
  }

  private codeExpired() {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'AUTH_VERIFICATION_CODE_EXPIRED',
      'The verification code has expired. Please request a new one.',
    );
  }

  private tooManyAttempts() {
    return new ApiException(
      HttpStatus.TOO_MANY_REQUESTS,
      'AUTH_TOO_MANY_ATTEMPTS',
      'Too many incorrect attempts. Please request a new code.',
    );
  }
}
