# QuickBite Rider App

## Purpose

The QuickBite Rider App lets approved riders go online, receive delivery offers from the Dispatch Engine, pick up and deliver orders, and track earnings, settlements and payouts.

UI **behavior** comes from the QuickBite specifications. UI **appearance** comes from the approved Stitch designs in `design/stitch/`. Where they conflict, the specification wins and the conflict is reported — behavior is never invented.

## Responsibilities

- Registration, verification, rider onboarding and documents
- Online/offline and availability
- Location updates while working
- Receiving, accepting and rejecting delivery offers
- Arriving, pickup, out-for-delivery and completion actions (incl. COD where applicable)
- Delivery history, earnings, settlements, payouts
- Notifications and support

Supported roles: `RIDER` only.

## Technology

| Concern      | Technology                                            |
| ------------ | ----------------------------------------------------- |
| Platform     | React Native (Expo SDK 57), iOS and Android           |
| Language     | TypeScript (strict)                                   |
| Navigation   | Expo Router (`src/app`)                               |
| Server state | TanStack Query                                        |
| Client state | Zustand (client-only state; never authoritative data) |
| Forms        | React Hook Form + Zod                                 |
| API          | `@quickbite/api-client` (`src/lib/api.ts`)            |
| Tests        | jest-expo + React Native Testing Library              |

Frozen stack: `docs/TECHNOLOGY_STACK.md`.

```text
apps/rider/
├── README.md
├── SCREEN_PLAN.md          # batches and screen statuses
├── design/stitch/          # approved Stitch references
└── src/
    ├── app/                # routes (Expo Router)
    └── lib/                # env, api client, query client
```

```bash
pnpm --filter @quickbite/rider dev         # Expo dev server
pnpm --filter @quickbite/rider lint
pnpm --filter @quickbite/rider typecheck
pnpm --filter @quickbite/rider test
pnpm --filter @quickbite/rider build       # expo export (Android + iOS bundles)
```

Configuration: `EXPO_PUBLIC_API_URL` (public, non-secret). See `.env.example`.

## Authoritative specifications

Read before implementing any screen (after `CLAUDE.md`):

- `docs/product/PRD.md` §3, §7, §16–20, §31, §45
- `docs/api/API_SPEC.md` §63–76, §113
- `docs/business-rules/DISPATCH_RULES.md`
- `docs/business-rules/ORDER_RULES.md` §16–19, §27
- `docs/payments/PAYMENT_RULES.md` §19–21
- `docs/payments/FINANCIAL_SPEC.md` §14–22, §42
- `docs/maps/MAPS_LOCATION_RULES.md`
- `docs/notifications/REALTIME_SPEC.md` §13, §28, §31–35
- `docs/testing/TESTING_SPEC.md` §56
- `docs/security/AUTH_AUTHORIZATION.md`
- `docs/flows/GOLDEN_E2E_FLOW.md`
- `apps/rider/SCREEN_PLAN.md`

## Authentication

Authentication is implemented in **Slice 1** and the app's authentication screen batches. Tokens: short-lived access token + rotating refresh token bound to a server-side session (AUTH_AUTHORIZATION §21–24). On mobile, tokens are stored only in secure device storage — never in plain AsyncStorage, logs or Zustand persistence.

## Authorization

A rider can only see offers made to them and deliveries assigned to them, and only their own earnings and settlements (ORDER_RULES §27). Going online, accepting offers and every delivery transition are validated by the backend.

Authorization chain (always server-side): Authentication → Identity → Role → Permission → Resource Ownership / Tenant → Business Rule → Action.

## API communication

- All requests go through `src/lib/api.ts` (`@quickbite/api-client`) to `/api/v1`.
- Every request carries `X-Request-ID`; failures surface as `ApiError` with a stable `code` and `requestId`. Screens map `code` to user-facing messages and never show raw backend internals.
- Retry-sensitive mutations send an `Idempotency-Key` and reuse it on retry (API_SPEC §15).
- Server data lives in TanStack Query. Queries do not retry 4xx errors; mutations never retry automatically.
- Money values are decimal strings from the backend; display them, never compute authoritative amounts.
- Endpoints must exist in `docs/api/API_SPEC.md`. A missing endpoint is reported as a gap, not invented.

## Realtime communication

Subscribes (after authentication) to its `rider:{id}` channel: offer created/cancelled/expired, assignment created/cancelled, notifications (API_SPEC §113). Sends location updates per MAPS/REALTIME rules. On reconnect, re-fetch current offers and current delivery over REST.

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

- Component/screen tests with jest-expo + React Native Testing Library (`src/**/*.test.tsx`).
- Critical flows for this app: `docs/testing/TESTING_SPEC.md` §56.
- No fake backend behavior. Development mocks, if explicitly requested, are isolated and clearly labelled.

## Forbidden responsibilities

- Self-assignment or seeing deliveries not offered to this rider
- Deciding offer expiry, assignment or delivery/order state
- Calculating earnings
- Rider ratings (V1 exclusion)
- Multi-order batching (one active delivery per rider — ADR-0013)
- Any fake production logic (fake order creation, payment success, rider assignment, financial records or authorization)
- Implementing screens that belong to another application

## Current implementation status

```text
Foundation:  DONE   — project structure, providers, API client wiring, lint/typecheck/test/build
Screens:     NONE   — no product screens implemented
```

`src/app/index.tsx` is a clearly-marked **foundation placeholder** (not a product screen) that exists only so the router can build. It is replaced by the first approved batch.

Next batch for this app: see `SCREEN_PLAN.md` (App order: Customer → Restaurant → Rider → Admin, `CLAUDE.md` §24).
