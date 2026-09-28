# QuickBite — Backend Final Audit

**Phase:** 20 — Implementation · **Date:** 2026-09-28 · **Base:** `claude/admiring-lovelace-42hgni` @ `72cbcec`

**Method.** The audit read the authoritative specifications and the implementation itself; a file
existing was not treated as proof that its feature works. It covered:

* every controller, compared route by route against API_SPEC (inventory in the appendix);
* the Prisma schema, the migrations and the live database catalogue (foreign-key indexes);
* the authorization decorators, guards and ownership queries;
* the outbox handlers, including their behaviour when an event is delivered again;
* a scan of the code for placeholders.

All validation commands were run before and after the fixes.

Related: [`BACKEND_COMPLETION_REPORT.md`](BACKEND_COMPLETION_REPORT.md) ·
[`api/API_IMPLEMENTATION_NOTES.md`](api/API_IMPLEMENTATION_NOTES.md) ·
[ADR-0014](decisions/ADR/0014-v1-open-decisions.md).

---

## 1. Executive Summary

The backend is **functionally complete for V1**. All 18 implementation slices are present. The
golden end-to-end flow passes through the real HTTP API, from registration to
invoice → reconciliation → audit.

The audit found and fixed:
* **one P0 financial-correctness defect** in settlement finalization (§5.1);
* **one P2 shared-contract defect** in the typed API client (§6.2);
* **one P4 database gap**: missing indexes on settlement links (§7.1).

It also added a Customer API contract test that drives the real `@quickbite/api-client` against
the running API.

No security vulnerability (IDOR, privilege escalation, missing tenant check) was found.

What remains is **provider-dependent work** (payment, payout, SMS/email/push, maps) and
**owner decisions** already recorded in ADR-0014 follow-ups. No backend code blocks Customer UI
work.

## 2. Completed Modules

| Module | Evidence |
|--------|----------|
| `auth`, `users`, `customers`, `audit` | Registration, login, refresh rotation with reuse detection, logout, phone/email verification, password reset, sessions checked on every request, admin TOTP MFA with step-up. Integration: `auth`, `admin`. |
| `restaurants`, `restaurant-staff` | Onboarding and application review, tenant guard, owner/operator split, availability and hours. |
| `menu`, `discovery` | Owner menu management, public menu, discovery and search with radius. |
| `cart`, `checkout`, `orders`, `cancellation` | PostgreSQL carts, backend recalculation, idempotent order creation, compare-and-set state machine, cancellation windows, restaurant analytics. |
| `payments` | COD and online payments through a provider port; signed webhooks deduplicated by event id; amounts verified; refunds capped at the amount paid; admin refund decisions. |
| `riders`, `deliveries`, `dispatch` | Onboarding and documents, availability and location (Redis GEO), eligibility, expanding radius, offers and expiry, atomic assignment, one active delivery per rider (partial unique index). |
| `risk`, `promotions`, `reviews`, `support` | Rules, flags and restrictions enforced at checkout and dispatch; one promotion per order; one review per delivered order; ticket lifecycle. |
| `notifications` + realtime | Outbox → notifications with dedup keys and retries; Socket.IO with session authentication, 30 s re-validation and channel authorization. |
| `earnings`, `settlements`, `payouts` | Earnings on delivery; settlements with reconciliation-gated approval; payouts through a provider port; invoices; adjustments; reconciliation report. |
| `admin` | Dashboard, customers (incl. restrict/restore through risk), orders, configuration, dispatch settings, audit logs; every sensitive action audited. |

## 3. Partial Modules

| Area | What exists | What is missing | Why |
|------|-------------|-----------------|-----|
| Maps / location (MAPS_LOCATION_SPEC §3–9) | Coordinate validation, haversine distance, radius checks, rider GEO index | `MapsService` with geocode, reverse-geocode, route and ETA | Provider not selected. No API endpoint or business rule consumes these today: addresses are submitted as coordinates by the client. |
| Payment / payout / notification delivery | Provider ports with sandbox/log adapters; config refuses them in staging/production | Real adapters | Provider selection required (ADR-0014 §5). |
| Invoices (FINANCIAL_SPEC §44) | Invoice record, backend number, immutability trigger | PDF rendering (`file_url` is null) | No document template or renderer defined. |

