/**
 * Canonical identity normalization (AUTH_AUTHORIZATION.md §12–13). Used for registration, login,
 * password reset, verification and lookup so that formatting differences never create separate
 * accounts.
 */

/** Trimmed and lower-cased. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalizes to E.164 (`+<country><number>`), removing spaces, dashes, dots and parentheses and
 * converting a leading `00` to `+`. Returns null when the result is not a valid E.164 number.
 *
 * Country/region-specific rules are configuration that is not yet decided (launch market —
 * REPOSITORY_CONSISTENCY_REPORT H5); until then only generic E.164 validation is applied.
 */
export function normalizePhone(raw: string): string | null {
  let value = raw.trim().replace(/[\s\-.()]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  return E164.test(value) ? value : null;
}

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

/** Interprets a login/reset identifier as an email (contains "@") or a phone number. */
export function parseIdentifier(raw: string): Identifier | null {
  if (raw.includes('@')) {
    const email = normalizeEmail(raw);
    return email.length > 0 ? { kind: 'email', value: email } : null;
  }
  const phone = normalizePhone(raw);
  return phone ? { kind: 'phone', value: phone } : null;
}
