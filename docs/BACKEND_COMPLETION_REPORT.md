# QuickBite — Backend Completion Report

**Phase:** 20 — Implementation (backend) · **Date:** 2026-09-28 · **Branch:** `claude/charming-newton-8gyd3k`

Endpoint contracts and per-slice notes: [`docs/api/API_IMPLEMENTATION_NOTES.md`](api/API_IMPLEMENTATION_NOTES.md).
Owner decisions: [`docs/decisions/ADR/0014-v1-open-decisions.md`](decisions/ADR/0014-v1-open-decisions.md).

## Completed

All 18 master slices (CLAUDE.md §40) are implemented in the backend: authentication, customer
profile, restaurant onboarding, menu, discovery, cart, checkout, payments, restaurant orders,
dispatch, rider delivery, completion, earnings, settlements, promotions, reviews, support and admin
operations. The golden E2E flow (`docs/flows/GOLDEN_E2E_FLOW.md`) passes end to end through the
HTTP API.

## Database

* PostgreSQL via Prisma: 65 models, 18 versioned migrations, all additive. A fresh database
  migrated from zero matches `schema.prisma` exactly (`prisma migrate diff` is empty).
* Money is `NUMERIC(12,2)` everywhere, with CHECK constraints for totals (order totals, earning
  nets, settlement `net = gross − fees + adjustments`).
* Human-readable numbers come from sequences (`QB-`, `QB-SUP-`, `QB-INV-`).
* Append-only triggers on order status history, settlement items and invoices.
* Partial unique indexes protect single-winner invariants: one active delivery per rider, one live
  payout per settlement, one settlement per source record.
* Every gap fill is recorded in `DATABASE.md` §5.4.

## APIs

* 247 routes under `/api/v1`, all with Zod validation and the standard envelopes and error codes
  (API_SPEC §8–13, with new code groups documented in §13).
* Shared Zod schemas live in `@quickbite/validation` and typed clients in `@quickbite/api-client`.
* The `Idempotency-Key` header is required for orders, payments, refunds, settlement processing and
  adjustments.

## Authentication

* Registration, login, rotating refresh tokens with reuse detection, logout, phone/email
  verification and password reset.
* Sessions are re-validated on every request and every 30 s on sockets.
* Rate limits are stored in Redis.
* Admins must use TOTP MFA:
  * Secrets are encrypted with AES-256-GCM.
  * Each code works once.
  * Sensitive actions need a fresh MFA check (step-up).

## Authorization

* Frozen roles only.
* The authorization chain runs server-side: role → MFA → tenant/ownership → business rule.
* Restaurant tenant isolation comes from `restaurant_staff`. Financial routes are owner-only.
* Riders see only their own records. Other users' resources return 404, so they cannot be
  enumerated.
* SUPER_ADMIN is required for moving money and for sensitive configuration.

## Orders

* The frozen lifecycle is enforced by a compare-and-set state machine that writes status history
  and outbox events.
* Checkout recalculates totals authoritatively and snapshots them.
* Cancellation rules follow ADR-0014 §12. Admin cancellation is audited.

## Payments

* COD: collected when the rider completes the delivery.
* Online payments go through a provider port with signed-webhook verification and amount checks.
* Refunds are capped at the paid amount. The admin decides every refund (full, partial or none,
  ADR-0014 §9).
* Only the sandbox adapter exists, and staging/production refuse to start with it.

## Dispatch

* Riders are filtered for eligibility: online, available, approved, no active delivery, fresh
  location, not risk-blocked.
* Offers go out within an expanding radius (Redis GEO), with timeouts and a maximum number of
  attempts. There is no broadcast.
* Assignment is atomic.
* Dispatch settings are admin-managed.

## Risk

* Signals, configurable rules, flags and restrictions (COD, order, account, additional
  verification) are enforced at checkout and in dispatch.
* There are no permanent bans. Admin overrides are audited.

## Notifications

* Outbox → notifications (in-app, push, email, SMS) with templates, user preferences, dedup keys,
  retries with backoff, and delivery through an adapter.
* The realtime Socket.IO envelope follows ADR-0014 §7, with per-channel sequences and server-side
  channel authorization.

## Financial

* Earnings are created from delivery completion, with commission and rate snapshots.
* Settlements are generated per recipient per business-timezone period. Admins approve after a
  reconciliation check, then process.
