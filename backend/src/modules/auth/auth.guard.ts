import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import {
  ALLOW_UNVERIFIED_KEY,
  type AuthContext,
  IS_PUBLIC_KEY,
  type RequestWithAuth,
} from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { accountStatusError } from './session.service';
import { TokenService } from './token.service';

/**
 * Global authentication guard (AUTH_AUTHORIZATION §58–59). Every HTTP route requires a valid
 * access token unless marked @Public().
 *
 * The token signature is not sufficient: the server-side session is loaded on every request and
 * must be active and unexpired, and the account status and roles are read from the database, so
 * logout, suspension and role changes take effect immediately (§20, §68–69).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & RequestWithAuth>();
    const token = extractBearerToken(request);
    if (!token) throw unauthenticated();

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
    const allowUnverified = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNVERIFIED_KEY,
      targets,
    );
    if (user.status === UserStatus.PENDING_VERIFICATION && !allowUnverified) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'AUTH_PHONE_NOT_VERIFIED',
        'Please verify your phone number to continue.',
      );
    }

    const auth: AuthContext = {
      userId: user.id,
      sessionId: session.id,
      roles: user.roles.map((entry) => entry.role),
      status: user.status,
    };
    request.auth = auth;
    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

function unauthenticated(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    'AUTH_TOKEN_INVALID',
    'Authentication is required.',
  );
}
