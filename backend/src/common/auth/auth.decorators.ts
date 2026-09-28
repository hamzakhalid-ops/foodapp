import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { type Role, type UserStatus } from '@quickbite/types';

/**
 * Authentication is required by default for every route (fail closed, AUTH_AUTHORIZATION §115).
 * These decorators are the only way to relax or tighten that default.
 */
export const IS_PUBLIC_KEY = 'quickbite:isPublic';
export const ALLOW_UNVERIFIED_KEY = 'quickbite:allowUnverified';
export const ROLES_KEY = 'quickbite:roles';
export const MFA_ENROLLMENT_KEY = 'quickbite:mfaEnrollment';
export const RECENT_MFA_KEY = 'quickbite:recentMfa';

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
  /** Last MFA verification on this session; admin routes require it (AUTH_AUTHORIZATION §36). */
  mfaVerifiedAt: Date | null;
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

/**
 * Administrative routes (ADMIN_RULES §4–6). Every admin route uses this single decorator so that
 * admin-wide requirements (e.g. MFA, ADR-0014 §8) are enforced in one place.
 */
export const AdminOnly = () => Roles('ADMIN', 'SUPER_ADMIN');

/** Admin route reachable before MFA is verified on the session (enrolment and verification). */
export const MfaEnrollment = () => SetMetadata(MFA_ENROLLMENT_KEY, true);

/**
 * Sensitive action requiring step-up: an MFA verification within MFA_RECENT_AUTH_WINDOW_SECONDS
 * (AUTH_AUTHORIZATION §37–38, §127).
 */
export const RecentMfa = () => SetMetadata(RECENT_MFA_KEY, true);
