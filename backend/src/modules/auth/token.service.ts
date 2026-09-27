import { HttpStatus, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { ApiException } from '../../common/http/api.exception';
import { AppConfigService } from '../../config/app-config.service';

const ALGORITHM = 'HS256';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
}

/**
 * Short-lived JWT access tokens (AUTH_AUTHORIZATION §21, §78–80).
 *
 * Claims are minimal (sub, sid, typ, iat, exp, iss, aud). The algorithm is fixed server-side;
 * the token header's `alg` is never trusted. Previous secrets are accepted for verification only,
 * to allow key rotation without logging everyone out. The server-side session remains
 * authoritative for revocation — a valid signature alone never authenticates a request.
 */
@Injectable()
export class TokenService {
  constructor(private readonly config: AppConfigService) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('ACCESS_TOKEN_TTL_SECONDS');
  }

  signAccessToken(claims: AccessTokenClaims): string {
    return jwt.sign({ sid: claims.sid, typ: 'access' }, this.config.get('JWT_ACCESS_SECRET'), {
      algorithm: ALGORITHM,
      subject: claims.sub,
      expiresIn: this.accessTokenTtlSeconds,
      issuer: this.config.get('JWT_ISSUER'),
      audience: this.config.get('JWT_AUDIENCE'),
    });
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    const secrets = [
      this.config.get('JWT_ACCESS_SECRET'),
      ...this.config.get('JWT_ACCESS_PREVIOUS_SECRETS'),
    ];
    let expired = false;
    for (const secret of secrets) {
      try {
        const payload = jwt.verify(token, secret, {
          algorithms: [ALGORITHM],
          issuer: this.config.get('JWT_ISSUER'),
          audience: this.config.get('JWT_AUDIENCE'),
        });
        if (
          typeof payload === 'object' &&
          payload.typ === 'access' &&
          typeof payload.sub === 'string' &&
          typeof payload.sid === 'string'
        ) {
          return { sub: payload.sub, sid: payload.sid };
        }
        break;
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) expired = true;
      }
    }
    throw expired
      ? new ApiException(
          HttpStatus.UNAUTHORIZED,
          'AUTH_TOKEN_EXPIRED',
          'The access token has expired.',
        )
      : new ApiException(
          HttpStatus.UNAUTHORIZED,
          'AUTH_TOKEN_INVALID',
          'Authentication is required.',
        );
  }
}
