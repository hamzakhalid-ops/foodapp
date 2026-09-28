import { type CurrentUser } from '@quickbite/validation';

/**
 * Where a signed-in customer goes next, decided by the backend's account status (API_SPEC §25).
 * `PENDING_VERIFICATION` accounts must verify their phone before any protected endpoint accepts
 * them (`AUTH_PHONE_NOT_VERIFIED`, API_SPEC §17, §20).
 */
export function routeAfterSignIn(user: Pick<CurrentUser, 'status'>) {
  return user.status === 'PENDING_VERIFICATION' ? '/verify-phone' : '/signed-in';
}
