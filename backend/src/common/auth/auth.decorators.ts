import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { type Role, type UserStatus } from '@quickbite/types';

/**
 * Authentication is required by default for every route (fail closed, AUTH_AUTHORIZATION §115).
 * These decorators are the only way to relax or tighten that default.
 */
export const IS_PUBLIC_KEY = 'quickbite:isPublic';
export const ALLOW_UNVERIFIED_KEY = 'quickbite:allowUnverified';
export const ROLES_KEY = 'quickbite:roles';

/** Route is reachable without authentication (still rate limited where abuse is possible). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Route is available to authenticated accounts that are still PENDING_VERIFICATION
 * (e.g. verifying the phone). All other routes require a verified (ACTIVE/RESTRICTED) account.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

/** Route requires at least one of the given roles (current roles are read from the database). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Identity established by the authentication guard for the current request. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  roles: Role[];
  status: UserStatus;
}

export interface RequestWithAuth {
  auth?: AuthContext;
}

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const auth = context.switchToHttp().getRequest<RequestWithAuth>().auth;
  if (!auth) {
    // Programming error: the route is @Public() but asks for the authenticated identity.
    throw new Error('CurrentAuth used on a route without authentication');
  }
  return auth;
});
