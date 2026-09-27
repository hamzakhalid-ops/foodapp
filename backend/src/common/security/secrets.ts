import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 256-bit random value, URL-safe. Used for refresh, email-verification and reset tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Cryptographically random numeric code (AUTH_AUTHORIZATION §16). */
export function generateNumericCode(digits = 6): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');
}

/** Hash for high-entropy secrets (DATABASE.md §5.1). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Keyed hash for low-entropy secrets such as OTP codes (DATABASE.md §5.1). */
export function hmacSha256(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
