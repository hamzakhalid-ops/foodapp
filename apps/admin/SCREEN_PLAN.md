# QUICKBITE ADMIN PANEL — SCREEN IMPLEMENTATION PLAN

## 1. PURPOSE

This document controls frontend screen implementation for the QuickBite Admin Panel (Next.js web application).

Claude Code must use this document together with:

```text
CLAUDE.md
apps/admin/README.md
```

and the relevant product/API/business/security specifications.

The Admin Panel is implemented independently from:

```text
apps/customer
apps/restaurant
apps/rider
```

### Derivation

Screens in this plan are derived only from:

```text
docs/product/PRD.md                       §3 (Admin, Super Admin), §8 (Admin Journey), §45 (Admin scope)
docs/admin/ADMIN_SPEC.md                  §4–38, §66
docs/admin/ADMIN_RULES.md
docs/api/API_SPEC.md                      §83–87 (risk), §93–108 (admin), §114 (admin realtime)
docs/security/AUTH_AUTHORIZATION.md
docs/testing/TESTING_SPEC.md              §57 (Admin Panel critical tests)
```

No screen may be added that these documents do not support. Final screen names must be confirmed against the approved Stitch inventory before each batch starts.

---

# 2. ADMIN ROLE MODEL

The Admin Panel supports only:

```text
ADMIN
SUPER_ADMIN
```

Rules:

* Every action is authorized by the backend. Hiding a section or button is never a security control (ADMIN_SPEC §4).
* Sensitive actions show action, target, consequence, required reason, confirmation, and step-up where applicable (ADMIN_SPEC §66).
* Admin actions go through domain APIs — never direct data manipulation (ADMIN_SPEC §67).
* Every sensitive action is audited by the backend.

---

# 3. DESIGN SOURCE

Visual reference:

```text
apps/admin/design/stitch/
```

Stitch controls appearance (layout, spacing, typography, colors, tables, forms, dialogs, navigation). Specifications control behavior. On conflict: business rule wins, Stitch remains the visual reference, and the conflict is reported.

---

# 4. IMPLEMENTATION RULE

```text
APP → BATCH → IMPLEMENT → VALIDATE → USER REVIEW → APPROVAL → NEXT BATCH
```

Default batch size: **4 screens**. A batch may be smaller when the feature boundary requires it. Claude must stop after each batch.

---

# 5. SCREEN STATUS

```text
TODO
IN_PROGRESS
REVIEW
APPROVED
BLOCKED
```

Only the user/reviewer can mark a screen `APPROVED`. Claude may move `TODO → IN_PROGRESS → REVIEW` or `TODO → BLOCKED`.

A batch whose **Dependency** line names a missing API contract must be moved to `BLOCKED` when it becomes active, until the contract is added to `API_SPEC.md`.

---

# 6. BATCH 01 — ADMIN AUTHENTICATION & SHELL

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 1 | Admin Login | TODO | `POST /api/v1/auth/login` (admin controls per API_SPEC §93) |
| 2 | MFA Verification | TODO | **Dependency:** MFA endpoints not defined in API_SPEC |
| 3 | Admin Shell (permission-aware navigation, session timeout, access denied state) | TODO | `GET /api/v1/me` |

Admin sessions are shorter and monitored (API_SPEC §93, AUTH_AUTHORIZATION).

---

# 7. BATCH 02 — DASHBOARD & CUSTOMERS

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 4 | Dashboard | TODO | `GET /api/v1/admin/dashboard`; realtime per API_SPEC §114 |
| 5 | Customer List | TODO | `GET /api/v1/admin/customers` |
| 6 | Customer Details (restrict / restore) | TODO | `GET/PATCH /api/v1/admin/customers/{customerId}`, `POST .../restrict`, `POST .../restore` |

Dashboard metrics come from backend data only (ADMIN_SPEC §5).

---

# 8. BATCH 03 — RESTAURANTS

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 7 | Restaurant Applications | TODO | `GET /api/v1/admin/restaurants` (filtered to applications) |
| 8 | Restaurant Application Review (approve / reject / request resubmission) | TODO | `POST /api/v1/admin/restaurants/{restaurantId}/approve`, `.../reject`, `.../request-resubmission` |
| 9 | Restaurant List | TODO | `GET /api/v1/admin/restaurants` |
| 10 | Restaurant Details | TODO | `GET/PATCH /api/v1/admin/restaurants/{restaurantId}` |

