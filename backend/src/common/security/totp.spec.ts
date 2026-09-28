import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  totpAt,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B test secret (ASCII "12345678901234567890"), SHA-1, truncated to 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('round-trips base32', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });

  it('matches the RFC 6238 vectors', () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924');
    expect(totpAt(RFC_SECRET, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('accepts ±1 step of drift and rejects replays and malformed codes', () => {
    const now = 1_234_567_890_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 2), null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), step, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', null, now)).toBeNull();
  });

  it('encrypts secrets with authentication', () => {
    const sealed = encryptSecret('SECRET', 'k'.repeat(32));
    expect(sealed).not.toContain('SECRET');
    expect(decryptSecret(sealed, 'k'.repeat(32))).toBe('SECRET');
    expect(() => decryptSecret(sealed, 'x'.repeat(32))).toThrow();
  });
});
