import { normalizeEmail, normalizePhone, parseIdentifier } from './identity-normalization';

describe('identity normalization', () => {
  it('normalizes emails case-insensitively', () => {
    expect(normalizeEmail('  Ali.Khan@Example.COM ')).toBe('ali.khan@example.com');
  });

  it.each([
    ['+92 300 1234567', '+923001234567'],
    ['+92-300-123-4567', '+923001234567'],
    ['(+92) 300.1234567', '+923001234567'],
    ['0092 300 1234567', '+923001234567'],
  ])('treats %s as the same phone number', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(['03001234567', '+0123456789', '+92', 'abc', '+92300123456789012'])(
    'rejects non-E.164 input %s',
    (raw) => {
      expect(normalizePhone(raw)).toBeNull();
    },
  );

  it('parses identifiers as email or phone', () => {
    expect(parseIdentifier('A@B.co')).toEqual({ kind: 'email', value: 'a@b.co' });
    expect(parseIdentifier('+92 300 1234567')).toEqual({ kind: 'phone', value: '+923001234567' });
    expect(parseIdentifier('not an identifier')).toBeNull();
  });
});
