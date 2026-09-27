import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AuthTokens,
  type CurrentUser,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from '@quickbite/validation';
import { ApiException } from '../../common/http/api.exception';
import { type RequestMeta } from '../../common/http/request-meta';
import {
  Prisma,
  Role,
  SessionRevokedReason,
  UserStatus,
  VerificationChallengeType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { normalizeEmail, normalizePhone, parseIdentifier } from '../users/identity-normalization';
import { toCurrentUser, type UserWithRoles, UsersService } from '../users/users.service';
import { ChallengeService } from './challenge.service';
import { type VerificationSender, VERIFICATION_SENDER } from './delivery/verification-sender';
import { PasswordService } from './password.service';
import { accountStatusError, SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Authentication use cases (docs/api/API_SPEC.md §16–25, AUTH_AUTHORIZATION.md §7–33).
 *
 * Every state change runs in one database transaction together with its audit record. Delivery of
 * codes/tokens happens only after commit (CLAUDE.md §9); a failed delivery is logged and the user
 * can request a new code.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly customers: CustomersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly challenges: ChallengeService,
    private readonly audit: AuditService,
    @Inject(VERIFICATION_SENDER) private readonly sender: VerificationSender,
  ) {}

  /** Customer registration (API_SPEC §16). */
  register(input: RegisterRequest, meta: RequestMeta): Promise<RegisterResponse> {
    return this.registerAccount(
      {
        email: input.email,
        phone: input.phone,
        password: input.password,
        role: Role.CUSTOMER,
        createProfile: (tx, userId) =>
          this.customers.createProfile(tx, userId, {
            firstName: input.firstName,
            lastName: input.lastName,
          }),
      },
      meta,
    );
  }

  /**
   * Shared account creation. The role is decided by the calling backend workflow, never by the
   * client (AUTH_AUTHORIZATION §120–121).
   */
  async registerAccount(
    input: {
      email: string;
      phone: string;
      password: string;
      role: Role;
      createProfile: (tx: Prisma.TransactionClient, userId: string) => Promise<void>;
    },
    meta: RequestMeta,
  ): Promise<RegisterResponse> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!phone) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'The request failed validation.',
        {
          fields: { phone: 'Phone number must be in international format, e.g. +923001234567' },
        },
      );
    }
    this.passwords.assertMeetsPolicy(input.password);
    const passwordHash = await this.passwords.hash(input.password);

    let created: { user: UserWithRoles; phoneCode: string; emailToken: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findFirst({
          where: { OR: [{ email }, { phone }] },
          select: { id: true },
        });
        if (existing) throw accountExists();

        const user = await this.users.createUser(tx, {
          email,
          phone,
          passwordHash,
          role: input.role,
        });
        await input.createProfile(tx, user.id);
        const phoneCode = await this.challenges.createPhoneChallenge(tx, user.id, phone);
        const emailToken = await this.challenges.createTokenChallenge(
          tx,
          user.id,
          VerificationChallengeType.EMAIL_VERIFICATION,
          email,
        );
        await this.audit.record(
          {
            action: AUDIT_ACTIONS.USER_REGISTERED,
            actorUserId: user.id,
            entityType: 'USER',
            entityId: user.id,
            metadata: { role: input.role },
            meta,
          },
          tx,
        );
        return { user, phoneCode, emailToken };
      });
    } catch (error) {
      // Concurrent registration with the same email/phone hits the unique constraint.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw accountExists();
      }
      throw error;
    }

    await this.deliver(() => this.sender.sendPhoneVerificationCode(phone, created.phoneCode));
    await this.deliver(() => this.sender.sendEmailVerificationToken(email, created.emailToken));

    return {
      user: toCurrentUser(created.user),
      verification: { phoneRequired: true, emailRequired: true },
    };
  }

  async login(identifierRaw: string, password: string, meta: RequestMeta): Promise<LoginResponse> {
    const identifier = parseIdentifier(identifierRaw);
    const user = identifier ? await this.users.findByIdentifier(identifier) : null;
    const passwordOk = await this.passwords.verify(user?.passwordHash ?? null, password);

    if (!user || !passwordOk) {
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
        actorUserId: user?.id ?? null,
        entityType: user ? 'USER' : undefined,
        entityId: user?.id,
        metadata: { reason: 'INVALID_CREDENTIALS' },
        meta,
      });
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_INVALID_CREDENTIALS',
        'The email/phone or password is incorrect.',
      );
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      await this.audit.record({
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
        actorUserId: user.id,
        entityType: 'USER',
        entityId: user.id,
        metadata: { reason: user.status },
        meta,
      });
      throw accountStatusError(user.status);
    }

    const issued = await this.prisma.$transaction(async (tx) => {
      const session = await this.sessions.create(tx, user.id, meta);
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          actorUserId: user.id,
          entityType: 'SESSION',
          entityId: session.sessionId,
          meta,
        },
        tx,
      );
      return session;
    });

    return {
      ...this.credentials(user.id, issued.sessionId, issued.refreshToken),
      user: toCurrentUser(user),
    };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const rotated = await this.sessions.rotate(refreshToken, meta);
    return this.credentials(rotated.userId, rotated.sessionId, rotated.refreshToken);
  }

  async logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await this.sessions.revoke(sessionId, SessionRevokedReason.LOGOUT, tx);
      if (revoked) {
        await this.audit.record(
          {
            action: AUDIT_ACTIONS.LOGOUT,
            actorUserId: userId,
            entityType: 'SESSION',
            entityId: sessionId,
            meta,
          },
          tx,
        );
      }
    });
  }

  async verifyPhone(userId: string, code: string, meta: RequestMeta): Promise<CurrentUser> {
    const user = await this.requireUser(userId);
    if (user.phoneVerifiedAt || !user.phone) return toCurrentUser(user);

    const challengeId = await this.challenges.checkPhoneCode(user.id, user.phone, code);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (!(await this.challenges.consume(tx, challengeId))) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'AUTH_VERIFICATION_CODE_INVALID',
          'The verification code is invalid.',
        );
      }
      const result = await tx.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
          // Account activation rule: DATABASE.md §5.3.
          ...(user.status === UserStatus.PENDING_VERIFICATION ? { status: UserStatus.ACTIVE } : {}),
        },
        include: { roles: { select: { role: true } } },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.PHONE_VERIFIED,
          actorUserId: user.id,
          entityType: 'USER',
          entityId: user.id,
          oldValues: { status: user.status },
          newValues: { status: result.status },
          meta,
        },
        tx,
      );
      return result;
    });
    return toCurrentUser(updated);
  }

  async resendPhoneVerification(userId: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.phoneVerifiedAt || !user.phone) return;
    const phone = user.phone;
    const code = await this.prisma.$transaction((tx) =>
      this.challenges.createPhoneChallenge(tx, user.id, phone),
    );
    await this.deliver(() => this.sender.sendPhoneVerificationCode(phone, code));
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    const challenge = await this.challenges.findTokenChallenge(
      VerificationChallengeType.EMAIL_VERIFICATION,
      token,
    );
    if (!challenge) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'AUTH_VERIFICATION_CODE_INVALID',
        'The verification link is invalid.',
      );
    }
    this.challenges.assertUsable(challenge);
    const user = await this.requireUser(challenge.userId);
    if (user.email !== challenge.target) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'AUTH_VERIFICATION_CODE_INVALID',
        'The verification link is invalid.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (!(await this.challenges.consume(tx, challenge.id))) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'AUTH_VERIFICATION_CODE_INVALID',
          'The verification link is invalid.',
        );
      }
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.EMAIL_VERIFIED,
          actorUserId: user.id,
          entityType: 'USER',
          entityId: user.id,
          meta,
        },
        tx,
      );
    });
  }

  /** Always succeeds from the caller's perspective (enumeration protection, §32). */
  async forgotPassword(identifierRaw: string, meta: RequestMeta): Promise<void> {
    const identifier = parseIdentifier(identifierRaw);
    if (!identifier) return;
    const user = await this.users.findByIdentifier(identifier);
    if (!user || user.status === UserStatus.DEACTIVATED) return;

    const token = await this.prisma.$transaction(async (tx) => {
      const issued = await this.challenges.createTokenChallenge(
        tx,
        user.id,
        VerificationChallengeType.PASSWORD_RESET,
        identifier.value,
      );
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
          actorUserId: user.id,
          entityType: 'USER',
          entityId: user.id,
          metadata: { channel: identifier.kind },
          meta,
        },
        tx,
      );
      return issued;
    });
    await this.deliver(() =>
      this.sender.sendPasswordResetToken(identifier.kind, identifier.value, token),
    );
  }

  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const invalid = new ApiException(
      HttpStatus.BAD_REQUEST,
      'AUTH_PASSWORD_RESET_INVALID',
      'This password reset link is invalid or has expired.',
    );
    const challenge = await this.challenges.findTokenChallenge(
      VerificationChallengeType.PASSWORD_RESET,
      token,
    );
    if (!challenge) throw invalid;
    try {
      this.challenges.assertUsable(challenge, invalid);
    } catch {
      throw invalid;
    }
    const user = await this.requireUser(challenge.userId);
    // The reset applies only while the contact it was sent to still belongs to the account.
    if (challenge.target !== user.email && challenge.target !== user.phone) throw invalid;

    this.passwords.assertMeetsPolicy(newPassword);
    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      if (!(await this.challenges.consume(tx, challenge.id))) throw invalid;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      const revokedSessions = await this.sessions.revokeAllForUser(
        tx,
        user.id,
        SessionRevokedReason.PASSWORD_RESET,
      );
      await this.challenges.invalidateActive(tx, user.id, VerificationChallengeType.PASSWORD_RESET);
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
          actorUserId: user.id,
          entityType: 'USER',
          entityId: user.id,
          metadata: { revokedSessions },
          meta,
        },
        tx,
      );
    });
  }

  private credentials(userId: string, sessionId: string, refreshToken: string): AuthTokens {
    return {
      accessToken: this.tokens.signAccessToken({ sub: userId, sid: sessionId }),
      refreshToken,
      expiresIn: this.tokens.accessTokenTtlSeconds,
    };
  }

  private async requireUser(userId: string): Promise<UserWithRoles> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_TOKEN_INVALID',
        'Authentication is required.',
      );
    }
    return user;
  }

  private async deliver(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error({ err: error }, 'Verification delivery failed');
    }
  }
}

function accountExists(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    'AUTH_ACCOUNT_ALREADY_EXISTS',
    'An account with these details already exists.',
  );
}