Restaurant owner and operator remain separate concerns (ADMIN_RULES §10). Suspension follows ADMIN_SPEC §10.

---

# 9. BATCH 04 — RIDERS

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 11 | Rider Applications | TODO | `GET /api/v1/admin/riders` (filtered to applications) |
| 12 | Rider Application Review (approve / reject) | TODO | `POST /api/v1/admin/riders/{riderId}/approve`, `.../reject` |
| 13 | Rider List | TODO | `GET /api/v1/admin/riders` |
| 14 | Rider Details (suspend / restore) | TODO | `GET/PATCH /api/v1/admin/riders/{riderId}`, `POST .../suspend`, `POST .../restore` |

---

# 10. BATCH 05 — ORDERS

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 15 | Order List (filters: status, customer, restaurant, rider, paymentStatus, dates, search) | TODO | `GET /api/v1/admin/orders` |
| 16 | Order Details & Timeline | TODO | `GET /api/v1/admin/orders/{orderId}` |
| 17 | Admin Order Cancellation | TODO | `POST /api/v1/admin/orders/{orderId}/cancel` |

Admin cancellation is validated by the backend Cancellation Rules Engine and is audited (API_SPEC §101). The UI never sets order status directly.

---

# 11. BATCH 06 — PAYMENTS & REFUNDS

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 18 | Payment List | TODO | `GET /api/v1/admin/payments` |
| 19 | Payment Details | TODO | `GET /api/v1/admin/payments/{paymentId}` |
| 20 | Refund List | TODO | `GET /api/v1/admin/refunds` |
| 21 | Refund Details | TODO | `GET /api/v1/admin/refunds/{refundId}` |

---

# 12. BATCH 07 — SETTLEMENTS

Status:

```text
TODO
```

Smaller batch (feature boundary): 2 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 22 | Settlement List | TODO | `GET /api/v1/admin/settlements` |
| 23 | Settlement Details (process / approve) | TODO | `GET /api/v1/admin/settlements/{settlementId}`, `POST .../process`, `POST .../approve` (idempotent) |

---

# 13. BATCH 08 — PROMOTIONS & REVIEWS

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 24 | Promotion List | TODO | `GET /api/v1/admin/promotions` |
| 25 | Promotion Details (edit / disable) | TODO | `GET/PATCH /api/v1/admin/promotions/{promotionId}`, `POST .../disable` |
| 26 | Review Moderation List | TODO | `GET /api/v1/admin/reviews` |
| 27 | Review Details (hide / restore) | TODO | `GET /api/v1/admin/reviews/{reviewId}`, `POST .../hide`, `POST .../restore` |

---

# 14. BATCH 09 — SUPPORT

Status:

```text
TODO
```

Smaller batch (feature boundary): 2 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 28 | Support Ticket Queue | TODO | `GET /api/v1/admin/support/tickets` |
| 29 | Support Ticket Details (assign / resolve / messages) | TODO | `GET /api/v1/admin/support/tickets/{ticketId}`, `POST .../assign`, `POST .../resolve` |

Support cannot bypass business integrity (SUPPORT_RULES).

---

# 15. BATCH 10 — RISK

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 30 | Risk Flags | TODO | `GET /api/v1/admin/risk/flags` |
| 31 | Risk Flag Details (resolve / dismiss) | TODO | `GET /api/v1/admin/risk/flags/{flagId}`, `POST .../resolve`, `POST .../dismiss` |
| 32 | Risk Restrictions | TODO | `GET /api/v1/admin/risk/restrictions`, `PATCH .../{restrictionId}`, `POST .../{restrictionId}/remove` |
| 33 | Risk Rules | TODO | `GET /api/v1/admin/risk/rules`, `PATCH /api/v1/admin/risk/rules/{ruleId}` |

Thresholds are configurable; no permanent hard-coded bans (RISK_RULES, CLAUDE.md §15).

---