## 4. Remaining Backend Work

Only genuine remaining work is listed.

1. **Provider adapters** once providers are chosen: payment, payout, SMS, email, push, maps.
2. **Owner decisions** carried over from the completion report:
   * how refunds are allocated to earnings;
   * how riders remit cash from COD orders;
   * payout destination (bank account) management;
   * invoice rendering;
   * effective-dated commission rates;
   * support SLAs;
   * moderation of review responses;
   * manual rider assignment;
   * expiry of unpaid online orders.
3. **Operational tooling.** There is no endpoint to replay an outbox event that failed
   permanently (after 10 attempts). Such failures are logged and surface in the reconciliation
   report (for example `DELIVERED_ORDER_WITHOUT_RESTAURANT_EARNING`). Recovery currently means
   resetting the event status in the database.

## 5. Security Findings

| # | Priority | Finding | Resolution |
|---|----------|---------|------------|
| 5.1 | **P0 (financial correctness)** | `SettlementsService.onPayoutFinished` trusted the payout id in the event. Outbox events are delivered at least once, so a redelivered "payout #1 failed" event could arrive after an admin had retried with payout #2. It flipped the settlement back to `FAILED`. When payout #2 then completed, its event was ignored because the settlement was no longer `PROCESSING`: money was paid while the settlement and earnings stayed unsettled. | **Fixed.** Only the settlement's latest payout attempt decides the outcome; stale events are ignored. A regression test replays the old event during the retry (`finance.int-spec.ts`); it failed before the fix. |
| 5.2 | Checked — OK | Every `/restaurant/*` route uses the tenant guard; every `/rider/*` route requires `RIDER`; admin routes require MFA and step-up where sensitive; `SUPER_ADMIN` is required for money movement and configuration. | No change. |
| 5.3 | Checked — OK | IDOR probes on customer-owned resources (cart items, addresses, orders, payments, reviews, notifications, support): every lookup is scoped by owner, and foreign resources return 404. | No change. |
| 5.4 | Checked — OK | Idempotency keys are scoped per user and endpoint, so there is no cross-user replay. Webhooks are deduplicated by provider event id and their signatures are verified. | No change. |
| 5.5 | Checked — OK | There is no API that grants `ADMIN`/`SUPER_ADMIN`, so no role-escalation path exists. An operator is removed from the role when their membership ends. | No change. |
| 5.6 | Ambiguity (P3) | `POST /restaurant/staff` attaches any active account by email as operator without that account's consent, exactly as API_SPEC §57 defines it. Consent/invitation is not specified. | Recorded; needs a product decision. |
| 5.7 | By design | `/sandbox/payments/*` and `/sandbox/payouts/*` are public in development/test. Configuration refuses the sandbox adapters in staging/production, and the routes return 404 without them. | No change. |

## 6. API Findings

### 6.1 Coverage

* All endpoints listed in API_SPEC are implemented, except:
  * `PATCH /admin/customers/{id}`: no editable fields are defined, and ADMIN_RULES §8 forbids
    editing private information without authorization.
  * `GET /orders`: in §10 this is only a pagination example; customers use `GET /customer/orders`.
* The 26 routes outside API_SPEC are documented gap fills (MFA, adjustments, reconciliation,
  review moderation queue, device tokens, etc.). Two routes are dev/test-only sandbox endpoints.
* See the appendix for the full inventory.

### 6.2 Shared contract defect (P2) — fixed

`@quickbite/api-client` typed request bodies with `z.infer`, which is the schema's *output* type.
For schemas with server defaults this made optional fields required in TypeScript:
* the cart item's `variationIds` and `addOnIds`;
* the support ticket's `priority`;
* the admin support message's `internal`;
* the risk event's `severity` and `metadata`;
* the risk rule's `enabled`.

Frontends would have been forced to send defaults the API does not need. `@quickbite/validation`
now also exports `z.input` types (`AddCartItemInput`, `CreateSupportTicketInput`,
`AdminSupportMessageInput`, `CreateRiskEventInput`, `CreateRiskRuleInput`), and the client methods
use them. Backend types are unchanged.

### 6.3 Contract test added

