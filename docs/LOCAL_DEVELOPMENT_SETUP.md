# Local Development Setup — verified on Windows

This page records a local setup that was **actually performed and verified** on 2026-09-28. The
machine was Windows 10 Pro 19045 with 8 GB RAM, and hardware virtualization was disabled in
BIOS. The generic instructions are in the root `README.md` ("Environment setup"). This page adds
the Windows specifics and the results.

## 1. Required software

| Tool           | Required by the repository                                  | Source                          |
| -------------- | ----------------------------------------------------------- | ------------------------------- |
| Node.js        | `>=22.12.0` (`.nvmrc` = `22`)                               | `package.json` `engines`        |
| pnpm           | `10.33.0` (`packageManager`), `>=10`                        | `package.json`                  |
| Git            | any recent version                                          | —                               |
| PostgreSQL     | 17 (`postgres:17-alpine`)                                   | `infrastructure/local/docker-compose.yml` |
| Redis          | 7.4 (`redis:7.4-alpine`)                                    | `infrastructure/local/docker-compose.yml` |
| Docker Compose | intended way to run PostgreSQL and Redis                    | README                          |

## 2. Installed and verified versions

| Tool       | Version                                | How it was installed                                                      |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Node.js    | 22.23.2                                | `winget install OpenJS.NodeJS.22`                                         |
| pnpm       | 10.33.0                                | `corepack enable pnpm --install-directory "%APPDATA%\npm"` (see note)     |
| Git        | 2.55.0.windows.5                       | already present                                                           |
| PostgreSQL | 17.11 (Windows service `postgresql-x64-17`) | `winget install PostgreSQL.PostgreSQL.17` (unattended, port 5432)     |
| Redis      | Memurai Developer 4.1.2 (Redis 7.2.5 API, service `Memurai`, port 6379) | MSI from dist.memurai.com via `msiexec` (see note) |
| Docker     | **not installed**                      | Hardware virtualization is disabled in BIOS, so Docker Desktop cannot run |

Notes:

* **pnpm shim location.** A plain `corepack enable` fails without admin rights because it
  writes into `C:\Program Files\nodejs`. The pnpm shim was installed into `%APPDATA%\npm`
  instead; that folder is already on the user `PATH`.
* **Memurai install.** `winget install Memurai.MemuraiDeveloper` failed with MSI error 1603
  (access denied while creating a temp folder). Running the downloaded MSI with
  `msiexec /i … /qb` elevated, with `TEMP`/`TMP` pointing to a plain folder, succeeded.
* **Docker instead of native services.** PostgreSQL and Redis run as native Windows services
  in place of `docker-compose.yml`. They use the **same** credentials, database name and ports,
  so `.env.example` values work unchanged. To use Docker later, enable VT-x/AMD-V in BIOS,
  install Docker Desktop, stop both Windows services, and run
  `docker compose -f infrastructure/local/docker-compose.yml up -d`.

## 3. Dependency installation

```bash
pnpm install
```

The workspace resolved 1,598 packages with the hoisted layout (`.npmrc`). The allowed install
scripts ran: Prisma engines, `msgpackr-extract`, `unrs-resolver` and `@parcel/watcher`. No
versions were changed.

**Windows script shell (user-level pnpm config).** Package scripts use POSIX syntax, such as
`NODE_OPTIONS=… jest` and `rm -rf`, which fails under `cmd.exe`. Point pnpm at Git Bash once per
machine:

```bash
pnpm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"
```

## 4. Environment setup

* `.env` is at the repository root, copied from `.env.example`. It is git-ignored. The backend
  and Prisma load it automatically (`backend/src/config/load-local-env.ts`,
  `backend/prisma.config.ts`).
* Three secrets are required at startup and have no defaults: `JWT_ACCESS_SECRET`,
  `AUTH_SECRET_HASH_KEY` and `MFA_ENCRYPTION_KEY`. Each got a random 48-byte base64 value
  generated locally, as `.env.example` instructs. They are local-only values.
* Everything else uses the `.env.example` defaults: `PAYMENT_PROVIDER=sandbox`,
  `PAYOUT_PROVIDER=sandbox`, `NOTIFICATION_DELIVERY=log`, `VERIFICATION_DELIVERY=log`,
  `STORAGE_DRIVER` defaulting to `local`, and Sentry disabled.
* The mobile and admin apps need no `.env` files. `EXPO_PUBLIC_API_URL` and
  `NEXT_PUBLIC_API_URL` default to `http://localhost:3000`
  (`apps/*/src/lib/env.ts`). On a **physical phone**, `localhost` is the phone itself. Create
  `apps/<app>/.env` with `EXPO_PUBLIC_API_URL=http://<PC LAN IP>:3000` and add that origin to
  `API_CORS_ORIGINS` if needed.

## 5. PostgreSQL setup

The databases were created to match `docker-compose.yml`:

