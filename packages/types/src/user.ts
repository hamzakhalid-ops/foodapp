/**
 * User account statuses.
 *
 * Source: docs/database/DATABASE.md §4.1 (authoritative over the "recommended" list in
 * AUTH_AUTHORIZATION.md §6, which defers to the database specification).
 */
export const USER_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'RESTRICTED',
  'DEACTIVATED',
  'PENDING_VERIFICATION',
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
