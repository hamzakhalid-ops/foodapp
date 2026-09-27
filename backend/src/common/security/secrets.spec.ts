import {
  constantTimeEqual,
  generateNumericCode,
  generateOpaqueToken,
  hmacSha256,
  sha256,
} from './secrets';

describe('secrets', () => {
  it('generates 6-digit numeric codes', () => {
    for (let i = 0; i < 200; i += 1) expect(generateNumericCode()).toMatch(/^\d{6}$/);
  });

  it('generates unique 256-bit URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateOpaqueToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('keys OTP hashes so equal codes differ across keys', () => {
    expect(hmacSha256('key-a', '123456')).not.toBe(hmacSha256('key-b', '123456'));
    expect(sha256('abc')).toHaveLength(64);
  });

  it('compares in constant time and handles different lengths', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