```sql
CREATE ROLE quickbite LOGIN PASSWORD 'quickbite_local_only' CREATEDB;  -- CREATEDB: Prisma shadow DB
CREATE DATABASE quickbite OWNER quickbite;
CREATE DATABASE quickbite_test OWNER quickbite;   -- disposable DB for integration tests
ALTER DATABASE quickbite SET timezone TO 'UTC';   -- match the postgres Docker image
ALTER DATABASE quickbite_test SET timezone TO 'UTC';
```

The local `postgres` superuser password is the same documented local-only value. **Why UTC:**
the Windows installer sets the server timezone to the OS zone (Asia/Karachi). Prisma's pg
adapter sends timestamps without an offset, so a non-UTC session stored `created_at` values
5 hours off.

Check: `psql -U quickbite -h localhost -d quickbite -c "select 1"`.

## 6. Redis setup

Memurai runs as the Windows service `Memurai` on `127.0.0.1:6379` and speaks the Redis 7.2 API.
The backend's BullMQ queues, rate limiting and health check all work against it.

Check: `"C:\Program Files\Memurai\memurai-cli.exe" ping` should return `PONG`.

## 7. Prisma setup

```bash
pnpm db:generate                                   # Prisma Client 7.10.0 → backend/src/generated/prisma
pnpm --filter @quickbite/backend db:migrate:deploy # applies the 18 committed migrations
pnpm --filter @quickbite/backend exec prisma migrate status   # "Database schema is up to date!"
```

`db:migrate:deploy` was used because it only applies committed migrations. It never resets
the database and never generates new migrations. Use `pnpm db:migrate` (`prisma migrate dev`)
only when authoring a new migration.

`pnpm db:validate` runs `prisma validate` (**passes**) and then `prisma format --check`
(**fails only because of CRLF line endings**, see §19).

## 8. Backend startup (API)

```bash
pnpm --filter @quickbite/backend dev
```

Verified results:

* `GET http://localhost:3000/health/ready` returns
  `{"status":"ok","dependencies":{"database":"up","redis":"up"}}`.
* `GET /health/live` returns `ok`.
* The REST API is mounted under `/api/v1`.
* Socket.IO is served on the `/realtime` path; the engine.io handshake was confirmed.

## 9. Worker startup

```bash
pnpm --filter @quickbite/backend dev:worker
```

The worker logged "Job schedulers registered" for these BullMQ jobs: `outbox-dispatch`,
`restaurant-resume-pauses`, `promotions-expire`, `dispatch-tick`, `payouts-sync`,
`notification-deliveries`, `settlements-generate`, `financial-reconciliation`. It then logged
"Worker started".

The worker also warns `finance.settlement_frequency is not configured`. This is expected: the
value is a system setting that an admin configures.

Do not run `pnpm build` while `dev`/`dev:worker` are running. `nest build` replaces `dist/`,
and the watchers exit.

## 10. Customer app startup

```bash
pnpm --filter @quickbite/customer dev      # Expo / Metro on http://localhost:8081
```

Metro started, and an Android dev bundle compiled (HTTP 200, about 6.8 MB). The foundation is
Expo SDK 57, Expo Router (`src/app`, typed routes), TypeScript, a TanStack Query client and
providers, and the `@quickbite/api-client` wrapper. Zustand is installed but has no stores yet.

To run on a device, press `a` (Android emulator) or scan the QR code with Expo Go.

## 11. Restaurant app startup

```bash
pnpm --filter @quickbite/restaurant dev    # add `-- --port 8082` to run alongside another Expo app
```

Metro started and an Android dev bundle compiled (HTTP 200).

## 12. Rider app startup

```bash
pnpm --filter @quickbite/rider dev         # add `-- --port 8083` to run alongside another Expo app
```

Metro started and an Android dev bundle compiled (HTTP 200).

## 13. Admin startup

```bash
pnpm --filter @quickbite/admin dev         # Next.js 16.3.6 on http://localhost:3100
```

The page renders "QuickBite Admin — Admin Panel foundation" with no console errors.

## 14. Testing commands and results

