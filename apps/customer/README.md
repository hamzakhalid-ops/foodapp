# QuickBite Customer App

## Purpose

The QuickBite Customer App lets customers discover restaurants, order food, pay (online or cash on delivery), track deliveries, cancel where permitted, review restaurants and contact support.

UI **behavior** comes from the QuickBite specifications. UI **appearance** comes from the approved Stitch designs in `design/stitch/`. Where they conflict, the specification wins and the conflict is reported — behavior is never invented.

## Responsibilities

- Account registration, login and verification
- Profile and delivery addresses
- Restaurant discovery, search and menus
- Cart and checkout (totals always recalculated by the backend)
- Online payment initiation and COD selection (payment confirmed only by the backend)
- Order tracking in real time, order history, cancellation where the backend permits
- Restaurant reviews for eligible delivered orders
- Notifications and support

Supported roles: `CUSTOMER` only.

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
apps/customer/
├── README.md
├── SCREEN_PLAN.md          # batches and screen statuses
├── design/stitch/          # approved Stitch references
└── src/
    ├── app/                # routes (Expo Router)
    └── lib/                # env, api client, query client
```

```bash
pnpm --filter @quickbite/customer dev         # Expo dev server
pnpm --filter @quickbite/customer lint
pnpm --filter @quickbite/customer typecheck
pnpm --filter @quickbite/customer test
pnpm --filter @quickbite/customer build       # expo export (Android + iOS bundles)
```

Configuration: `EXPO_PUBLIC_API_URL` (public, non-secret). See `.env.example`.

## Authoritative specifications

Read before implementing any screen (after `CLAUDE.md`):

- `docs/product/PRD.md` §3, §5, §12–15, §28, §35–37, §45
- `docs/api/API_SPEC.md` §16–43, §77–82, §88–92, §111
- `docs/business-rules/ORDER_RULES.md`
- `docs/business-rules/CANCELLATION_RULES.md`
- `docs/business-rules/RISK_RULES.md` (COD/order restrictions surfaced to the customer)
- `docs/payments/PAYMENT_RULES.md`
- `docs/promotions/PROMOTION_RULES.md`
- `docs/reviews/REVIEW_RULES.md`
- `docs/maps/MAPS_LOCATION_RULES.md`
- `docs/notifications/NOTIFICATION_RULES.md`
- `docs/notifications/REALTIME_SPEC.md` §11, §26
- `docs/support/SUPPORT_RULES.md`
- `docs/testing/TESTING_SPEC.md` §54
- `docs/security/AUTH_AUTHORIZATION.md`
- `docs/flows/GOLDEN_E2E_FLOW.md`
- `apps/customer/SCREEN_PLAN.md`

## Authentication

Authentication is implemented in **Slice 1** and the app's authentication screen batches. Tokens: short-lived access token + rotating refresh token bound to a server-side session (AUTH_AUTHORIZATION §21–24). On mobile, tokens are stored only in secure device storage — never in plain AsyncStorage, logs or Zustand persistence.

## Authorization

A customer may only read and act on their own profile, addresses, cart, orders, payments, reviews, notifications and support tickets. Ownership is enforced by the backend (API_SPEC §120); the app never sends or relies on client-provided ownership.

Authorization chain (always server-side): Authentication → Identity → Role → Permission → Resource Ownership / Tenant → Business Rule → Action.

## API communication

- All requests go through `src/lib/api.ts` (`@quickbite/api-client`) to `/api/v1`.
- Every request carries `X-Request-ID`; failures surface as `ApiError` with a stable `code` and `requestId`. Screens map `code` to user-facing messages and never show raw backend internals.
- Retry-sensitive mutations send an `Idempotency-Key` and reuse it on retry (API_SPEC §15).
- Server data lives in TanStack Query. Queries do not retry 4xx errors; mutations never retry automatically.
- Money values are decimal strings from the backend; display them, never compute authoritative amounts.
- Endpoints must exist in `docs/api/API_SPEC.md`. A missing endpoint is reported as a gap, not invented.

## Realtime communication

Subscribes (after authentication) to its own `user:{id}` and `order:{id}` channels: order status changes, rider assignment, rider location during delivery, notifications (API_SPEC §111). On reconnect the app re-fetches authoritative state over REST.

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
- Critical flows for this app: `docs/testing/TESTING_SPEC.md` §54.
- No fake backend behavior. Development mocks, if explicitly requested, are isolated and clearly labelled.

## Forbidden responsibilities

- Calculating authoritative prices, discounts, fees or totals
- Declaring a payment successful
- Deciding cancellation eligibility or order state
- Deciding promotion or review eligibility
- Assigning riders
- Loyalty, referrals, cashback, subscriptions, multi-restaurant cart, AI recommendations (V1 exclusions)
- Any fake production logic (fake order creation, payment success, rider assignment, financial records or authorization)
- Implementing screens that belong to another application

## Current implementation status

```text
Foundation:  DONE   — project structure, providers, API client wiring, lint/typecheck/test/build
Screens:     NONE   — no product screens implemented
```

`src/app/index.tsx` is a clearly-marked **foundation placeholder** (not a product screen) that exists only so the router can build. It is replaced by the first approved batch.

Next batch for this app: see `SCREEN_PLAN.md` (App order: Customer → Restaurant → Rider → Admin, `CLAUDE.md` §24).