* Payouts go through a provider port. Answers are verified; timeouts are retried and never
  guessed. A failed payout is retried with a new attempt.
* Invoices are issued when a payout completes.
* Explicit signed adjustments are supported.
* Cross-layer reconciliation runs as an hourly alert and as an admin report.

## Restaurant analytics

* Overview, daily sales, orders by status, popular items, ratings and cancellations (API_SPEC §61),
  owner-only, over orders released to the restaurant.

## Admin

* Dashboard and customer/order views; customer restrict/restore through risk restrictions.
* Configuration: validated, audited, step-up protected.
* Dispatch settings.
* Audit-log viewer.
* Restaurant and rider approvals.
* Risk, promotions, reviews moderation, support queue, refunds and settlements.

## Testing

| Suite | Result |
|-------|--------|
| Unit (backend) | 63 passed |
| API (Supertest, no services) | 12 passed |
| Integration (real PostgreSQL + Redis, 19 suites) | 184 passed |
| E2E — golden flow through the HTTP API (`test:e2e`) | passed (included in integration) |
| Lint / typecheck (packages + backend) | clean |
| Build (packages, backend, 4 apps) | 24/24 tasks successful |
| `prisma validate` / fresh-DB migration check | valid / no drift |

For key safeguards, a deliberately broken version was confirmed to make the tests fail. This was
done for tenant scoping, cart lock, compare-and-set, amount verification, refund cap, dispatch
eligibility, settlement reconciliation and admin MFA.

## Remaining Work

* **Real providers.** Payment, payout, SMS/email/push providers are not selected yet. The adapter
  ports exist; the sandbox/log adapters are refused in staging and production.
* **Deployment pipelines.** Staging and production pipelines are not built yet.
* **Frontend screens.** Screens for all four apps are still to be built (CLAUDE.md §23 batches).
* **Tooling race.** When turbo runs `lint`/`typecheck`/`test` in parallel, each runs
  `prisma generate` and they can race. This causes an occasional transient failure; a rerun
  passes.

## Known Ambiguities (need owner decisions)

Each item below is implemented conservatively or left out, and each is documented in the
implementation notes.

1. **Refund allocation.** How refunds are split between restaurant, rider and platform is not
   defined. Admins use financial adjustments for now.
2. **COD cash remittance.** How riders hand over the cash they collect is not defined.
3. **Payout destinations.** How restaurant and rider bank accounts are managed is not defined.
4. **Settlement frequency.** This is a setting that must be configured; if it is unset, no
   settlements are generated. When a recipient's net is ≤ 0, the records carry forward.
5. **Invoices and rates.** Invoice PDF rendering and effective-dated commission rates are not
   implemented.
6. **Customer edits.** `PATCH /admin/customers/{id}` has no defined editable fields. Restrict and
   restore are implemented through `ACCOUNT_RESTRICTED` risk restrictions (ADMIN_SPEC §7).
7. **Support.** SLA targets, escalation and a reopen window are not defined. The support status
   vocabulary follows SUPPORT_RULES rather than DATABASE §57.
8. **Reviews.** Moderation of restaurant responses to reviews is not defined.
9. **Rider assignment.** Manual admin rider assignment and reassignment are not defined.
10. **Unpaid orders.** Unpaid online orders do not expire automatically.
11. **Rider location history.** There is no rider location history table.
12. **Admin hardening.** WebAuthn, IP/device controls and shorter admin sessions are not
    implemented.

## Frontend Readiness

| App | Backend readiness |
|-----|-------------------|
| Customer | **Ready.** Covers auth, profile, addresses, discovery, menu, cart, checkout preview, orders, COD and sandbox online payment, live tracking, cancellation, reviews, support and notifications. |
| Restaurant | **Ready.** Covers onboarding, staff, availability and hours, menu, the order queue and actions, promotions, review replies, owner earnings/settlements/payouts/invoices and support. |
| Rider | **Ready.** Covers onboarding and documents, online/location, offers, the delivery steps with COD confirmation, earnings, settlements, payouts and support. |
| Admin | **Ready.** Covers MFA enrolment and step-up, dashboard, approvals, customers and orders, cancellation and refunds, risk, promotions, reviews, support, settlements and adjustments, reconciliation, configuration, dispatch settings and audit logs. |
