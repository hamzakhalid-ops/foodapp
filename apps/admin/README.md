# QuickBite Admin Panel

## Purpose

The QuickBite Admin Panel is the web application for platform administrators to operate the marketplace: customers, restaurants, riders, orders, payments, refunds, settlements, promotions, reviews, support, risk, configuration, reports and audit logs.

UI **behavior** comes from the QuickBite specifications. UI **appearance** comes from the approved Stitch designs in `design/stitch/`. Where they conflict, the specification wins and the conflict is reported — behavior is never invented.

## Responsibilities

- Admin authentication with MFA/step-up where required
- Operational dashboard
- Customer, restaurant and rider management incl. application approval
- Order operations and audited admin cancellation
- Payments, refunds and settlements
- Promotion and review moderation
- Support ticket handling
- Risk flags, restrictions and rules
- System configuration and audit logs
- Super-admin: admin users and permissions

Supported roles: `ADMIN` and `SUPER_ADMIN` only. Super-admin-only capabilities are listed in ADMIN_RULES §5 and ADMIN_SPEC §29.

## Technology

| Concern      | Technology                                 |
| ------------ | ------------------------------------------ |
| Platform     | Web (Next.js 16, App Router, `src/app`)    |
| Language     | TypeScript (strict)                        |
| Server state | TanStack Query                             |
| API          | `@quickbite/api-client` (`src/lib/api.ts`) |
| Tests        | Playwright (`e2e/`)                        |

Frozen stack: `docs/TECHNOLOGY_STACK.md`.

```text
apps/admin/
├── README.md
├── SCREEN_PLAN.md          # batches and screen statuses
├── design/stitch/          # approved Stitch references
└── src/
    ├── app/                # routes (Next.js App Router)
    └── lib/                # env, api client, query client
```

```bash
pnpm --filter @quickbite/admin dev         # http://localhost:3100
pnpm --filter @quickbite/admin lint
pnpm --filter @quickbite/admin typecheck
pnpm --filter @quickbite/admin build
pnpm --filter @quickbite/admin test:e2e    # Playwright (after build)
```

Configuration: `NEXT_PUBLIC_API_URL` (public, non-secret). See `.env.example`.

## Authoritative specifications

Read before implementing any screen (after `CLAUDE.md`):

- `docs/product/PRD.md` §3, §8, §38, §44–45
- `docs/admin/ADMIN_RULES.md`
- `docs/admin/ADMIN_SPEC.md`
- `docs/api/API_SPEC.md` §83–87, §93–108, §114
- `docs/security/AUTH_AUTHORIZATION.md`
- `docs/payments/FINANCIAL_SPEC.md` §43
- `docs/business-rules/RISK_RULES.md`
- `docs/testing/TESTING_SPEC.md` §57
- `docs/security/AUTH_AUTHORIZATION.md`
- `docs/flows/GOLDEN_E2E_FLOW.md`
- `apps/admin/SCREEN_PLAN.md`

## Authentication

Authentication is implemented in **Slice 1** and Admin Batch 01. Admin sessions use stronger controls: MFA, shorter sessions, session monitoring and step-up for sensitive actions (API_SPEC §93, ADMIN_RULES §29–30, §37). Tokens must not be readable by third-party scripts or written to logs.

## Authorization

Every admin action is permission-checked and audited by the backend (ADMIN_RULES §6, §27–29). Sensitive actions require a reason, confirmation and step-up where specified. The UI is permission-aware for usability only — never as a security boundary.

Authorization chain (always server-side): Authentication → Identity → Role → Permission → Resource Ownership / Tenant → Business Rule → Action.

## API communication

- All requests go through `src/lib/api.ts` (`@quickbite/api-client`) to `/api/v1`.
- Every request carries `X-Request-ID`; failures surface as `ApiError` with a stable `code` and `requestId`. Screens map `code` to user-facing messages and never show raw backend internals.
- Retry-sensitive mutations send an `Idempotency-Key` and reuse it on retry (API_SPEC §15).
- Server data lives in TanStack Query. Queries do not retry 4xx errors; mutations never retry automatically.
- Money values are decimal strings from the backend; display them, never compute authoritative amounts.
- Endpoints must exist in `docs/api/API_SPEC.md`. A missing endpoint is reported as a gap, not invented.

## Realtime communication

Subscribes (after authentication and admin authorization) to `admin:operations`: order, delivery, risk, support, application and payment-failure events (API_SPEC §114, REALTIME_SPEC §53). Views re-fetch over REST on reconnect.

Realtime is an optimization; REST remains the source of truth (REALTIME_SPEC §2, §58). The backend gateway currently rejects all connections until authentication exists.

## Stitch workflow

1. The project owner places approved Stitch exports in `design/stitch/batch-XX/NN-screen-name/` (see `design/stitch/README.md`).
2. Claude reproduces layout, spacing, typography, colors, components, icons, states and navigation faithfully.
3. Exported Stitch code is a reference only; it is re-implemented with this app's architecture.
4. Designs are never fabricated. A screen without an approved Stitch reference is not implemented.

## Screen implementation workflow

```text
Active batch in SCREEN_PLAN.md (default 4 screens)
 → read specs + Stitch references
 → implement ONLY the active batch (with API integration, loading/error/empty states)
 → lint, typecheck, tests, build
 → mark screens REVIEW
 → STOP and report
 → user approval → next batch
```

Never implement future screens, even if they are easy. Only the user marks a screen `APPROVED`.

## Testing

- Playwright E2E for critical flows (`e2e/`), run against the production build.
- Critical flows for this app: `docs/testing/TESTING_SPEC.md` §57.
- No fake backend behavior. Development mocks, if explicitly requested, are isolated and clearly labelled.

## Forbidden responsibilities

- Direct database manipulation or bypassing domain rules (ADMIN_SPEC §67)
- Assigning riders outside the Dispatch Engine
- Unaudited sensitive actions
- Hard-coded risk thresholds or permanent bans
- Advanced advertising marketplace, complex predictive analytics (V1 exclusions)
- Any fake production logic (fake order creation, payment success, rider assignment, financial records or authorization)
- Implementing screens that belong to another application

## Current implementation status

```text
Foundation:  DONE   — project structure, providers, API client wiring, lint/typecheck/test/build
Screens:     NONE   — no product screens implemented
```

`src/app/page.tsx` is a clearly-marked **foundation placeholder** (not a product screen) that exists only so the app can build. It is replaced by the first approved batch.

Next batch for this app: see `SCREEN_PLAN.md` (App order: Customer → Restaurant → Rider → Admin, `CLAUDE.md` §24).
