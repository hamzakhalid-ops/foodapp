import { z } from 'zod';

/**
 * Environment configuration validated at startup (DEPLOYMENT_SPEC §22 — startup configuration
 * validation). The process refuses to start with invalid configuration.
 *
 * Only configuration required by the current foundation is validated here. Provider
 * configuration (auth, storage, maps, payments, notifications) is added to this schema by the
 * slice that first uses it. See .env.example for the full catalogue.
 */
const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Rate-limit rule "<max requests>/<window seconds>", e.g. "10/300". */
const rateLimitRule = z
  .string()
  .regex(/^\d+\/\d+$/, 'Expected "<max>/<windowSeconds>"')
  .transform((value) => {
    const [max, windowSeconds] = value.split('/').map(Number) as [number, number];
    return { max, windowSeconds };
  })
  .refine((rule) => rule.max > 0 && rule.windowSeconds > 0, 'Values must be positive');

const secret = (name: string) =>
  z
    .string()
    .min(32, `${name} must be at least 32 characters (generate with: openssl rand -base64 48)`);

const seconds = z.coerce.number().int().positive();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_VERSION: z.string().min(1).default('0.0.0-local'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  API_TRUST_PROXY: booleanFromString.default(false),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: booleanFromString.default(false),

  SENTRY_DSN: z.union([z.url(), z.literal('')]).default(''),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

  // --- Authentication (Slice 1, AUTH_AUTHORIZATION.md §8–33) -------------------------------
  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  /** Comma-separated previous signing secrets still accepted for verification (key rotation, §80). */
  JWT_ACCESS_PREVIOUS_SECRETS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  JWT_ISSUER: z.string().min(1).default('quickbite'),
  JWT_AUDIENCE: z.string().min(1).default('quickbite-api'),
  ACCESS_TOKEN_TTL_SECONDS: seconds.default(900),
  REFRESH_TOKEN_TTL_SECONDS: seconds.default(30 * 24 * 3600),
  SESSION_MAX_LIFETIME_SECONDS: seconds.default(90 * 24 * 3600),
  /** HMAC key for low-entropy secrets (phone OTP codes). */
  AUTH_SECRET_HASH_KEY: secret('AUTH_SECRET_HASH_KEY'),

  AUTH_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(8),
  AUTH_PASSWORD_MAX_LENGTH: z.coerce.number().int().max(1024).default(128),
  AUTH_PHONE_OTP_TTL_SECONDS: seconds.default(300),
  AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  AUTH_EMAIL_VERIFICATION_TTL_SECONDS: seconds.default(24 * 3600),
  AUTH_PASSWORD_RESET_TTL_SECONDS: seconds.default(30 * 60),

  /**
   * How verification codes and reset tokens are delivered. Only the development `log` adapter
   * exists until SMS/email providers are selected; it is refused outside development/test.
   */
  VERIFICATION_DELIVERY: z.enum(['log']).default('log'),

  // Rate limits (AUTH_AUTHORIZATION §17–18, §104). Applied per client IP and, where noted, per
  // account identifier.
  RATE_LIMIT_REGISTER: rateLimitRule.prefault('10/3600'),
  RATE_LIMIT_LOGIN: rateLimitRule.prefault('10/300'),
  RATE_LIMIT_REFRESH: rateLimitRule.prefault('60/300'),
  RATE_LIMIT_OTP_SEND: rateLimitRule.prefault('3/900'),
  RATE_LIMIT_OTP_VERIFY: rateLimitRule.prefault('10/900'),
  RATE_LIMIT_EMAIL_VERIFY: rateLimitRule.prefault('20/3600'),
  RATE_LIMIT_PASSWORD_RESET: rateLimitRule.prefault('5/3600'),
});

export type Env = z.infer<typeof envSchema>;

/** Delivery adapters that must never run in a deployed environment. */
const DEV_ONLY_DELIVERY: ReadonlySet<string> = new Set(['log']);

const guardedEnvSchema = envSchema.superRefine((env, ctx) => {
  const deployed = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
  if (deployed && DEV_ONLY_DELIVERY.has(env.VERIFICATION_DELIVERY)) {
    ctx.addIssue({
      code: 'custom',
      path: ['VERIFICATION_DELIVERY'],
      message: 'The development "log" delivery adapter is not allowed in staging/production',
    });
  }
  if (env.AUTH_PASSWORD_MAX_LENGTH < env.AUTH_PASSWORD_MIN_LENGTH) {
    ctx.addIssue({
      code: 'custom',
      path: ['AUTH_PASSWORD_MAX_LENGTH'],
      message: 'Must be greater than or equal to AUTH_PASSWORD_MIN_LENGTH',
    });
  }
});

export type RateLimitRule = Env['RATE_LIMIT_LOGIN'];

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = guardedEnvSchema.safeParse(raw);
  if (!result.success) {
    // Report which keys are invalid without echoing their (possibly secret) values.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