`customer-api-contract.int-spec.ts` drives the whole customer journey through the real
`@quickbite/api-client` against the listening API:
* auth, profile, addresses, discovery, menu, search and promotions;
* cart, checkout, order, status and history;
* payment methods, notifications, review eligibility and review, cancellation;
* support, logout.

Every response is parsed by the shared Zod schemas, so any response drift fails in CI rather than
in the app.

## 7. Database Findings

| # | Finding | Resolution |
|---|---------|------------|
| 7.1 | `restaurant_earnings.settlement_id`, `rider_earnings.settlement_id`, `financial_adjustments.settlement_id` and `payouts.settlement_id` had no index. They are filtered on every payout completion and settlement detail, and PostgreSQL does not index foreign keys automatically. | Migration `20260928011242_audit_settlement_indexes` (additive, indexes only). |
| 7.2 | Other unindexed foreign keys are actor/audit columns (`reviewed_by`, `created_by`, `updated_by`, …) that are never used as filters. | No change. |
| 7.3 | Money is `NUMERIC(12,2)` in every financial column; the other decimals are coordinates, distances and percentages. All timestamps are `timestamptz`. Enums match the frozen vocabulary (CLAUDE.md §5, §12, §15–18). | No change. |
| 7.4 | Migrations are ordered and additive; no applied migration was edited. A fresh database migrated from zero matches `schema.prisma` exactly. | Verified (see §10). |
| 7.5 | Duplicate protection is enforced by the database. Unique keys cover: one earning per order/delivery, one settlement item per source, one live payout per settlement, one review per order, one active delivery per rider, and the idempotency key per user and endpoint. Append-only triggers protect order history, settlement items and invoices. | No change. |

## 8. Business Rule Findings

* **Implementation matches the rules:**
  * the order lifecycle, cancellation windows (ADR-0014 §12) and COD collection (§10);
  * dispatch: eligibility, expanding radius, expiry, atomic accept and risk blocks;
  * risk thresholds from configuration, with no permanent bans;
  * promotions: one per order, restaurant-funded;
  * reviews: DELIVERED orders only, one per order, published-only aggregates;
  * refund cap and no automatic refunds (ADR-0014 §9);
  * earnings formula (ADR-0014 §2).
* **Outbox handlers were re-checked for redelivery.** `dispatch.on-ready` is guarded by order and
  delivery status, `risk.evaluate` by existing flags and an advisory lock, earnings by unique keys,
  notifications by dedup keys. The settlement handler was the only one that was unsafe (fixed, §5.1).
* **Error codes.** 13 error codes are defined but never thrown (for example `RESTAURANT_PAUSED`,
  `ORDER_RECALCULATION_REQUIRED`). They are catalogue entries: no specification rule requires
  them, and paused restaurants return `RESTAURANT_NOT_AVAILABLE`.
* **Undefined in the specifications**, so recorded rather than invented:
  * vehicle eligibility ("where required", DISPATCH_RULES §4, but no requirement is defined);
  * operator invitation consent (§5.6);
  * the owner decisions listed in §4.

## 9. External Provider Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PostgreSQL | CODE READY · CONFIGURATION REQUIRED | `DATABASE_URL`; migrations via `prisma migrate deploy`. |
| Redis | CODE READY · CONFIGURATION REQUIRED | `REDIS_URL`; operational state only (ADR-0003). |
| Object storage (S3-compatible) | CODE READY · CONFIGURATION REQUIRED | `STORAGE_DRIVER=s3` and bucket credentials; `local` is refused in deployed environments. |
| Sentry | CODE READY · CONFIGURATION REQUIRED | `SENTRY_DSN` (optional). |
| Admin MFA key | CODE READY · CONFIGURATION REQUIRED | `MFA_ENCRYPTION_KEY` secret. |
| Payment provider | PROVIDER SELECTION REQUIRED | `PaymentProvider` port; sandbox only. |
| Payout provider | PROVIDER SELECTION REQUIRED | `PayoutProvider` port; sandbox only; destination accounts not specified. |
| SMS / email (verification and notifications) | PROVIDER SELECTION REQUIRED | `VerificationSender` / `NotificationSender` ports; `log` adapter only. |
| Push notifications | PROVIDER SELECTION REQUIRED | Device tokens stored; push delivered through the notification sender port. |
| Maps (geocoding, routing, ETA) | PROVIDER SELECTION REQUIRED | No `MapsService` yet (§3). `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` exists only for client maps. |

