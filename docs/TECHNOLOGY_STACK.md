# QuickBite — Technology Stack

**File:** `docs/TECHNOLOGY_STACK.md`
**Phase:** 20 — Implementation (foundation)

```text
STATUS: FROZEN
```

This document records the approved V1 technology stack. It is not a list of options.

Do **not** substitute, add or remove a technology listed here without an explicit decision from the project owner recorded as an ADR in `docs/decisions/ADR/`.

The stack implements — and never overrides — the architecture in `docs/architecture/ARCHITECTURE.md` and the rules in `CLAUDE.md`.

---

# 1. Summary

| Area | Technology |
|------|------------|
| Architecture | Modular monolith (ADR-0001) |
| Mobile apps (Customer, Restaurant, Rider) | React Native, Expo, TypeScript, Expo Router |
| Mobile state | TanStack Query (server state), Zustand (client state) |
| Forms | React Hook Form, Zod |
| Admin Panel | Next.js, TypeScript, TanStack Query |
| Backend | Node.js, TypeScript, NestJS |
| API | REST (`/api/v1`) + WebSockets via Socket.IO |
| Database | PostgreSQL |
| ORM / data access | Prisma |
| Operational state | Redis |
| Background jobs | BullMQ on Redis |
| Object storage | S3-compatible object storage |
| Maps | Google Maps Platform (behind `MapsService`) |
| Push notifications | Firebase Cloud Messaging, Apple Push Notification service |
| Monitoring | Sentry + structured application logging |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Monorepo | pnpm workspaces + Turborepo |
| Testing | Jest, Supertest, Playwright, React Native Testing Library (jest-expo) |

---

# 2. Pinned Versions (foundation baseline)

Exact versions are pinned in `package.json` files and `pnpm-lock.yaml`. Upgrading a **major** version is a deliberate change reviewed in a PR; replacing a technology requires an ADR.

| Component | Version |
|-----------|---------|
| Node.js | 22 LTS (`>=22.12`) — `.nvmrc` |
| pnpm | 10.33.0 (`packageManager`) |
| Turborepo | 2.11 |
| TypeScript | 6.0.3 (single version across the monorepo) |
| Expo SDK | 57 (React Native 0.86.3, React 19.2.3) |
| Expo Router | 57 |
| Next.js | 16.3 |
| React (all apps) | 19.2.3 — pinned workspace-wide via pnpm `overrides` |
| TanStack Query | 5 |
| Zustand | 5 |
| React Hook Form | 7 (+ `@hookform/resolvers` 5) |
| Zod | 4 |
| NestJS | 11 |
| Prisma | 7 (`prisma-client` generator, `@prisma/adapter-pg`) |
| PostgreSQL | 17 (local/CI images) |
| Redis | 7.4 (local/CI images) |
| BullMQ | 5 (`@nestjs/bullmq` 11) |
| Socket.IO | 4.8 |
| Sentry | `@sentry/nestjs` 11 (backend) |
| Jest | 30 (ts-jest for TypeScript packages, jest-expo for mobile) |
| Supertest | 7 |
| Playwright | 1.63 |
| ESLint | 10 (flat config) + typescript-eslint 8 |
| Prettier | 3 |

### Version notes

* **NestJS 11, not 12.** NestJS 12 is published as ESM-only. The frozen testing foundation (Jest + Supertest) and the CommonJS backend build are stable on NestJS 11. Moving to NestJS 12 is a future, deliberate upgrade.
* **TypeScript 6.0.3.** This is the version Expo SDK 57 ships in its templates, and it is inside the supported range of typescript-eslint and ts-jest. TypeScript 7 is not yet supported by that tooling.
* **Prisma 7 under Jest.** The Prisma runtime loads its query compiler with dynamic `import()`, so backend Jest scripts run with `NODE_OPTIONS=--experimental-vm-modules`.

---

# 3. Mobile Architecture — `apps/customer`, `apps/restaurant`, `apps/rider`

Three **separate** Expo applications. Screens are never shared between apps (`CLAUDE.md` §21).

