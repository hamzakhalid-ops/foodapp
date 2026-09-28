import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role } from '@quickbite/types';
import {
  type AuthContext,
  MFA_ENROLLMENT_KEY,
  RECENT_MFA_KEY,
  type RequestWithAuth,
  ROLES_KEY,
} from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { AppConfigService } from '../../config/app-config.service';

const ADMIN_ROLES: ReadonlySet<Role> = new Set(['ADMIN', 'SUPER_ADMIN']);

/**
 * Admin MFA (AUTH_AUTHORIZATION §36–38, ADR-0014 §8). Runs after the role check: every route
 * restricted to admin roles needs an MFA-verified session, and `@RecentMfa()` routes need a
 * verification inside the step-up window. Enforced server-side for every admin request.
 */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const adminRoute = !!required?.length && required.every((role) => ADMIN_ROLES.has(role));
    const stepUp = this.reflector.getAllAndOverride<boolean>(RECENT_MFA_KEY, targets);
    if (this.reflector.getAllAndOverride<boolean>(MFA_ENROLLMENT_KEY, targets)) return true;
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const auth = request.auth;
    if (!adminRoute && !stepUp) {
      // Shared routes (e.g. order or payment detail) must not grant admin reach to a session that
      // has not passed MFA: such a session acts with its non-admin roles only.
      if (auth) request.auth = withoutUnverifiedAdmin(auth);
      return true;
    }
    const verifiedAt = auth?.mfaVerifiedAt?.getTime();
    if (verifiedAt === undefined) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'AUTH_MFA_REQUIRED',
        'Multi-factor verification is required.',
        { reason: 'MFA_NOT_VERIFIED' },
      );
    }
    const windowMs = this.config.get('MFA_RECENT_AUTH_WINDOW_SECONDS') * 1000;
    if (stepUp && Date.now() - verifiedAt > windowMs) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'AUTH_MFA_REQUIRED',
        'Please confirm this action with your authenticator code.',
        { reason: 'STEP_UP_REQUIRED' },
      );
    }
    return true;
  }
}

/** Drops admin roles from a session that has not completed MFA. */
export function withoutUnverifiedAdmin(auth: AuthContext): AuthContext {
  if (auth.mfaVerifiedAt || !auth.roles.some((role) => ADMIN_ROLES.has(role))) return auth;
  return { ...auth, roles: auth.roles.filter((role) => !ADMIN_ROLES.has(role)) };
}
