import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the repository-root `.env` for local development only. Deployed environments must
 * inject configuration through their secret/config management (INFRASTRUCTURE_RULES §21–22).
 */
export function loadLocalEnvFile(): void {
  if (process.env.NODE_ENV === 'production') return;
  const candidate = resolve(__dirname, '../../../.env');
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
  }
}