```text
apps/<app>/
├── app.json                 # Expo config (name, slug, scheme, expo-router plugin, typed routes)
├── src/
│   ├── app/                 # Expo Router file-based routes (_layout.tsx = root layout)
│   ├── lib/                 # env (EXPO_PUBLIC_*), api client, query client
│   └── providers/           # SafeArea + TanStack Query providers
├── design/stitch/           # approved Stitch references (visual source of truth)
├── README.md
└── SCREEN_PLAN.md
```

State rules:

* **TanStack Query** owns all server state (anything the backend returns).
* **Zustand** only for genuinely client-side state (e.g. UI preferences, in-progress UI flows). Never for authoritative data such as prices, totals, order status, payment status or permissions.
* **React Hook Form + Zod** for forms. Zod schemas validate input *shape* for UX; the backend always re-validates.

Build validation: `expo export` for Android and iOS (Metro + Hermes bytecode). Native builds/signing (EAS or equivalent) are a later decision.

---

# 4. Admin Architecture — `apps/admin`

* Next.js App Router (`src/app`), TypeScript, TanStack Query.
* A web application for `ADMIN` and `SUPER_ADMIN` only.
* Baseline security headers (`X-Frame-Options: DENY`, `nosniff`, `no-referrer`, no `X-Powered-By`); `noindex`.
* All authorization is enforced by the backend. Hiding UI is never a security control.

---

# 5. Backend Architecture — `backend/`

* NestJS **modular monolith**: one codebase, one build artifact, two process roles:
  * **API** (`dist/main.js`): REST `/api/v1`, Socket.IO gateway (`/realtime`), `/health/live`, `/health/ready`.
  * **Worker** (`dist/worker.js`): BullMQ processors and outbox dispatch.
* Domain modules under `backend/src/modules/` (see its README) are in-process boundaries, not services.
* Cross-cutting foundation in `backend/src/common` and `backend/src/infrastructure`: validated configuration, structured logging, error envelope, request/correlation IDs, Prisma, Redis, BullMQ, realtime gateway, health.
* External providers are reached only through application-level interfaces (`PaymentService`, `MapsService`, `NotificationService`, `StorageService`) — `CLAUDE.md` §20.

---

# 6. API Architecture

* **REST** is the primary request/response API, versioned at `/api/v1`, governed by `docs/api/API_SPEC.md`.
* Standard envelopes: `{ success: true, data, meta? }` and `{ success: false, error: { code, message, details?, requestId } }`.
* Headers: `X-Request-ID` (every request/response), `Idempotency-Key` (retry-sensitive operations), `X-Correlation-ID` (workflow correlation).
* Money is serialized as decimal **strings** (`API_SPEC.md` §122).
* **WebSockets via Socket.IO** for realtime events (`docs/notifications/REALTIME_SPEC.md`). Realtime is an optimization; clients always recover authoritative state over REST.
* Shared client transport: `@quickbite/api-client`.

---

# 7. Database and ORM

* **PostgreSQL** is the durable source of truth (ADR-0002).
* **Prisma** is the data-access layer and migration tool (`backend/prisma/`).
* The schema is governed by `docs/database/DATABASE.md`. Models are added slice by slice with migrations; nothing is added that the database specification does not define.
* Money: `Decimal @db.Decimal(12, 2)` + currency. Timestamps: `timestamptz`, UTC.
* Transactions for critical state changes; no external provider calls inside them.

---

# 8. Redis

Redis (ADR-0003) supports: caching, rate limiting, temporary state, presence, dispatch coordination (geospatial index, offers), short-lived locks, realtime coordination (Socket.IO scaling when needed), and BullMQ queues.

Redis is **never** the durable source of truth for business records.

---

# 9. Background Jobs

* **BullMQ** on Redis, executed by the worker process.
* Queues are registered by the slice that introduces asynchronous work (outbox, notifications, dispatch timeouts, financial jobs).
* Jobs carry identifiers; workers re-read PostgreSQL for authoritative state. Jobs must be idempotent.

---

# 10. Realtime

* Socket.IO gateway attached to the API process at path `/realtime`.
* Current state: **fail-closed** — all connections are rejected until authentication (Slice 1) and channel authorization exist.
* Channels, envelope, ordering, reconnection and resynchronization follow `REALTIME_SPEC.md`.

---

# 11. Maps