# 16. BATCH 11 — CONFIGURATION & AUDIT

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 34 | System Configuration | TODO | `GET /api/v1/admin/configuration`, `GET/PATCH /api/v1/admin/configuration/{key}` |
| 35 | Audit Logs | TODO | `GET /api/v1/admin/audit-logs` (filters: actor, action, entityType, entityId, dates) |
| 36 | Audit Log Details | TODO | `GET /api/v1/admin/audit-logs/{auditLogId}` |

Dedicated structured configuration (dispatch settings, fee configuration, cancellation rules) uses domain-specific APIs, not generic key/value (API_SPEC §107).

---

# 17. BATCH 12 — REPORTS

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 37 | Reports | TODO | **Dependency:** no reports endpoint in API_SPEC (ADMIN_SPEC §32–33) |
| 38 | Data Export | TODO | **Dependency:** no export endpoint in API_SPEC (ADMIN_SPEC §38) |

---

# 18. BATCH 13 — SUPER ADMIN: ADMIN USERS & PERMISSIONS

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens. `SUPER_ADMIN` only.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 39 | Admin Users | TODO | **Dependency:** no admin-user endpoints in API_SPEC (ADMIN_SPEC §28) |
| 40 | Admin User Details (activate / deactivate / sessions / MFA status) | TODO | **Dependency:** as above |
| 41 | Permission Management | TODO | **Dependency:** no permission endpoints; no permissions table in DATABASE.md (ADMIN_SPEC §27) |

Permission changes require step-up authentication and audit.

---

# 19. PENDING SPECIFICATION — NOT SCHEDULED

ADMIN_RULES §15 allows admins to *inspect* dispatch and perform audited operational intervention "through an authorized dispatch capability". No admin dispatch/delivery endpoints exist in API_SPEC. A dispatch operations screen is not scheduled until specified.

Tracked in `docs/REPOSITORY_CONSISTENCY_REPORT.md`.

---

# 20. ACTIVE BATCH RULE

```text
ACTIVE BATCH:

NONE — Admin Panel work starts after the Customer, Restaurant and Rider apps
(CLAUDE.md §24), unless the project owner changes the order.
```

---

# 21. STITCH FILE NAMING

```text
apps/admin/design/stitch/

batch-01/
├── 01-admin-login/
├── 02-mfa-verification/
└── 03-admin-shell/
```

---

# 22. SCREEN IMPLEMENTATION CHECKLIST

### Visual

* [ ] Stitch reference reviewed; layout, typography, colors, tables, dialogs match

### Functional

* [ ] Search, filters, pagination work (cursor pagination where specified)
* [ ] Loading / error / empty states exist
* [ ] Destructive/sensitive actions show consequence, reason, confirmation, step-up where applicable

### Security

* [ ] Backend authorization verified for every action (UI hiding is not relied on)
* [ ] No sensitive data beyond what the role may see
* [ ] Actions audited by the backend

### Engineering

* [ ] No fake production logic
* [ ] No unrelated files changed
* [ ] Tests added/updated (Playwright for critical flows)
* [ ] Lint, typecheck, tests, build pass

---

# 23. BATCH COMPLETION FORMAT

```text
Admin Panel — Batch XX Complete

Implemented:
- Screen 1
- Screen 2
- Screen 3
- Screen 4

Validation:
- Lint: PASS/FAIL
- Typecheck: PASS/FAIL
- Tests: PASS/FAIL
- Build: PASS/FAIL

Known Issues:
- ...

Status:
REVIEW

Waiting for approval before starting the next batch.
```

---

# 24. DO NOT AUTO-CONTINUE

After completing a batch: **STOP.** The next batch begins only after explicit user instruction.

---

# 25. ADMIN PANEL DEFINITION OF DONE

The Admin Panel is complete only when:

* all approved screens are implemented and match approved Stitch designs
* admin authentication, MFA/step-up and session security work
* every section is permission-aware and backend-authorized
* customer, restaurant, rider, order, payment/refund, settlement, promotion, review, support, risk, configuration and audit operations follow their specifications
* sensitive actions are confirmed, reasoned and audited
* loading/error/empty states are handled
* lint, typecheck, tests (including Playwright critical flows) and production build pass
* no known critical defects remain