Staging and production refuse to start with any sandbox or log adapter, so a missing provider
cannot silently fake success.

## 10. Test Results

Commands are the repository's own (`package.json` / `backend/package.json`), run against real
PostgreSQL 16 and Redis. Results after the fixes:

| Check | Command | Result |
|-------|---------|--------|
| Format | `pnpm format:check` | clean |
| Doc links | `pnpm docs:check` | OK |
| Lint | `pnpm lint` (packages, backend, 4 apps) | 12/12 tasks |
| Typecheck | `pnpm typecheck` | 12/12 tasks |
| Unit + API + app tests | `pnpm test` | 11/11 tasks; backend unit 63, API 12, each app 1 |
| Integration | `pnpm --filter @quickbite/backend test:integration` | **185 passed, 20 suites** |
| E2E (golden flow) | `pnpm --filter @quickbite/backend test:e2e` | 1 passed |
| Build | `pnpm build` | 9/9 tasks |
| Prisma | `prisma validate`; fresh database `migrate deploy` + `migrate diff` | valid; no drift |

New or changed tests:
* `customer-api-contract.int-spec.ts` (new).
* The settlement redelivery regression in `finance.int-spec.ts` (failed before the fix).

Baseline before the fixes was also fully green. The existing suites did not cover the §5.1 and
§6.2 defects.

## 11. Customer Frontend Readiness

**Backend/API: READY.** Every customer endpoint exists. The new contract test proves that the
shared schemas and the typed client parse the live responses.

**App foundation (`apps/customer`): READY for Batch 01.** In place:
* Expo SDK 57 with Expo Router (`src/app`);
* `AppProviders` with SafeArea and a TanStack Query client whose retry policy uses
  `shouldRetryQuery`;
* the typed `ApiClient` (`src/lib/api.ts`) and `EXPO_PUBLIC_API_URL` configuration;
* Zustand, React Hook Form and Zod with the shared validation and types;
* jest-expo and React Native Testing Library.

Lint, typecheck, test and build all pass.

Prerequisites belonging to **Batch 01 (Authentication Foundation)** — not gaps in the foundation:
1. **Stitch designs.** `design/stitch/` contains only its README. The four Batch 01 designs
   (Splash, Welcome, Login, Create Account) must be added before implementation (CLAUDE.md §22).
2. **Secure token storage.** `src/lib/api.ts` does not yet provide `getAccessToken`. Mobile token
   storage must use secure device storage (`api-client/src/auth.ts`), and refreshes must be
   serialized, because refresh tokens are single-use. `expo-secure-store` (Expo first-party) is
   the natural choice, but it is not in the frozen `TECHNOLOGY_STACK.md`. Approve it (or another
   option) at the start of Batch 01.
3. **Realtime client.** Order tracking will need `socket.io-client` (Socket.IO 4.8 is in the
   frozen stack). It belongs to the tracking batch, not Batch 01.

## 12. Recommended Next Step

Start **Customer App Batch 01 — Authentication Foundation** (`apps/customer/SCREEN_PLAN.md` §5):

1. Add the four Stitch exports under `apps/customer/design/stitch/`.
2. Approve the secure-storage dependency.
3. Implement a session module in `apps/customer/src/lib/`:
   * a secure token store;
   * `getAccessToken` wired into `apiClient`;
   * one-at-a-time refresh via `createAuthApi(apiClient).refresh`.
4. Implement Splash, Welcome, Login and Create Account against `createAuthApi`.
5. Run lint, typecheck, test and build, then stop for review.

In parallel, the owner should choose the payment, SMS/email and maps providers. These are the only
blockers for staging.

---

## Appendix — API inventory

Generated from the controllers (health routes omitted). **Access:**
* roles are checked from the database on every request;
* the "staff tenant" and "owner-only tenant" labels mean the restaurant is resolved from the
  caller's active membership, never from client input;
* "step-up MFA" means a TOTP verification within `MFA_RECENT_AUTH_WINDOW_SECONDS`;
* every admin route also requires an MFA-verified session.

