# QuickBite — Repository Consistency Report

**File:** `docs/REPOSITORY_CONSISTENCY_REPORT.md`
**Phase:** 20 — Implementation (repository foundation)
**Date:** 2026-09-27
**Scope:** entire repository — `CLAUDE.md`, all documents under `docs/`, `apps/*/SCREEN_PLAN.md`, and the new foundation code.

This report lists every inconsistency, gap and open question found while preparing the repository for implementation. Nothing is hidden. Items that were **fixed** in this task are listed separately from items that remain **open**.

Severity (aligned with `docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §49):

| Severity | Meaning |
|----------|---------|
| **CRITICAL** | Blocks the **next** implementation step (Slice 1 — Authentication). Must be resolved first. |
| **HIGH** | Must be resolved before the affected slice/batch starts. |
| **MEDIUM** | Should be scheduled; does not block current work. |
| **LOW** | Minor documentation/implementation clarification. |

Resolution rule for every open item: identify → affected documents → propose → **owner approval** → update specifications (and ADR where required) → implement. No open item has been resolved by inventing behavior in code.

---

# 1. Fixed in This Task

| # | Type | Finding | Resolution |
|---|------|---------|------------|
| F1 | Duplicate documents | `docs/OBSERVABILITY/OBSERVABILITY_RULES.md` and `docs/OBSERVABILITY/OBSERVABILITY_SPEC.md` were byte-identical copies of `docs/observability/*`. | Removed `docs/OBSERVABILITY/`. Canonical: `docs/observability/`. | <!-- docs-check:ignore -->
| F2 | Inconsistent path | `docs/notification/NOTIFICATION_RULES.md` (singular folder) while 14 references use `docs/notifications/`. | Moved to `docs/notifications/NOTIFICATION_RULES.md`. | <!-- docs-check:ignore -->
| F3 | Inconsistent file name | `docs/notification/Realtime Specification.md` (spaces; wrong folder). Its own header declares `docs/notifications/REALTIME_SPEC.md`; 13 references use that path. | Renamed to `docs/notifications/REALTIME_SPEC.md`. |
| F4 | Inconsistent file name | `docs/payments/Payment Rules Specification.md`. Its header declares `docs/payments/PAYMENT_RULES.md`; 12 references use that path. | Renamed to `docs/payments/PAYMENT_RULES.md`. |
| F5 | Broken reference | `docs/CLAUDE.md` referenced in `DEPLOYMENT_SPEC.md` §75, `OBSERVABILITY_SPEC.md` §63, `TESTING_SPEC.md` §74. The file lives at the repository root. | References changed to `CLAUDE.md`. | <!-- docs-check:ignore -->
| F6 | Missing content | `docs/flows/GOLDEN_E2E_FLOW.md` contained only a heading, while referenced 11 times as authoritative. | Populated with the approved flow, mapped to existing API_SPEC §143 endpoints. No new behavior. |
| F7 | Missing files | `apps/customer/README.md` referenced by `CLAUDE.md` §43 but absent; `apps/*/README.md`, `apps/rider/SCREEN_PLAN.md`, `apps/admin/SCREEN_PLAN.md`, `apps/*/design/stitch/` absent although required by `CLAUDE.md` §21. | Created. |
| F8 | Missing files | `docs/decisions/ADR/` was empty although `ARCHITECTURE.md` §68 expects ADRs. | ADR-0001…0013 record frozen decisions (see §6 note). |
| F9 | Placeholder README | Root `README.md` contained only a title. | Rewritten. |

After these fixes, `pnpm docs:check` (`scripts/check-doc-links.mjs`) reports **no broken repository-path references** in Markdown. The only unresolved path is `docs/decisions/ADR/XXXX-location-storage.md` in `MAPS_LOCATION_SPEC.md` §77, which is an explicit illustrative placeholder, not a broken link.

No substantive business rule was changed by these fixes.

---

# 2. CRITICAL — Resolved in Slice 1

### C1. Authentication storage — RESOLVED

Approved by the project owner. `DATABASE.md` §5.1–5.3 now defines `user_sessions`, `refresh_tokens` and `verification_challenges` (hashed secrets, rotation and reuse rules), identity column types, and the account-activation rule. Implemented in migration `backend/prisma/migrations/20260927204038_slice1_authentication`.

### C2. Verification-code delivery — RESOLVED (interim)

Approved by the project owner: delivery goes through the `VerificationSender` interface; the only adapter is a development/test-only log adapter, which configuration refuses in staging/production. **A real SMS and email provider is still required before any deployed environment can register users** (tracked as H8).

### Owner decision recorded — account activation

A customer account moves from `PENDING_VERIFICATION` to `ACTIVE` on **phone verification**; email verification is recorded but does not change status (`DATABASE.md` §5.3).

---

# 3. HIGH — Resolve Before the Affected Slice

### H1. Realtime event naming and envelope conflict (before Slice 7/9 realtime work)

| Source | Event name style | Envelope |
|--------|------------------|----------|
| `API_SPEC.md` §111–114 | lower-case dotted: `order.created`, `order.rider_assigned`, `delivery.offer_created` | `{ "event": "order.status_changed", "data": {...} }` |
| `REALTIME_SPEC.md` §15, §62 | upper snake: `ORDER_CREATED`, `ORDER_STATUS_CHANGED` | `{ "event_id", "event_type", "version", "timestamp", "resource_type", "resource_id", "channel", "sequence", "data" }` |
| `OBSERVABILITY_SPEC.md` §8 | lower-case dotted business events | — |

`API_SPEC.md` §111 also lists both per-state events (`order.preparing`, …) and a generic `order.status_changed` example. The envelope uses snake_case keys while the REST API uses camelCase (`requestId`, `nextCursor`).
**Needed decision:** one realtime event naming convention, one envelope field casing, and whether order status changes are one generic event or per-state events. Update `API_SPEC.md` and `REALTIME_SPEC.md` together.

### H2. Cart storage undefined (before Slice 6)

`API_SPEC.md` §32–36 defines a server-side cart (`GET /cart`, `POST /cart/items`, …) and `ORDER_RULES.md` §4 defines cart rules, but `DATABASE.md` has **no cart tables**. Decide whether the cart is persisted in PostgreSQL (tables to be added) or held as operational state in Redis (with its expiry/recovery rules), and document it.

### H3. Delivery exception / failed-delivery workflow unspecified (before Slice 11)

* `PRD.md` §3 lists "Handle delivery exceptions" for riders.
* `DISPATCH_RULES.md` §25–26 and §35 refer to a "delivery exception/reassignment workflow" and an "operational exception workflow".
* `RISK_RULES.md` §36 uses the `MULTIPLE_FAILED_DELIVERIES` signal.
* No delivery-exception states, no failed-delivery outcome in the frozen order lifecycle, and no endpoints exist.

**Needed decision:** specify the exception outcomes (e.g. customer unreachable, rider cannot continue), how they map to order/delivery/payment/cancellation state (without introducing an unapproved order state), and the API. Tracked as "not scheduled" in `apps/rider/SCREEN_PLAN.md` §16.

### H4. Push device registration and notification preferences not in the database/API (before first notification work — Slice 3)

* `NOTIFICATION_RULES.md` §20 requires stored device tokens (`user_id, device_id, platform, push_token, last_seen_at, active`), but `DATABASE.md` has no device-token table and `API_SPEC.md` has no device registration endpoint.
* `API_SPEC.md` §91 defines `GET/PATCH /api/v1/notifications/preferences`, but `DATABASE.md` has no preferences table.

### H5. Launch market, currency, timezone and phone format (before Slice 1 phone handling; required by Slice 7/8)

* V1 is single-market / single-currency (`API_SPEC.md` §123), but the market is never named. Examples use `PKR`, `+92` phone numbers and Lahore coordinates.
* Needed for: currency on every financial record, phone-number validation/normalization, business-timezone display and promotion time windows (`PROMOTION_RULES.md` §51), tax handling (`FINANCIAL_SPEC.md` §62).
* Until decided, Slice 1 can validate phone numbers in generic E.164 form only.

### H6. Online payment provider not selected (before Slice 8)

`PAYMENT_RULES.md` and ADR-0008 are provider-agnostic. Webhook verification, payment-intent flow, refunds and payout mechanics depend on the provider. Required before Slice 8 (and payouts in Slice 14).

### H7. Admin security and permission model gaps (before Admin Batch 01 / Slice 18)

* MFA and step-up are required for admins (`API_SPEC.md` §93, `ADMIN_RULES.md` §29–30), but no MFA enrolment/verification endpoints and no MFA secret storage are defined.
* Admin permission management (`ADMIN_SPEC.md` §27, `ADMIN_RULES.md` §6) has no permissions table and no endpoints.
* Configuration change history (`ADMIN_SPEC.md` §26) has no table.
* Admin user management (`ADMIN_SPEC.md` §28), reports (§32–33) and data export (§38) have no endpoints.
* Admin dispatch inspection/intervention (`ADMIN_RULES.md` §15) has no endpoints.

These screens are listed in `apps/admin/SCREEN_PLAN.md` with explicit **Dependency** lines.

---

### H8. SMS/email providers (before the first staging deployment)

Staging/production refuse to start with the development verification adapter (`VERIFICATION_DELIVERY=log`). Select providers and implement `VerificationSender` adapters behind `NotificationService` (`NOTIFICATION_RULES.md`).

### H9. Slice 1 specification gaps (found while implementing authentication)

| # | Gap | Current behavior | Needed |
|---|-----|------------------|--------|
| a | No endpoint to **resend the email verification** link (API_SPEC §21 covers phone only). | Email token sent once at registration (valid 24 h). | Add an endpoint to API_SPEC. |
| b | **Logout all sessions** (AUTH_AUTHORIZATION §29) and **password change** (§30) have no endpoints. | Not implemented. Password reset revokes all sessions. | Add endpoints to API_SPEC (likely with Slice 2 / account settings). |
| c | **Changing email/phone** (AUTH_AUTHORIZATION §125) is unspecified. | Challenges are bound to the contact they were sent to (`target`), so a change would invalidate them. | Specify with Customer Profile (Slice 2). |
| d | **Admin MFA / step-up** (§34–38) — see H7. | Not implemented; no admin endpoints exist yet. | Before Admin Batch 01. |
| e | **Realtime authentication** (§53–54). | Socket.IO gateway still rejects every connection (fail closed). | Implement with the first realtime slice, together with H1. |
| f | **Common/breached password rejection** (§9, "where supported"). | Only min/max length is enforced. | Decide whether to add a local common-password list. |

---

# 4. MEDIUM

### M1. Standard error codes incomplete in `API_SPEC.md` §13 — PARTIALLY RESOLVED

Slice 1 added a **System** group (`RATE_LIMITED`, `INTERNAL_ERROR`) and `AUTH_ACCOUNT_ALREADY_EXISTS`, `AUTH_PASSWORD_POLICY_VIOLATION` to API_SPEC §13. Remaining: a dedicated "not ready" code, and aligning the category lists below. `AUTH_AUTHORIZATION.md` §81 lists different names (`INVALID_CREDENTIALS`, `SESSION_REVOKED`, `MFA_REQUIRED`, …); the implementation uses the **API_SPEC §13** codes, and §81 should be updated to reference them.


`INTERNAL_ERROR` and `RATE_LIMITED` are defined in `ARCHITECTURE.md` §48, `AUTH_AUTHORIZATION.md` §19 and `ARCHITECTURE_CONSISTENCY_REVIEW.md` §30, but are not in `API_SPEC.md` §13. There is also no code for "service not ready" (used by `/health/ready`). The foundation uses `INTERNAL_ERROR` (HTTP 500/503) and `RATE_LIMITED` (HTTP 429) — see `packages/types/src/api.ts` `SYSTEM` group. **Recommendation:** add a "System" group to API_SPEC §13.

`ARCHITECTURE.md` §48 also lists category names (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `BUSINESS_RULE_VIOLATION`) that are not codes in API_SPEC §13; `ARCHITECTURE_CONSISTENCY_REVIEW.md` §30 uses yet another category list. The implementation uses **API_SPEC §13 codes only**.

### M2. Error response shape differs between documents

`ARCHITECTURE.md` §40 shows `{ success, error: { code, message } }`; `API_SPEC.md` §11 adds `details` and `requestId`, and §8 adds `meta`. The more specific API_SPEC is implemented. **Recommendation:** align ARCHITECTURE §40 by reference to API_SPEC.

### M3. Customer screen plan omissions

`apps/customer/SCREEN_PLAN.md` has no explicit screen for **order cancellation** (in V1 scope: `PRD.md` §45 "Cancellation according to rules") and no explicit **location/permission** step, although the PRD customer journey (§5) includes "Location" after verification and `MAPS_LOCATION_RULES.md` §40–43 define customer location-permission UX. Confirm where these belong (e.g. Batch 08 / Batch 12) before those batches start.

### M4. Restaurant screen plan batch sizes and scope wording

* `apps/restaurant/SCREEN_PLAN.md` Batch 06 lists **5** items (Incoming Orders, Order Details, Accept Order, Reject Order, Order Preparation), exceeding the default of 4 (`CLAUDE.md` §23). Some may be actions rather than screens; confirm against the Stitch inventory.
* Batch 07 lists "Order Completion / Handoff". Restaurants do not complete orders — completion is a rider action (`ORDER_RULES.md` §19). Interpreted as the pickup **handoff** view only; confirm wording.

### M5. `DATABASE.md` lists columns without types for most tables

Money (`NUMERIC(12,2)`), timestamps (timezone-aware, UTC) and internal IDs (UUID, `DATABASE.md` §22) are specified. Other types (text lengths, enum representation, JSON columns such as `metadata`/`payload`, latitude/longitude precision) are not. Per `CLAUDE.md` §38 these are small conventional decisions to be made per slice in the Prisma schema; any choice with business impact (e.g. coordinate precision, enum vs lookup table) should be recorded in `DATABASE.md` when introduced.

### M6. Mobile app identity and native build pipeline

Bundle identifiers / Android package names, app display names/icons (from Stitch), signing, and the native build/distribution service (e.g. EAS Build) are not specified. `app.json` intentionally omits identifiers. Needed before the first device/store build.

### M7. Deployment targets not specified

`DEPLOYMENT_SPEC.md` is provider-agnostic (hosting, managed PostgreSQL/Redis, object storage vendor, CDN, secret manager). CI therefore validates only; staging/production pipelines are not implemented. Needed before the first staging deployment.

### M8. Moderate dependency advisories remaining

`pnpm audit --prod` reports 2 moderate advisories after this task's fixes:
* `uuid <11.1.1` via Expo config-plugins → `xcode` (build-time tooling).
* `decode-uri-component <=0.4.2` via `expo-router` → `query-string` (URL decoding DoS).

Both are transitive in Expo packages and cannot be overridden safely without upstream releases. High/critical advisories (`mysql2`, `deepmerge-ts` via the Prisma CLI) were resolved with pnpm overrides. CI blocks on high/critical.

---

# 5. LOW

| # | Finding |
|---|---------|
| L1 | Correlation ID header name is not specified (`OBSERVABILITY_SPEC.md` §6). Foundation uses `X-Correlation-ID` (`packages/types/src/api.ts`). Confirm or specify. |
| L2 | Health endpoints are served at `/health/live` and `/health/ready` outside `/api/v1` (`OBSERVABILITY_SPEC.md` §39 allows adapting routing). |
| L3 | API examples use prefixed IDs (`ord_123`, `req_123`) while `DATABASE.md` §22 specifies UUID internal IDs. Examples are treated as illustrative; APIs will expose UUIDs unless decided otherwise. Request IDs use `req_<uuid>`. |
| L4 | `ARCHITECTURE.md` §39 API examples (`/api/v1/customers`) differ from `API_SPEC.md` paths (`/api/v1/customer/addresses`). API_SPEC is authoritative. |
| L5 | Backend module naming: `ARCHITECTURE.md` §4 lists `delivery/`; the foundation uses `deliveries/` (task instruction) and also includes `restaurant-staff/` and `cancellation/` from ARCHITECTURE §4 plus `discovery/`, `cart/`, `checkout/`, `payouts/` from the task instruction. Ownership of `invoices` is assigned to `settlements` (financial chain) — confirm. See `backend/src/modules/README.md`. |
| L6 | `ARCHITECTURE.md` §3 lists `packages/ui` and `packages/utils`. Neither was created because no cross-app need exists yet (task instruction: create only needed packages). |
| L7 | 27 existing Markdown documents use CRLF line endings while new files use LF. Left unchanged to avoid rewriting specifications; `.editorconfig` does not force line endings for `.md`. |
| L8 | `ARCHITECTURE_CONSISTENCY_REVIEW.md` §47 discourages ADRs that duplicate settled rules. ADR-0001…0013 were created at the owner's explicit request; each states that it only records a frozen decision and defers to its source specification. |
| L9 | No local S3-compatible emulator is pinned in `infrastructure/local/docker-compose.yml` (MinIO community container images are no longer a safe default). Choose a local option when Slice 3 (documents/images) starts. |
| L10 | `CLAUDE.md` §3 does not yet reference `docs/TECHNOLOGY_STACK.md` or `docs/decisions/ADR/`. Consider adding them to the document hierarchy (`CLAUDE.md` was not modified in this task). |
| L11 | `AUTH_AUTHORIZATION.md` §6 lists statuses `ACTIVE, PENDING_VERIFICATION, SUSPENDED, DISABLED`; `DATABASE.md` §4.1 lists `ACTIVE, SUSPENDED, RESTRICTED, DEACTIVATED, PENDING_VERIFICATION`. §6 defers to the database specification, so the database list is implemented (`DISABLED` ≙ `DEACTIVATED` → `AUTH_ACCOUNT_DISABLED`). `RESTRICTED` accounts can log in; restrictions apply in business rules. |
| L12 | Verification-code delivery happens directly after the database commit rather than through the outbox (not yet built). A lost delivery is recoverable by resending. Move delivery onto the outbox when it exists. |

---

# 6. Implementation Gaps (expected at this phase)

These are not inconsistencies; they are the planned remaining work.

* Prisma schema contains only the Slice 1 identity/auth/audit models (one migration).
* Idempotency (`idempotency_keys`) and outbox (`outbox_events`) infrastructure — to be implemented before the first slice that needs them (`IMPLEMENTATION_PLAN.md` §24).
* Authentication, role guard, rate limiting and audit logging are implemented (Slice 1). Ownership/tenant authorization arrives with the first tenant-scoped slice.
* Socket.IO gateway rejects all connections until authentication exists (fail-closed).
* Provider abstractions (`PaymentService`, `MapsService`, `NotificationService`, `StorageService`) — introduced with their first slice.
* Mobile/admin Sentry SDKs — added with the first real screen batch of each app.
* No product screens exist in any app; each app has a clearly marked foundation placeholder route.
* Staging/production deployment pipelines — after M7.

---

# 7. Validation Limitations of This Task

* **Docker:** no Docker daemon was available in the preparation environment. `infrastructure/local/docker-compose.yml` and `infrastructure/docker/backend.Dockerfile` were written but **not executed**. Backend integration tests were instead run against local PostgreSQL 16 and Redis binaries (passed). CI uses PostgreSQL 17 / Redis 7.4 service containers.
* **Expo network checks:** `expo install --check` and two `expo-doctor` checks (config schema, React Native Directory) could not reach Expo's API from the sandbox network. All other `expo-doctor` checks passed (after fixing a duplicate React copy).
* **Playwright:** run locally with a preinstalled Chromium build via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; CI installs the matching browser.

---

# 8. Summary

```text
Fixed:     9  (+ C1, C2 resolved in Slice 1)
CRITICAL:  0
HIGH:      9  (H1–H7, H8 providers, H9 Slice 1 spec gaps)
MEDIUM:    8  (M1 partially resolved)
LOW:       12
```

The architecture itself remains consistent with `ARCHITECTURE_CONSISTENCY_REVIEW.md`: no contradiction to the modular monolith, roles, order lifecycle, dispatch, payments, reviews or promotions was found. The open items are **missing specifications** (mostly data model and API contracts) and **owner decisions** (providers, market, identities), not conflicts in frozen rules.
