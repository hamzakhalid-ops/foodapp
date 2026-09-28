# QuickBite Backend

NestJS **modular monolith** serving all four QuickBite applications
(`docs/architecture/ARCHITECTURE.md`, `docs/decisions/ADR/0001-modular-monolith.md`).

| Concern             | Technology                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| Runtime / framework | Node.js 22, TypeScript (strict), NestJS 11                                    |
| REST API            | `/api/v1` (`docs/api/API_SPEC.md`)                                            |
| Realtime            | Socket.IO gateway at path `/realtime` (`docs/notifications/REALTIME_SPEC.md`) |
| Database            | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)                                |
| Operational state   | Redis (ioredis)                                                               |
| Background jobs     | BullMQ on Redis, executed by the worker process                               |
| Logging             | Structured JSON (pino / nestjs-pino) with `request_id` and `correlation_id`   |
| Error tracking      | Sentry (`@sentry/nestjs`), disabled when `SENTRY_DSN` is empty                |
| Tests               | Jest, Supertest                                                               |

## Processes

One build artifact, two process roles (`docs/infrastructure/DEPLOYMENT_SPEC.md` §6–9):

| Process | Entry            | Purpose                                                  |
| ------- | ---------------- | -------------------------------------------------------- |
| API     | `dist/main.js`   | REST, Socket.IO, health probes                           |
| Worker  | `dist/worker.js` | BullMQ processors, outbox dispatch (none registered yet) |

## Layout

```text
backend/
├── prisma/
│   ├── schema.prisma          # governed by docs/database/DATABASE.md
│   └── migrations/
├── prisma.config.ts
├── src/
│   ├── main.ts / worker.ts    # process entrypoints
│   ├── instrument.ts          # preload: local .env (dev only) + Sentry
│   ├── app.module.ts / worker.module.ts
│   ├── bootstrap.ts           # HTTP config shared by production and tests
│   ├── config/                # Zod-validated environment (fails fast on invalid config)
│   ├── common/
│   │   ├── http/              # error envelope, success envelope, request/correlation IDs
│   │   └── logging/           # structured logging with redaction
│   ├── infrastructure/        # database, redis, queue, realtime, health
│   ├── modules/               # domain modules — all implemented (see src/modules/README.md)
│   └── generated/             # Prisma client (generated, git-ignored)
└── test/
    ├── api/                   # Supertest suites, no external services
    └── integration/           # suites against real PostgreSQL + Redis
```

## Implemented foundation

- Startup configuration validation (`src/config/env.schema.ts`)
- Standard success/error envelopes (`docs/api/API_SPEC.md` §8–11); no stack traces or internals leaked
- `X-Request-ID` (accepted when log-safe, otherwise generated) and `X-Correlation-ID` on every response
- Structured JSON logs; authorization headers, cookies, passwords and tokens redacted
- `/health/live` (process) and `/health/ready` (PostgreSQL + Redis) outside `/api/v1`
- Prisma client wiring (lazy connection), Redis client, BullMQ root configuration
- Socket.IO gateway with session authentication, periodic re-validation and server-side channel authorization
- Sentry initialisation with request bodies, headers, cookies, query strings and user info disabled
- Redis rate limiter (fixed window, hashed keys, fails closed), append-only audit log writer

## Slice 1 — Authentication (implemented)

| Endpoint                                               | Auth   | Notes                                                                                |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| `POST /api/v1/auth/register`                           | public | Customer account (`PENDING_VERIFICATION`) + profile; sends phone OTP and email token |
| `POST /api/v1/auth/login`                              | public | Email or phone; generic `AUTH_INVALID_CREDENTIALS` (no enumeration)                  |
| `POST /api/v1/auth/refresh`                            | public | Single-use refresh tokens; reuse revokes the whole session                           |
| `POST /api/v1/auth/logout`                             | token  | Revokes the current session                                                          |
| `POST /api/v1/auth/verify-phone` (+ `/resend`)         | token  | Activates the account (`DATABASE.md` §5.3)                                           |
| `POST /api/v1/auth/verify-email`                       | public | Single-use token                                                                     |
| `POST /api/v1/auth/forgot-password` / `reset-password` | public | Generic 202; reset revokes all sessions                                              |
| `GET /api/v1/me`                                       | token  | `API_SPEC.md` §25                                                                    |

Security model:

- **Authentication is required by default** (global `AuthGuard`); routes opt out with `@Public()`.
  Every request re-checks the server-side session, account status and current roles, so logout,
  suspension and role changes apply immediately. Unverified accounts only reach routes marked
  `@AllowUnverified()`. `@Roles(...)` enforces the role step of the authorization chain.
- Passwords: Argon2id, configurable length policy, no truncation, constant-work login for unknown accounts.
- Access tokens: HS256 JWT (`sub`, `sid`, `typ`, `iss`, `aud`, `exp`), algorithm pinned, previous
  secrets accepted for key rotation. Refresh/verification/reset secrets are random 256-bit values
  stored as SHA-256; phone OTPs are stored as HMAC with a server key.
- Rate limits per IP and per identifier/user, configurable (`RATE_LIMIT_*`).
- Security events (`LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `PHONE_VERIFIED`, …) are written to
  `audit_logs` in the same transaction as the change; no secrets are ever recorded.
- **Verification delivery:** `VerificationSender` interface. Only a development/test **log** adapter
  exists (approved interim); staging/production refuse to start until real SMS/email providers are added.

Local development needs `JWT_ACCESS_SECRET`, `AUTH_SECRET_HASH_KEY` and `MFA_ENCRYPTION_KEY`
(≥ 32 chars) in `.env`:

```bash
openssl rand -base64 48   # run once per secret
```

## Commands

The Prisma client (`src/generated/prisma`) is generated once per Turbo run by the `db:generate`
task, which `build`, `lint`, `typecheck` and the `test*` tasks depend on (`turbo.json`). Running
through Turbo generates it automatically:

```bash
pnpm turbo run lint typecheck test --filter=@quickbite/backend
```

When running a script directly with `pnpm --filter`, run `pnpm db:generate` first (and again after
changing `prisma/schema.prisma`). `test:api` is not a Turbo task and still generates the client
itself.

```bash
pnpm db:generate                                  # prisma generate (run before direct scripts)
pnpm --filter @quickbite/backend dev              # API with watch
pnpm --filter @quickbite/backend dev:worker       # worker with watch
pnpm --filter @quickbite/backend build            # nest build
pnpm --filter @quickbite/backend lint
pnpm --filter @quickbite/backend typecheck
pnpm --filter @quickbite/backend test             # unit + API (no services required)
pnpm --filter @quickbite/backend test:integration # requires DATABASE_URL + REDIS_URL
pnpm --filter @quickbite/backend db:validate      # prisma validate + format check
pnpm --filter @quickbite/backend db:migrate       # create/apply a development migration
```

Jest runs with `--experimental-vm-modules` because the Prisma 7 runtime loads its query compiler
through dynamic `import()`.

## Database rules

- Tables are added **only** as defined in `docs/database/DATABASE.md`, slice by slice, each with a
  migration in `prisma/migrations/`.
- Money: `Decimal @db.Decimal(12, 2)` + currency. Never `Float`.
- Timestamps: `DateTime @db.Timestamptz(6)`, UTC.
- Critical state changes use transactions; external providers are never called inside them;
  side effects go through the outbox.
- Gaps in the database specification are tracked in `docs/REPOSITORY_CONSISTENCY_REPORT.md` and
  must be resolved in `DATABASE.md` before the affected slice — never invented in code.