Ownership for customer and rider resources is enforced in the owning service: foreign resources
return 404. Request/response schemas are the `@quickbite/validation` schemas named in
`API_IMPLEMENTATION_NOTES.md`. Errors use the API_SPEC §13 catalogue.

| Method | Route | Access | Idempotency-Key | Source |
|--------|-------|--------|-----------------|--------|
| `GET` | `/api/v1/admin/restaurants` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/restaurants/{restaurantId}` | ADMIN, SUPER_ADMIN |  | spec |
| `PATCH` | `/api/v1/admin/restaurants/{restaurantId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/restaurants/{restaurantId}/approve` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/restaurants/{restaurantId}/reject` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/restaurants/{restaurantId}/request-resubmission` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/dashboard` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/customers` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/customers/{customerId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/customers/{customerId}/restrict` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/customers/{customerId}/restore` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/orders` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/orders/{orderId}` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/audit-logs` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/audit-logs/{auditLogId}` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/configuration` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/configuration/{key}` | ADMIN, SUPER_ADMIN |  | spec |
| `PATCH` | `/api/v1/admin/configuration/{key}` | SUPER_ADMIN step-up MFA |  | spec |
| `POST` | `/api/v1/auth/register` | Public |  | spec |
| `POST` | `/api/v1/auth/login` | Public |  | spec |
| `POST` | `/api/v1/auth/refresh` | Public |  | spec |
| `POST` | `/api/v1/auth/logout` | authenticated |  | spec |
| `POST` | `/api/v1/auth/verify-phone` | authenticated |  | spec |
| `POST` | `/api/v1/auth/verify-phone/resend` | authenticated |  | spec |
| `POST` | `/api/v1/auth/verify-email` | Public |  | spec |
| `POST` | `/api/v1/auth/forgot-password` | Public |  | spec |
| `POST` | `/api/v1/auth/reset-password` | Public |  | spec |
| `GET` | `/api/v1/auth/mfa` | ADMIN, SUPER_ADMIN pre-MFA |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/auth/mfa/totp/setup` | ADMIN, SUPER_ADMIN pre-MFA |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/auth/mfa/totp/confirm` | ADMIN, SUPER_ADMIN pre-MFA |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/auth/mfa/verify` | ADMIN, SUPER_ADMIN pre-MFA |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/admin/users/{userId}/mfa/reset` | SUPER_ADMIN step-up MFA |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/restaurant/auth/register` | Public |  | spec |
| `POST` | `/api/v1/rider/auth/register` | Public |  | spec |
| `POST` | `/api/v1/orders/{orderId}/cancel` | CUSTOMER |  | spec |
| `POST` | `/api/v1/restaurant/orders/{orderId}/reject` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/orders/{orderId}/cancel` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/admin/orders/{orderId}/cancel` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/cart` | CUSTOMER |  | spec |
| `POST` | `/api/v1/cart/items` | CUSTOMER |  | spec |
| `PATCH` | `/api/v1/cart/items/{cartItemId}` | CUSTOMER |  | spec |
| `DELETE` | `/api/v1/cart/items/{cartItemId}` | CUSTOMER |  | spec |
| `DELETE` | `/api/v1/cart` | CUSTOMER |  | spec |
| `POST` | `/api/v1/cart/recalculate` | CUSTOMER |  | spec |
| `POST` | `/api/v1/checkout/preview` | CUSTOMER |  | spec |
| `POST` | `/api/v1/orders` | CUSTOMER | yes | spec |
| `GET` | `/api/v1/customer/profile` | CUSTOMER |  | spec |
| `PATCH` | `/api/v1/customer/profile` | CUSTOMER |  | spec |
| `GET` | `/api/v1/customer/addresses` | CUSTOMER |  | spec |
| `POST` | `/api/v1/customer/addresses` | CUSTOMER |  | spec |
| `PATCH` | `/api/v1/customer/addresses/{addressId}` | CUSTOMER |  | spec |
| `DELETE` | `/api/v1/customer/addresses/{addressId}` | CUSTOMER |  | spec |
| `POST` | `/api/v1/customer/addresses/{addressId}/default` | CUSTOMER |  | spec |
| `GET` | `/api/v1/rider/delivery/current` | RIDER |  | spec |
| `GET` | `/api/v1/rider/deliveries` | RIDER |  | spec |
| `POST` | `/api/v1/rider/deliveries/{deliveryId}/arriving` | RIDER |  | spec |
| `POST` | `/api/v1/rider/deliveries/{deliveryId}/pickup` | RIDER |  | spec |
| `POST` | `/api/v1/rider/deliveries/{deliveryId}/out-for-delivery` | RIDER |  | spec |
| `POST` | `/api/v1/rider/deliveries/{deliveryId}/complete` | RIDER |  | spec |
| `GET` | `/api/v1/deliveries/{deliveryId}` | authenticated |  | spec |
| `GET` | `/api/v1/restaurants` | Public |  | spec |
| `GET` | `/api/v1/restaurants/{restaurantId}` | Public |  | spec |
| `GET` | `/api/v1/restaurants/{restaurantId}/menu` | Public |  | spec |
| `GET` | `/api/v1/search` | Public |  | spec |
| `GET` | `/api/v1/rider/delivery-offers` | RIDER |  | spec |
| `GET` | `/api/v1/rider/delivery-offers/{offerId}` | RIDER |  | spec |
| `POST` | `/api/v1/rider/delivery-offers/{offerId}/accept` | RIDER |  | spec |
| `POST` | `/api/v1/rider/delivery-offers/{offerId}/reject` | RIDER |  | spec |
| `GET` | `/api/v1/admin/dispatch-settings` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `PUT` | `/api/v1/admin/dispatch-settings` | SUPER_ADMIN step-up MFA |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/restaurant/earnings` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/earnings/transactions` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/earnings/fees` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/earnings/{earningId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/rider/earnings` | RIDER |  | spec |
| `GET` | `/api/v1/rider/earnings/transactions` | RIDER |  | spec |
| `GET` | `/api/v1/rider/earnings/{earningId}` | RIDER |  | spec |
| `GET` | `/api/v1/restaurant/menu/categories` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/menu/categories` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/menu/categories/{categoryId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `DELETE` | `/api/v1/restaurant/menu/categories/{categoryId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/menu/items` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/menu/items` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/menu/items/{itemId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/menu/items/{itemId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `DELETE` | `/api/v1/restaurant/menu/items/{itemId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `POST` | `/api/v1/restaurant/menu/items/{itemId}/availability` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `GET` | `/api/v1/restaurant/menu/items/{itemId}/variations` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/menu/items/{itemId}/variations` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/menu/variations/{variationId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `DELETE` | `/api/v1/restaurant/menu/variations/{variationId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/menu/items/{itemId}/add-ons` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/menu/items/{itemId}/add-ons` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/menu/add-ons/{addOnId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `DELETE` | `/api/v1/restaurant/menu/add-ons/{addOnId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/notifications` | authenticated |  | spec |
| `GET` | `/api/v1/notifications/preferences` | authenticated |  | spec |
| `PATCH` | `/api/v1/notifications/preferences` | authenticated |  | spec |
| `POST` | `/api/v1/notifications/read-all` | authenticated |  | spec |
| `PUT` | `/api/v1/notifications/devices` | authenticated |  | outside API_SPEC (documented in implementation notes) |
| `DELETE` | `/api/v1/notifications/devices/{deviceId}` | authenticated |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/notifications/{notificationId}` | authenticated |  | spec |
| `POST` | `/api/v1/notifications/{notificationId}/read` | authenticated |  | spec |
| `GET` | `/api/v1/orders/{orderId}` | authenticated |  | spec |
| `GET` | `/api/v1/orders/{orderId}/status` | authenticated |  | spec |
| `GET` | `/api/v1/customer/orders` | CUSTOMER |  | spec |
| `GET` | `/api/v1/restaurant/analytics/overview` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/analytics/sales` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/analytics/orders` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/analytics/popular-items` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/analytics/ratings` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/analytics/cancellations` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/orders/new` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `GET` | `/api/v1/restaurant/orders` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `GET` | `/api/v1/restaurant/orders/{orderId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/orders/{orderId}/accept` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/orders/{orderId}/preparing` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/orders/{orderId}/ready` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `GET` | `/api/v1/payment-methods` | CUSTOMER |  | spec |
| `POST` | `/api/v1/payments` | CUSTOMER | yes | spec |
| `GET` | `/api/v1/payments/{paymentId}` | authenticated |  | spec |
| `POST` | `/api/v1/payments/{paymentId}/confirm` | authenticated |  | spec |
| `POST` | `/api/v1/payments/{paymentId}/refund` | ADMIN, SUPER_ADMIN step-up MFA | yes | spec |
| `POST` | `/api/v1/webhooks/payments/{provider}` | Public |  | spec |
| `GET` | `/api/v1/admin/payments` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/payments/{paymentId}` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/refunds` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/refunds/{refundId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/orders/{orderId}/refund-decision` | ADMIN, SUPER_ADMIN step-up MFA | yes | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/sandbox/payments/{providerPaymentId}/outcome` | Public |  | dev/test only |
| `POST` | `/api/v1/sandbox/payouts/{providerReference}/outcome` | Public |  | dev/test only |
| `GET` | `/api/v1/restaurant/promotions` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `POST` | `/api/v1/restaurant/promotions` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/promotions/{promotionId}` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/promotions/{promotionId}` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `POST` | `/api/v1/restaurant/promotions/{promotionId}/disable` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `GET` | `/api/v1/admin/promotions` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/promotions/{promotionId}` | ADMIN, SUPER_ADMIN |  | spec |
| `PATCH` | `/api/v1/admin/promotions/{promotionId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/promotions/{promotionId}/disable` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/promotions/validate` | CUSTOMER |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/restaurants/{restaurantId}/promotions` | Public |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/restaurant/staff` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `POST` | `/api/v1/restaurant/staff` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/staff/{staffId}` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/staff/{staffId}` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `DELETE` | `/api/v1/restaurant/staff/{staffId}` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `POST` | `/api/v1/restaurant/onboarding` | RESTAURANT_OWNER |  | spec |
| `GET` | `/api/v1/restaurant/onboarding` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/application` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/onboarding/basic-information` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/onboarding/address` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/onboarding/location` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/onboarding/operating-hours` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/onboarding/delivery` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/onboarding/business` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/onboarding/payment` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `POST` | `/api/v1/restaurant/onboarding/submit` | RESTAURANT_OWNER owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/profile` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `PATCH` | `/api/v1/restaurant/profile` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/operating-hours` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `PUT` | `/api/v1/restaurant/operating-hours` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/delivery-settings` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/restaurant/availability` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/availability/online` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/availability/offline` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/availability/pause` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `GET` | `/api/v1/orders/{orderId}/review-eligibility` | CUSTOMER |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/orders/{orderId}/review` | CUSTOMER |  | spec |
| `GET` | `/api/v1/orders/{orderId}/review` | CUSTOMER |  | spec |
| `PATCH` | `/api/v1/reviews/{reviewId}` | CUSTOMER |  | outside API_SPEC (documented in implementation notes) |
| `DELETE` | `/api/v1/reviews/{reviewId}` | CUSTOMER |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/reviews/{reviewId}/report` | CUSTOMER |  | spec |
| `GET` | `/api/v1/restaurants/{restaurantId}/reviews` | Public |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/restaurants/{restaurantId}/rating-summary` | Public |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/restaurant/reviews` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `GET` | `/api/v1/restaurant/reviews/{reviewId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/reviews/{reviewId}/reply` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `POST` | `/api/v1/restaurant/reviews/{reviewId}/report` | RESTAURANT_OWNER, RESTAURANT_OPERATOR staff tenant |  | spec |
| `GET` | `/api/v1/admin/reviews` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/reviews/{reviewId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/reviews/{reviewId}/hide` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/reviews/{reviewId}/restore` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/reviews/{reviewId}/remove` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/admin/review-reports` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/admin/review-reports/{reportId}/resolve` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/rider/profile` | RIDER |  | spec |
| `PATCH` | `/api/v1/rider/profile` | RIDER |  | spec |
| `GET` | `/api/v1/rider/onboarding` | RIDER |  | spec |
| `PATCH` | `/api/v1/rider/onboarding` | RIDER |  | spec |
| `POST` | `/api/v1/rider/onboarding/submit` | RIDER |  | spec |
| `GET` | `/api/v1/rider/documents` | RIDER |  | spec |
| `DELETE` | `/api/v1/rider/documents/{documentId}` | RIDER |  | spec |
| `GET` | `/api/v1/rider/availability` | RIDER |  | spec |
| `POST` | `/api/v1/rider/availability/online` | RIDER |  | spec |
| `POST` | `/api/v1/rider/availability/offline` | RIDER |  | spec |
| `POST` | `/api/v1/rider/availability` | RIDER |  | spec |
| `POST` | `/api/v1/rider/location` | RIDER |  | spec |
| `GET` | `/api/v1/admin/riders` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/riders/{riderId}` | ADMIN, SUPER_ADMIN |  | spec |
| `PATCH` | `/api/v1/admin/riders/{riderId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/riders/{riderId}/approve` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/riders/{riderId}/reject` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/riders/{riderId}/suspend` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/riders/{riderId}/restore` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/risk/events` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/risk/events` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/admin/risk/rules` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/risk/rules` | ADMIN, SUPER_ADMIN step-up MFA |  | spec |
| `PATCH` | `/api/v1/admin/risk/rules/{ruleId}` | ADMIN, SUPER_ADMIN step-up MFA |  | spec |
| `GET` | `/api/v1/admin/risk/flags` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/risk/flags/{flagId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/risk/flags/{flagId}/resolve` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/risk/flags/{flagId}/dismiss` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/risk/restrictions` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/risk/restrictions` | ADMIN, SUPER_ADMIN |  | spec |
| `PATCH` | `/api/v1/admin/risk/restrictions/{restrictionId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/risk/restrictions/{restrictionId}/remove` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/restaurant/settlements` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/settlements/{settlementId}` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/payouts` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/restaurant/invoices` | RESTAURANT_OWNER, RESTAURANT_OPERATOR owner-only tenant |  | spec |
| `GET` | `/api/v1/rider/settlements` | RIDER |  | spec |
| `GET` | `/api/v1/rider/settlements/{settlementId}` | RIDER |  | spec |
| `GET` | `/api/v1/rider/payouts` | RIDER |  | spec |
| `GET` | `/api/v1/admin/settlements` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/settlements/{settlementId}` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/settlements/{settlementId}/approve` | SUPER_ADMIN step-up MFA |  | spec |
| `POST` | `/api/v1/admin/settlements/{settlementId}/process` | SUPER_ADMIN step-up MFA | yes | spec |
| `GET` | `/api/v1/admin/financial-adjustments` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/admin/financial-adjustments` | SUPER_ADMIN step-up MFA | yes | outside API_SPEC (documented in implementation notes) |
| `GET` | `/api/v1/admin/finance/reconciliation` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/support/tickets` | CUSTOMER, RESTAURANT_OWNER, RESTAURANT_OPERATOR, RIDER |  | spec |
| `GET` | `/api/v1/support/tickets` | CUSTOMER, RESTAURANT_OWNER, RESTAURANT_OPERATOR, RIDER |  | spec |
| `GET` | `/api/v1/support/tickets/{ticketId}` | CUSTOMER, RESTAURANT_OWNER, RESTAURANT_OPERATOR, RIDER |  | spec |
| `POST` | `/api/v1/support/tickets/{ticketId}/close` | CUSTOMER, RESTAURANT_OWNER, RESTAURANT_OPERATOR, RIDER |  | spec |
| `GET` | `/api/v1/admin/support/tickets` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/admin/support/tickets/{ticketId}` | ADMIN, SUPER_ADMIN |  | spec |
| `PATCH` | `/api/v1/admin/support/tickets/{ticketId}` | ADMIN, SUPER_ADMIN |  | outside API_SPEC (documented in implementation notes) |
| `POST` | `/api/v1/admin/support/tickets/{ticketId}/assign` | ADMIN, SUPER_ADMIN |  | spec |
| `POST` | `/api/v1/admin/support/tickets/{ticketId}/resolve` | ADMIN, SUPER_ADMIN |  | spec |
| `GET` | `/api/v1/me` | authenticated |  | spec |
