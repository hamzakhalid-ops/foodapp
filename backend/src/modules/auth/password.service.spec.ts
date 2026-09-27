import { type AppConfigService } from '../../config/app-config.service';
import { PasswordService } from './password.service';

function createService(min = 8, max = 16): PasswordService {
  const config = {
    get: (key: string) => ({ AUTH_PASSWORD_MIN_LENGTH: min, AUTH_PASSWORD_MAX_LENGTH: max })[key],
  } as unknown as AppConfigService;
  return new PasswordService(config);
}

describe('PasswordService', () => {
  it('hashes with Argon2id and never stores the plaintext', async () => {
    const service = createService();
    const hashed = await service.hash('correct horse');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(hashed).not.toContain('correct horse');
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const service = createService();
    await service.onModuleInit();
    const hashed = await service.hash('correct horse');
    await expect(service.verify(hashed, 'correct horse')).resolves.toBe(true);
    await expect(service.verify(hashed, 'correct horsE')).resolves.toBe(false);
  });

  it('returns false (after a full hash check) when there is no stored hash', async () => {
    const service = createService();
    await service.onModuleInit();
    await expect(service.verify(null, 'quickbite-timing-equalizer')).resolves.toBe(false);
  });

  it('enforces configurable minimum and maximum length without truncation', () => {
    const service = createService(8, 16);
    expect(() => {
      service.assertMeetsPolicy('short');
    }).toThrow(expect.objectContaining({ code: 'AUTH_PASSWORD_POLICY_VIOLATION' }) as Error);
    expect(() => {
      service.assertMeetsPolicy('x'.repeat(17));
    }).toThrow(expect.objectContaining({ code: 'AUTH_PASSWORD_POLICY_VIOLATION' }) as Error);
    expect(() => {
      service.assertMeetsPolicy('        ');
    }).toThrow(expect.objectContaining({ code: 'AUTH_PASSWORD_POLICY_VIOLATION' }) as Error);
    expect(() => {
      service.assertMeetsPolicy('good password');
    }).not.toThrow();
  });

  it('counts Unicode characters, not bytes', () => {
    expect(() => {
      createService(8, 16).assertMeetsPolicy('пароль12');
    }).not.toThrow();
  });
});
