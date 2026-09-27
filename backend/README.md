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
│   └── schema.prisma          # governed by docs/database/DATABASE.md — no models yet
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
│   ├── modules/               # 25 domain module boundaries (see modules/README.md)
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
- Socket.IO gateway that **rejects every connection** until authentication exists (fail-closed)
- Sentry initialisation with request bodies, headers, cookies, query strings and user info disabled

**No product feature is implemented.** All domain modules are boundaries only.

## Commands

```bash
pnpm --filter @quickbite/backend dev              # API with watch
pnpm --filter @quickbite/backend dev:worker       # worker with watch
pnpm --filter @quickbite/backend build            # prisma generate + nest build
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
