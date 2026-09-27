# QuickBite Restaurant App

## Purpose

The QuickBite Restaurant App lets restaurant owners and operators onboard their restaurant, manage menus and availability, receive and process orders, run promotions and view earnings and settlements.

UI **behavior** comes from the QuickBite specifications. UI **appearance** comes from the approved Stitch designs in `design/stitch/`. Where they conflict, the specification wins and the conflict is reported — behavior is never invented.

## Responsibilities

- Registration, verification and restaurant onboarding/application
- Restaurant profile, operating hours, delivery settings, availability
- Menu categories, items, variations, add-ons and item availability
- Incoming orders: accept, reject, start preparing, mark ready
- Promotions (owner-controlled)
- Earnings, settlements, payouts and invoices (read-only)
- Reviews and responses, notifications, support
- Staff/operator management (owner only)

Supported roles: `RESTAURANT_OWNER` and `RESTAURANT_OPERATOR` only. There are no manager, order-staff or kitchen-staff roles (ADR-0004).

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
apps/restaurant/
├── README.md
├── SCREEN_PLAN.md          # batches and screen statuses
├── design/stitch/          # approved Stitch references
└── src/
    ├── app/                # routes (Expo Router)
    └── lib/                # env, api client, query client
```

```bash
pnpm --filter @quickbite/restaurant dev         # Expo dev server
pnpm --filter @quickbite/restaurant lint
pnpm --filter @quickbite/restaurant typecheck
pnpm --filter @quickbite/restaurant test
pnpm --filter @quickbite/restaurant build       # expo export (Android + iOS bundles)
```

Configuration: `EXPO_PUBLIC_API_URL` (public, non-secret). See `.env.example`.

## Authoritative specifications

Read before implementing any screen (after `CLAUDE.md`):

- `docs/product/PRD.md` §3, §6, §9–11, §30, §45
- `docs/api/API_SPEC.md` §44–62, §112
- `docs/business-rules/ORDER_RULES.md` §12–15, §26
- `docs/business-rules/CANCELLATION_RULES.md`
- `docs/promotions/PROMOTION_RULES.md` §10–11, §40–43
- `docs/payments/FINANCIAL_SPEC.md` §41
- `docs/reviews/REVIEW_RULES.md` §15–16, §32–33
- `docs/notifications/REALTIME_SPEC.md` §12, §27
- `docs/support/SUPPORT_RULES.md`
- `docs/testing/TESTING_SPEC.md` §55
- `docs/security/AUTH_AUTHORIZATION.md`
- `docs/flows/GOLDEN_E2E_FLOW.md`
- `apps/restaurant/SCREEN_PLAN.md`

## Authentication

Authentication is implemented in **Slice 1** and the app's authentication screen batches. Tokens: short-lived access token + rotating refresh token bound to a server-side session (AUTH_AUTHORIZATION §21–24). On mobile, tokens are stored only in secure device storage — never in plain AsyncStorage, logs or Zustand persistence.

## Authorization

Every request is tenant-scoped: the user must be staff of the restaurant being accessed (API_SPEC §121). Sensitive financial/account operations (bank details, staff, promotions, settlements) are owner-only unless the specifications grant operators access. The backend enforces all of this; UI visibility is presentation only.

Authorization chain (always server-side): Authentication → Identity → Role → Permission → Resource Ownership / Tenant → Business Rule → Action.

## API communication

- All requests go through `src/lib/api.ts` (`@quickbite/api-client`) to `/api/v1`.
- Every request carries `X-Request-ID`; failures surface as `ApiError` with a stable `code` and `requestId`. Screens map `code` to user-facing messages and never show raw backend internals.
- Retry-sensitive mutations send an `Idempotency-Key` and reuse it on retry (API_SPEC §15).
- Server data lives in TanStack Query. Queries do not retry 4xx errors; mutations never retry automatically.
- Money values are decimal strings from the backend; display them, never compute authoritative amounts.
- Endpoints must exist in `docs/api/API_SPEC.md`. A missing endpoint is reported as a gap, not invented.

## Realtime communication

Subscribes (after authentication and tenant authorization) to `restaurant:{id}` channels: new orders, cancellations, payment status, rider assigned/arriving, notifications (API_SPEC §112). On reconnect, re-fetch the order queue over REST.

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
- Critical flows for this app: `docs/testing/TESTING_SPEC.md` §55.
- No fake backend behavior. Development mocks, if explicitly requested, are isolated and clearly labelled.

## Forbidden responsibilities

- Approving its own restaurant application
- Setting order status other than through the defined action endpoints
- Modifying settlement, payout or earnings amounts
- Assigning riders or marking orders delivered
- Creating additional restaurant roles
- Any fake production logic (fake order creation, payment success, rider assignment, financial records or authorization)
- Implementing screens that belong to another application

## Current implementation status

```text
Foundation:  DONE   — project structure, providers, API client wiring, lint/typecheck/test/build
Screens:     NONE   — no product screens implemented
```

`src/app/index.tsx` is a clearly-marked **foundation placeholder** (not a product screen) that exists only so the router can build. It is replaced by the first approved batch.

Next batch for this app: see `SCREEN_PLAN.md` (App order: Customer → Restaurant → Rider → Admin, `CLAUDE.md` §24).