* **Google Maps Platform**, accessed only through a replaceable `MapsService` abstraction (`docs/maps/MAPS_LOCATION_SPEC.md`).
* Server-side key for backend calls; restricted client keys for map display in the apps.
* No PostGIS in V1 unless adopted by ADR (`MAPS_LOCATION_SPEC.md` §12).

---

# 12. Notifications

* Push: **Firebase Cloud Messaging** and **Apple Push Notification service**, behind `NotificationService`.
* In-app notifications via the `notifications` table and realtime events.
* SMS and email channels exist in the notification architecture; their providers are not yet selected.
* Delivery is asynchronous through the outbox and the worker (`docs/notifications/NOTIFICATION_RULES.md`).

---

# 13. Object Storage

* **S3-compatible** object storage behind `StorageService`; no specific vendor is hard-coded.
* Private documents (restaurant/rider documents) are never publicly addressable; access is through short-lived signed URLs after backend authorization (`API_SPEC.md` §109).

---

# 14. Testing

| Layer | Tooling | Location |
|-------|---------|----------|
| Unit (backend, packages) | Jest + ts-jest | `src/**/*.spec.ts`, `src/**/*.test.ts` |
| API (HTTP contract, no services) | Jest + Supertest against the real Nest app | `backend/test/api/*.api-spec.ts` |
| Integration (PostgreSQL + Redis) | Jest + Supertest | `backend/test/integration/*.int-spec.ts` |
| Mobile components | jest-expo + React Native Testing Library | `apps/<app>/src/**/*.test.tsx` |
| Admin E2E | Playwright | `apps/admin/e2e/` |
| Cross-system / Golden E2E | Playwright + API (added in Slice 12) | `tests/` |

Authorization, business-rule, concurrency, idempotency and database-constraint suites are added with the slices that introduce those behaviours (`docs/testing/TESTING_SPEC.md`).

---

# 15. Monitoring and Logging

* **Sentry** for error tracking. Backend integration is in place (`backend/src/instrument.ts`) with request bodies, headers, cookies, query strings and user info **not** collected. Mobile (`@sentry/react-native`) and admin (`@sentry/nextjs`) SDKs are added with the first real screen batch of each app.
* **Structured JSON logs** (pino) with `request_id`, `correlation_id`, service, environment and version; credentials and tokens are redacted (`docs/observability/OBSERVABILITY_SPEC.md` §7).

---

# 16. Docker

* Local services: `infrastructure/local/docker-compose.yml` (PostgreSQL, Redis).
* Backend image: `infrastructure/docker/backend.Dockerfile` — one image for API and worker roles.
* No Kubernetes in V1 (`INFRASTRUCTURE_RULES.md` §63).

---

# 17. CI/CD

* **GitHub Actions** (`.github/workflows/ci.yml`): format, lint, typecheck, unit/API tests, build; backend integration tests with PostgreSQL/Redis service containers; admin Playwright E2E; dependency audit.
* Deployment pipelines (staging → approval → production) are added once deployment targets are provisioned (`docs/devops/DEVOPS_SPEC.md` §25–27).

---

# 18. Monorepo and Package Management

* **pnpm** workspaces (`pnpm-workspace.yaml`) with `node-linker=hoisted` (required by React Native/Expo tooling).
* **Turborepo** (`turbo.json`) orchestrates `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`.
* Shared packages:

| Package | Purpose |
|---------|---------|
| `@quickbite/config` | Strict TypeScript bases and shared ESLint flat config |
| `@quickbite/types` | Frozen vocabulary (roles, order/payment/promotion/review states) and API envelope types |
| `@quickbite/validation` | Zod schemas for envelopes and frozen vocabulary; per-slice input schemas |
| `@quickbite/api-client` | Typed `/api/v1` transport shared by all four apps |

`packages/utils` and `packages/ui` are **not** created yet: there is no concrete cross-application need. They are created when one appears.

---

# 19. Explicitly Not in the Stack

Not to be introduced without an ADR: microservices, Kubernetes, message brokers other than BullMQ/Redis (e.g. Kafka), search infrastructure (e.g. Elasticsearch), PostGIS, GraphQL, alternative ORMs, alternative state libraries, AI services.
