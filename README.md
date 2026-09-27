# QuickBite

QuickBite is a production-oriented **food delivery marketplace** connecting customers, restaurants and riders, operated by platform administrators.

> **Status:** Phase 20 — Implementation. The repository foundation is in place. **No product feature is implemented yet.** See [Current implementation status](#current-implementation-status).

---

## V1 scope

QuickBite V1 delivers the complete customer → restaurant → dispatch → rider → delivery → payment → earnings lifecycle (`docs/product/PRD.md` §45, §49):

- **Customers** — register, manage profile/addresses, discover restaurants, order, pay online or cash on delivery, track in real time, cancel where permitted, review restaurants, get support.
- **Restaurants** — onboard (admin-approved), manage menu and availability, accept/prepare/ready orders, promotions, earnings, settlements.
- **Riders** — onboard (admin-approved), go online, receive offers from the Dispatch Engine, pick up and deliver, earnings.
- **Admins** — operate customers, restaurants, riders, orders, payments/refunds, settlements, promotions, reviews, support, risk, configuration and audit.

Explicitly **out of V1**: AI features, loyalty, subscriptions, corporate accounts, multi-restaurant cart, advertising marketplace, grocery/pharmacy, multi-country/multi-currency, crypto, rider ratings, review rewards/media, promotion stacking, referrals, cashback (`CLAUDE.md` §37).

## Applications

| App            | Path              | Users                                     | Technology              |
| -------------- | ----------------- | ----------------------------------------- | ----------------------- |
| Customer App   | `apps/customer`   | `CUSTOMER`                                | Expo / React Native     |
| Restaurant App | `apps/restaurant` | `RESTAURANT_OWNER`, `RESTAURANT_OPERATOR` | Expo / React Native     |
| Rider App      | `apps/rider`      | `RIDER`                                   | Expo / React Native     |
| Admin Panel    | `apps/admin`      | `ADMIN`, `SUPER_ADMIN`                    | Next.js                 |
| Backend        | `backend`         | all apps                                  | NestJS modular monolith |

The six roles above are the complete, frozen role set (ADR-0004).

## Architecture

```text
 Customer App   Restaurant App   Rider App   Admin Panel
      └──────────────┴───────┬───────┴────────────┘
                   REST /api/v1  +  Socket.IO (/realtime)
                             │
                 Backend (NestJS modular monolith)
                  ├── API process
                  └── Worker process (BullMQ, outbox)
                             │
          PostgreSQL (source of truth) · Redis (operational) · S3-compatible storage
                             │
         Payment provider · Google Maps Platform · FCM / APNs · SMS / email
```

Core principles (`CLAUDE.md`, `docs/decisions/ADR/`):

- **Modular monolith**, not microservices (ADR-0001).
- **PostgreSQL** is the durable source of truth; **Redis** is operational only (ADR-0002, ADR-0003).
- The **backend is authoritative** for prices, totals, states, eligibility, assignment, earnings and permissions (ADR-0005).
- Frozen **order lifecycle** owned by the backend (ADR-0006); **Dispatch Engine** with atomic assignment, no global broadcast (ADR-0007).
- **Outbox** for critical events, **idempotency keys** for retry-sensitive operations (ADR-0011, ADR-0012).

## Technology stack

Frozen in [`docs/TECHNOLOGY_STACK.md`](docs/TECHNOLOGY_STACK.md):

React Native + Expo + Expo Router · TanStack Query · Zustand · React Hook Form + Zod · Next.js · Node.js + NestJS · REST + Socket.IO · PostgreSQL + Prisma · Redis · BullMQ · S3-compatible storage · Google Maps Platform · FCM + APNs · Sentry · Docker · GitHub Actions · pnpm + Turborepo · Jest + Supertest + Playwright + React Native Testing Library.

## Repository structure

```text
.
├── apps/
│   ├── customer/            # Expo app       — README.md, SCREEN_PLAN.md, design/stitch/, src/
│   ├── restaurant/          # Expo app
│   ├── rider/               # Expo app
│   └── admin/               # Next.js app
├── backend/                 # NestJS modular monolith (API + worker), Prisma schema
├── packages/
│   ├── config/              # shared strict tsconfig bases + ESLint config
│   ├── types/               # frozen vocabulary + API envelope types
│   ├── validation/          # shared Zod schemas
│   └── api-client/          # typed /api/v1 transport for all apps
├── tests/                   # cross-system suites (Golden E2E, smoke) — added per slice
├── infrastructure/
│   ├── local/               # docker-compose for local PostgreSQL + Redis
│   └── docker/              # backend container image
├── scripts/                 # repository scripts (doc link checker)
├── docs/                    # specifications (source of truth), ADRs, reports
├── .github/                 # CI workflow, PR template
├── CLAUDE.md                # implementation rules for Claude Code
└── README.md
```

## Documentation

Hierarchy (`CLAUDE.md` §2): `CLAUDE.md` → product/architecture/database/API specs → business rules → security → domain specs → implementation plan → app README/SCREEN_PLAN → Stitch designs → implementation.

| Area                                   | Documents                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Product                                | `docs/product/PRD.md`                                                             |
| Architecture                           | `docs/architecture/ARCHITECTURE.md`, `docs/ARCHITECTURE_CONSISTENCY_REVIEW.md`    |
| Stack                                  | `docs/TECHNOLOGY_STACK.md`                                                        |
| Decisions                              | `docs/decisions/ADR/`                                                             |
| Database                               | `docs/database/DATABASE.md`                                                       |
| API                                    | `docs/api/API_SPEC.md`                                                            |
| Business rules                         | `docs/business-rules/` (orders, cancellation, dispatch, risk)                     |
| Security                               | `docs/security/AUTH_AUTHORIZATION.md`                                             |
| Notifications / realtime               | `docs/notifications/NOTIFICATION_RULES.md`, `docs/notifications/REALTIME_SPEC.md` |
| Payments / financial                   | `docs/payments/PAYMENT_RULES.md`, `docs/payments/FINANCIAL_SPEC.md`               |
| Maps                                   | `docs/maps/`                                                                      |
| Promotions / reviews / support / admin | `docs/promotions/`, `docs/reviews/`, `docs/support/`, `docs/admin/`               |
| Observability / testing                | `docs/observability/`, `docs/testing/`                                            |
| Infrastructure / DevOps                | `docs/infrastructure/`, `docs/devops/`                                            |
| Golden flow                            | `docs/flows/GOLDEN_E2E_FLOW.md`                                                   |
| Plan                                   | `docs/IMPLEMENTATION_PLAN.md`                                                     |
| Open issues                            | `docs/REPOSITORY_CONSISTENCY_REPORT.md`                                           |

## Development workflow

Implementation proceeds in **vertical slices** (`docs/IMPLEMENTATION_PLAN.md` §4):

```text
1 Authentication → 2 Customer Profile → 3 Restaurant Onboarding → 4 Menu → 5 Discovery → 6 Cart
→ 7 Checkout → 8 Payments → 9 Restaurant Orders → 10 Dispatch → 11 Rider Delivery → 12 Completion
→ 13 Earnings → 14 Settlements → 15 Promotions → 16 Reviews → 17 Support → 18 Admin Operations
```

Each slice connects database → backend → API → authorization → business rules → frontend → events → audit → tests. Missing or conflicting specifications stop the work and are raised for a decision — never invented in code.

Branches: `feature/<scope>-<description>`, `fix/...`, `docs/...`, `chore/...` (`docs/devops/DEVOPS_SPEC.md` §4). Pull requests use `.github/pull_request_template.md`.

## Stitch workflow

- UI designs are created in **Google Stitch** by the project owner and placed in `apps/<app>/design/stitch/batch-XX/NN-screen-name/`.
- **Stitch controls appearance; specifications control behavior.** On conflict, the business rule wins and the conflict is reported.
- Designs are never fabricated; a screen without an approved design is not implemented.

## Screen batches

- Each app's `SCREEN_PLAN.md` lists screens in batches of **4** (smaller when the feature boundary requires).
- Statuses: `TODO` → `IN_PROGRESS` → `REVIEW` → `APPROVED` (user only), or `BLOCKED`.
- Claude implements **only the active batch**, validates (lint, typecheck, tests, build), reports, and **stops** until the user approves.
- App order: Customer → Restaurant → Rider → Admin (`CLAUDE.md` §24).

## Testing

| Command                 | What it runs                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm test`             | Unit tests (packages, backend), backend API tests (Supertest, no services), mobile component tests |
| `pnpm test:integration` | Backend integration tests (requires PostgreSQL + Redis)                                            |
| `pnpm test:e2e`         | Admin Playwright E2E (requires `pnpm build` first)                                                 |

Testing strategy: `docs/testing/TESTING_RULES.md`, `docs/testing/TESTING_SPEC.md`, `tests/README.md`.

## Environment setup

Prerequisites: **Node.js 22** (`.nvmrc`), **pnpm 10** (`corepack enable`), **Docker** (for local PostgreSQL/Redis).

```bash
corepack enable
pnpm install

cp .env.example .env                       # local, non-secret defaults — never commit .env
docker compose -f infrastructure/local/docker-compose.yml up -d

pnpm build                                 # builds shared packages, backend, apps
pnpm --filter @quickbite/backend dev       # API on http://localhost:3000  (/health/ready)
pnpm --filter @quickbite/backend dev:worker
pnpm --filter @quickbite/customer dev      # Expo dev server (likewise restaurant / rider)
pnpm --filter @quickbite/admin dev         # http://localhost:3100
```

Full local validation (same as CI):

```bash
pnpm validate      # format:check, docs:check, lint, typecheck, test, build
```

Secrets are never committed. Staging/production configuration comes from the deployment platform's secret manager (`docs/infrastructure/INFRASTRUCTURE_RULES.md` §21–22).

## Current implementation status

| Area                                                                                                                         | Status                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Specifications (Phases 1–19)                                                                                                 | Complete and frozen                               |
| Repository foundation (monorepo, tooling, CI, docs normalization, ADRs)                                                      | **Done**                                          |
| Backend foundation (config, logging, error envelope, request IDs, Prisma/Redis/BullMQ wiring, fail-closed Socket.IO, health) | **Done**                                          |
| App foundations (Customer, Restaurant, Rider, Admin)                                                                         | **Done** — placeholder route only                 |
| Database schema / migrations                                                                                                 | **Not started** — Prisma schema has no models yet |
| Product features (all 18 slices)                                                                                             | **Not started**                                   |
| Product screens (all apps)                                                                                                   | **Not started** — all screens `TODO`              |
| Deployment pipelines (staging/production)                                                                                    | **Not started**                                   |

Known gaps and open decisions: [`docs/REPOSITORY_CONSISTENCY_REPORT.md`](docs/REPOSITORY_CONSISTENCY_REPORT.md).
