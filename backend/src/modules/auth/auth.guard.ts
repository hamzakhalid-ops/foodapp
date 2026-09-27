import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import {
  ALLOW_UNVERIFIED_KEY,
  IS_PUBLIC_KEY,
  type RequestWithAuth,
} from '../../common/auth/auth.decorators';
import { SessionAuthenticator, unauthenticated } from './session-authenticator';

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
    private readonly sessions: SessionAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & RequestWithAuth>();
    const token = extractBearerToken(request);
    if (!token) throw unauthenticated();
    const allowUnverified =
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_UNVERIFIED_KEY, targets) === true;
    request.auth = await this.sessions.authenticate(token, { allowUnverified });
    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
