/**
 * Frozen V1 roles.
 *
 * Source: CLAUDE.md §5, docs/database/DATABASE.md §5, docs/api/API_SPEC.md §6.
 * Do not add roles (e.g. RESTAURANT_MANAGER, KITCHEN_STAFF) without an approved ADR.
 */
export const ROLES = [
  'CUSTOMER',
  'RESTAURANT_OWNER',
  'RESTAURANT_OPERATOR',
  'RIDER',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];
