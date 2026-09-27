import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Local development convenience: load the repository-root .env when present.
// CI and deployed environments inject DATABASE_URL directly.
const rootEnv = resolve(__dirname, '../.env');
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Placeholder keeps `prisma generate` / `prisma validate` usable without a database.
    url:
      process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
