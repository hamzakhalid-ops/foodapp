import { hash, verify } from '@node-rs/argon2';
import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { ApiException } from '../../common/http/api.exception';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Password hashing with Argon2id (AUTH_AUTHORIZATION §8) using the library's OWASP-baseline
 * parameters (m=19 MiB, t=2, p=1). The policy (§9) is centralized here: configurable minimum and
 * maximum length, measured in Unicode code points; passwords are never truncated.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  /** Used to equalize login timing when the account does not exist (§11). */
  private dummyHash = '';

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash('quickbite-timing-equalizer');
  }

  assertMeetsPolicy(password: string): void {
    const length = Array.from(password).length; // Unicode code points
    const minLength = this.config.get('AUTH_PASSWORD_MIN_LENGTH');
    const maxLength = this.config.get('AUTH_PASSWORD_MAX_LENGTH');
    if (length < minLength || length > maxLength || password.trim().length === 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'AUTH_PASSWORD_POLICY_VIOLATION',
        `Password must be between ${minLength} and ${maxLength} characters.`,
        { minLength, maxLength },
      );
    }
  }

  hash(password: string): Promise<string> {
    // @node-rs/argon2 defaults to Argon2id (asserted in password.service.spec.ts).
    return hash(password);
  }

  /** Always performs a full verification, even when there is no stored hash. */
  async verify(storedHash: string | null, password: string): Promise<boolean> {
    try {
      const matches = await verify(storedHash ?? this.dummyHash, password);
      return storedHash !== null && matches;
    } catch {
      return false;
    }
  }
}