| Command                                   | Result on this machine                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm lint`                               | PASS (12/12 tasks)                                                       |
| `pnpm typecheck`                          | PASS (12/12 tasks)                                                       |
| `pnpm test`                               | PASS: 98 tests (backend 75, packages 20, customer/restaurant/rider 1 each) |
| `pnpm test:integration` (see below)       | PASS: 185/185 tests, 20 suites (after the settlement fix, see §19)       |
| `pnpm --filter @quickbite/backend test:e2e` | PASS (golden flow). It failed once while the machine was heavily loaded; 9 later runs passed. |
| `pnpm build`                              | PASS (9/9 tasks: packages, backend, Expo exports, Next.js)               |
| `pnpm docs:check`                         | PASS (after the Windows path fix, see §19)                               |
| `pnpm format:check`                       | WARN: 371 files flagged, **all because of CRLF line endings** (§19)      |
| `pnpm test:e2e` (Admin Playwright)        | not run: needs `pnpm exec playwright install` (browser download)          |

**Integration and E2E tests `TRUNCATE` every table and `FLUSHDB` Redis.** Always run them
against the disposable test database and Redis DB 1, never the dev database:

```bash
DATABASE_URL=postgresql://quickbite:quickbite_local_only@localhost:5432/quickbite_test \
REDIS_URL=redis://localhost:6379/1 \
pnpm --filter @quickbite/backend test:integration
```

For a new or empty test database, run `pnpm --filter @quickbite/backend db:migrate:deploy`
once with the same `DATABASE_URL`.

## 15. Stitch design location

`apps/customer/design/stitch/` holds 84 screens (`<folder>/code.html` + `screen.png`), 4 food
image assets and the `warm_kinetic/DESIGN.md` design system. The inventory and the suggested
batch mapping are in `apps/customer/design/stitch/STITCH_INDEX.md`. The designs are
**untracked in Git** until the owner commits them.

## 16. Logo location

The canonical file is `apps/customer/assets/logo/quickbite-logo.png`: 1254×1254 RGBA PNG,
copied byte-for-byte from the supplied root `logo.png`. The Stitch HTML loads the logo from a
remote `lh3.googleusercontent.com` URL, so implementations must use the local asset.

## 17. Missing environment variables

None are missing for local development. The following are intentionally empty and need real
values only for the features or environments noted:

* **Object storage (only needed with `STORAGE_DRIVER=s3`):** `STORAGE_ENDPOINT`,
  `STORAGE_REGION`, `STORAGE_BUCKET_PRIVATE`, `STORAGE_BUCKET_PUBLIC`,
  `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`. Local development uses the `local`
  disk driver.
* **Maps:** `GOOGLE_MAPS_SERVER_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.
* **Push notifications:** `FCM_*` and `APNS_*`.
* **SMS and email:** `SMS_PROVIDER`/`SMS_API_KEY` and `EMAIL_PROVIDER`/`EMAIL_API_KEY`/
  `EMAIL_FROM_ADDRESS`. The providers have not been selected yet.
* **Sentry:** `SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`. Empty
  disables Sentry.

## 18. External services that still require credentials

* **Payments and payouts:** only the `sandbox` adapters exist. A real provider adapter and
  its keys are needed before staging or production (ADR-0014 §5).
* **Google Maps Platform:** needed for map rendering on the apps and for server-side
  geocoding and distance.
* **FCM/APNs, SMS and email:** notifications and verification codes currently go to the
  local log. Read OTP codes from the backend log during development.
* **S3-compatible storage:** a local emulator is not pinned yet
  (`docs/REPOSITORY_CONSISTENCY_REPORT.md`).
* **Sentry:** optional.

## 19. Known local-development limitations and fixes applied

1. **CRLF line endings (open, needs a decision).** Git's global `core.autocrlf=true` checked
   the repository out with CRLF. The formatters expect LF, so `pnpm format:check` and the
   `prisma format --check` step fail on otherwise-correct files. `core.autocrlf=false` has
   been set **for this repository only**. The working tree still needs a one-time
   renormalization, which rewrites every tracked file with LF. With no uncommitted tracked
   changes, run `git rm --cached -r -q . && git reset --hard`. That command also discards
   any uncommitted edits to tracked files, so commit or stash those first.
2. **Settlement generation bug (fixed).** `SettlementsService.generateFor` guarded with
   `!net.isPositive()`, but `Decimal#isPositive()` is true for zero. A recipient whose
   available sources netted to exactly 0 (for example, the loser of a concurrent
   `generate()` run) tried to insert an all-zero settlement. The DB check
   `settlements_amounts_check` (`net_amount > 0`) rejected it, and the error aborted the whole
   generation run. The guard is now `!net.greaterThan(0)`. `finance.int-spec.ts` failed
   3 times out of 3 before the fix and passed on every run after it.
3. **`docs:check` on Windows (fixed).** `new URL('..', import.meta.url).pathname` produced
   `/E:/quickbite/`, which the script read as `E:\E:\quickbite`. The script now uses
   `fileURLToPath`.
4. **Generated files from dev tooling.** `expo start` rewrites `apps/*/expo-env.d.ts` (only the
   comment changes) and adds `apps/*/.gitignore`. `next dev` adds `apps/admin/AGENTS.md` and
   `apps/admin/CLAUDE.md`. They reappear on every start. Decide whether to commit them or
   git-ignore them.
5. **Expo version check.** `expo install --check` reports `jest@30.5.2` and
   `@types/jest@30.0.0` where Expo SDK 57 expects 29.x. The app tests pass, so the versions were
   left unchanged.
6. **pg deprecation warning.** Integration runs print "Calling client.query() when the client
   is already executing a query". This comes from concurrent queries inside interactive
   transactions (for example `Promise.all` in `claimSources`). It is harmless today but will
   break on pg@9.
7. **Timing-sensitive tests.** One `finance` run and one golden-flow run failed while Metro,
   Next.js and the backend were all running on this 8 GB machine. Every run on an unloaded
   machine passed.
