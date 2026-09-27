import jwt from 'jsonwebtoken';
import { type AppConfigService } from '../../config/app-config.service';
import { TokenService } from './token.service';

const SECRET = 'current-secret-0000000000000000000000000';
const OLD_SECRET = 'previous-secret-000000000000000000000000';

function createService(overrides: Record<string, unknown> = {}): TokenService {
  const values: Record<string, unknown> = {
    JWT_ACCESS_SECRET: SECRET,
    JWT_ACCESS_PREVIOUS_SECRETS: [OLD_SECRET],
    JWT_ISSUER: 'quickbite',
    JWT_AUDIENCE: 'quickbite-api',
    ACCESS_TOKEN_TTL_SECONDS: 900,
    ...overrides,
  };
  return new TokenService({ get: (key: string) => values[key] } as unknown as AppConfigService);
}

const claims = { sub: 'user-1', sid: 'session-1' };

describe('TokenService', () => {
  it('round-trips minimal access claims', () => {
    const service = createService();
    const token = service.signAccessToken(claims);
    expect(service.verifyAccessToken(token)).toEqual(claims);

    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe('HS256');
    expect(Object.keys(decoded?.payload as object).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'sid', 'sub', 'typ'].sort(),
    );
  });

  it('accepts tokens signed with a previous secret (key rotation)', () => {
    const old = createService({ JWT_ACCESS_SECRET: OLD_SECRET, JWT_ACCESS_PREVIOUS_SECRETS: [] });
    expect(createService().verifyAccessToken(old.signAccessToken(claims))).toEqual(claims);
  });

  it('rejects unknown secrets, other audiences and unsigned tokens', () => {
    const service = createService();
    const foreign = jwt.sign({ sid: 's', typ: 'access' }, 'another-secret-0000000000000000000000', {
      subject: 'u',
      issuer: 'quickbite',
      audience: 'quickbite-api',
    });
    const otherAudience = createService({ JWT_AUDIENCE: 'elsewhere' }).signAccessToken(claims);
    const unsigned = jwt.sign({ sid: 's', typ: 'access', sub: 'u' }, '', { algorithm: 'none' });

    for (const token of [foreign, otherAudience, unsigned, 'garbage']) {
      expect(() => service.verifyAccessToken(token)).toThrow(
        expect.objectContaining({ code: 'AUTH_TOKEN_INVALID' }) as Error,
      );
    }
  });

  it('reports expired tokens with AUTH_TOKEN_EXPIRED', () => {
    const expired = jwt.sign(
      { sid: 's', typ: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
      {
        subject: 'u',
        issuer: 'quickbite',
        audience: 'quickbite-api',
      },
    );
    expect(() => createService().verifyAccessToken(expired)).toThrow(
      expect.objectContaining({ code: 'AUTH_TOKEN_EXPIRED' }) as Error,
    );
  });

  it('rejects tokens that are not access tokens', () => {
    const refreshLike = jwt.sign({ sid: 's', typ: 'refresh' }, SECRET, {
      subject: 'u',
      issuer: 'quickbite',
      audience: 'quickbite-api',
    });
    expect(() => createService().verifyAccessToken(refreshLike)).toThrow(
      expect.objectContaining({ code: 'AUTH_TOKEN_INVALID' }) as Error,
    );
  });
});
