# QUICKBITE RIDER APP — SCREEN IMPLEMENTATION PLAN

## 1. PURPOSE

This document controls frontend screen implementation for the QuickBite Rider App.

Claude Code must use this document together with:

```text
CLAUDE.md
apps/rider/README.md
```

and the relevant product/API/business/security specifications.

The Rider App is implemented independently from:

```text
apps/customer
apps/restaurant
apps/admin
```

Do not implement screens belonging to another application in this app.

### Derivation

Screens in this plan are derived only from:

```text
docs/product/PRD.md                       §3 (Rider), §7 (Rider Journey), §31, §45 (Rider scope)
docs/api/API_SPEC.md                      §16–25 (auth), §63–76 (rider), §90–92, §113
docs/business-rules/DISPATCH_RULES.md
docs/business-rules/ORDER_RULES.md        §16–19
docs/payments/PAYMENT_RULES.md            §19–21 (COD)
docs/payments/FINANCIAL_SPEC.md           §14–22, §42
docs/maps/MAPS_LOCATION_RULES.md
docs/notifications/REALTIME_SPEC.md       §13, §28, §31–35
docs/testing/TESTING_SPEC.md              §56 (Rider App critical tests)
```

No screen may be added that these documents do not support. Final screen names must be confirmed against the approved Stitch inventory before each batch starts.

---

# 2. RIDER ROLE MODEL

The Rider App supports only:

```text
RIDER
```

The Rider App must never:

* assign a delivery to itself (Dispatch Engine only — ADR-0007)
* receive or display deliveries that were not offered to this rider
* decide order, delivery, payment or earnings state
* show rider ratings (excluded from V1 — ADR-0009)

V1 rule:

```text
One active delivery per rider (ADR-0013)
```

---

# 3. DESIGN SOURCE

Visual reference:

```text
apps/rider/design/stitch/
```

The Stitch designs are the visual source of truth for layout, spacing, typography, colors, components, navigation presentation, forms, cards, buttons, visual states and responsive presentation.

The specifications remain authoritative for business behavior, authorization, API behavior, order/delivery states, dispatch, payments (including COD), earnings, risk and notifications.

If Stitch and a business rule conflict:

```text
Business rule wins for behavior.
Stitch remains the visual reference.
Report the conflict — never invent behavior.
```

---

# 4. IMPLEMENTATION RULE

Never implement the entire Rider App in one task.

```text
APP
 ↓
BATCH
 ↓
IMPLEMENT
 ↓
VALIDATE
 ↓
USER REVIEW
 ↓
APPROVAL
 ↓
NEXT BATCH
```

Default batch size:

```text
4 screens
```

A batch may be smaller when the feature boundary requires it. Claude must stop after each batch.

---

# 5. SCREEN STATUS

Allowed statuses:

```text
TODO
IN_PROGRESS
REVIEW
APPROVED
BLOCKED
```

Only the user/reviewer can mark a screen `APPROVED`.

Claude may mark:

```text
TODO → IN_PROGRESS → REVIEW
```

or:

```text
TODO → BLOCKED
```

when a dependency or decision is missing.

---

# 6. BATCH 01 — AUTHENTICATION FOUNDATION

Status:

```text
TODO
```

Screens:

| # | Screen | Status | API |
|---|--------|--------|-----|
| 1 | Splash | TODO | — |
| 2 | Welcome | TODO | — |
| 3 | Login | TODO | `POST /api/v1/auth/login` |
| 4 | Create Rider Account | TODO | `POST /api/v1/rider/auth/register` |

Claude may implement ONLY these four screens during Batch 01.

Do not implement verification, onboarding, availability, offers or any future screen.

---

# 7. BATCH 02 — ACCOUNT VERIFICATION

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 5 | Phone Verification | TODO | `POST /api/v1/auth/verify-phone`, `POST /api/v1/auth/verify-phone/resend` |
| 6 | Email Verification | TODO | `POST /api/v1/auth/verify-email` |
| 7 | Forgot Password | TODO | `POST /api/v1/auth/forgot-password` |
| 8 | Reset Password | TODO | `POST /api/v1/auth/reset-password` |

Implement only after Batch 01 has been reviewed/approved. Handle invalid/expired code and rate-limit states per `AUTH_AUTHORIZATION.md`.

---

# 8. BATCH 03 — RIDER ONBOARDING / APPLICATION

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 9 | Rider Information (identity, contact, vehicle type/number) | TODO | `GET/PATCH /api/v1/rider/onboarding` |
| 10 | Rider Documents | TODO | `GET/POST /api/v1/rider/documents`, signed upload (API_SPEC §109) |
| 11 | Application Submission & Status | TODO | `POST /api/v1/rider/onboarding/submit`, `GET /api/v1/rider/onboarding` |

Application states (API_SPEC §65):

```text
PENDING
UNDER_REVIEW
APPROVED
REJECTED
SUSPENDED
```

The frontend never approves a rider. Approval is an admin/backend decision. Private documents must never be exposed through public URLs.

---

# 9. BATCH 04 — AVAILABILITY & DELIVERY OFFERS

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API / Realtime |
|---|--------|--------|----------------|
| 12 | Rider Home (Online/Offline, Availability) | TODO | `GET /api/v1/rider/availability`, `POST .../online`, `POST .../offline`, `POST /api/v1/rider/availability` |
| 13 | Location Permission | TODO | device permission; `POST /api/v1/rider/location` once granted |
| 14 | Delivery Offer (accept / reject with reason, expiry, no-longer-available) | TODO | `GET /api/v1/rider/delivery-offers[/{offerId}]`, `POST .../accept`, `POST .../reject`; realtime `delivery.offer_created`, `delivery.offer_expired`, `delivery.offer_cancelled` |

Rules:

* Going online is validated by the backend (approved, active, documents valid, no restriction).
* `ONLINE + AVAILABLE`, `ONLINE + BUSY` and `OFFLINE` are backend states — display only.
* Offer countdown is presentation; expiry is decided by the backend (`DISPATCH_OFFER_EXPIRED`, `DISPATCH_OFFER_ALREADY_RESPONDED`, `DELIVERY_ALREADY_ASSIGNED`).
* On reconnect, re-fetch offers over REST (REALTIME_SPEC §24).

---

# 10. BATCH 05 — ACTIVE DELIVERY

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 15 | Navigate to Restaurant (arriving) | TODO | `GET /api/v1/rider/delivery/current`, `POST /api/v1/rider/deliveries/{deliveryId}/arriving` |
| 16 | Pickup Confirmation | TODO | `POST /api/v1/rider/deliveries/{deliveryId}/pickup` |
| 17 | Navigate to Customer (out for delivery) | TODO | `POST /api/v1/rider/deliveries/{deliveryId}/out-for-delivery` |
| 18 | Delivery Completion (configured proof; COD collection where applicable) | TODO | `POST /api/v1/rider/deliveries/{deliveryId}/complete` |

Order transitions shown here (`RIDER_ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED`) are performed by the backend in response to these actions. Proof-of-delivery mechanism is configurable (API_SPEC §73) — do not hard-code one.

Periodic location updates follow `MAPS_LOCATION_RULES.md` / `REALTIME_SPEC.md` §33–35.

---

# 11. BATCH 06 — DELIVERY HISTORY & EARNINGS

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 19 | Delivery History | TODO | `GET /api/v1/rider/deliveries` (cursor pagination) |
| 20 | Delivery Details | TODO | `GET /api/v1/deliveries/{deliveryId}` |
| 21 | Earnings Overview | TODO | `GET /api/v1/rider/earnings` |
| 22 | Earnings Transactions | TODO | `GET /api/v1/rider/earnings/transactions`, `GET /api/v1/rider/earnings/{earningId}` |

All amounts are backend-calculated decimal strings. Never compute earnings on the device.

---

# 12. BATCH 07 — SETTLEMENTS & PAYOUTS

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 23 | Settlements | TODO | `GET /api/v1/rider/settlements` |
| 24 | Settlement Details | TODO | `GET /api/v1/rider/settlements/{settlementId}` |
| 25 | Payouts | TODO | `GET /api/v1/rider/payouts` |

Read-only. Riders cannot modify settlement or payout amounts.

---

# 13. BATCH 08 — PROFILE & ACCOUNT

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 26 | Profile | TODO | `GET /api/v1/rider/profile` |
| 27 | Edit Profile | TODO | `PATCH /api/v1/rider/profile` |
| 28 | My Documents | TODO | `GET/PATCH/DELETE /api/v1/rider/documents[/{documentId}]` |
| 29 | Settings & Logout | TODO | `POST /api/v1/auth/logout` |

Do not add settings that the specifications do not support.

---

# 14. BATCH 09 — NOTIFICATIONS

Status:

```text
TODO
```

Smaller batch (feature boundary): 3 screens.

| # | Screen | Status | API |
|---|--------|--------|-----|
| 30 | Notifications | TODO | `GET /api/v1/notifications`, `POST .../read-all` |
| 31 | Notification Details | TODO | `GET /api/v1/notifications/{notificationId}`, `POST .../read` |
| 32 | Notification Preferences | TODO | `GET/PATCH /api/v1/notifications/preferences` |

---

# 15. BATCH 10 — SUPPORT

Status:

```text
TODO
```

| # | Screen | Status | API |
|---|--------|--------|-----|
| 33 | Support | TODO | `GET /api/v1/support/tickets` |
| 34 | Create Ticket | TODO | `POST /api/v1/support/tickets` |
| 35 | Ticket Details | TODO | `GET /api/v1/support/tickets/{ticketId}`, `POST .../close` |
| 36 | Support Messages | TODO | `POST /api/v1/support/tickets/{ticketId}/messages` |

Follow `docs/support/SUPPORT_RULES.md` and `SUPPORT_SPEC.md`.

---

# 16. PENDING SPECIFICATION — NOT SCHEDULED

The PRD lists "Handle delivery exceptions" for riders (PRD §3), and DISPATCH_RULES §25–26, §35 refer to a "delivery exception/reassignment workflow". No delivery-exception states, endpoints or screens are specified.

```text
Delivery Exception (e.g. customer unreachable, cannot complete)
```

This screen is **not scheduled** and must not be implemented until the workflow is specified in the business rules and `API_SPEC.md`. Tracked in `docs/REPOSITORY_CONSISTENCY_REPORT.md`.

---

# 17. ACTIVE BATCH RULE

At any moment there must be only one active Rider App batch.

```text
ACTIVE BATCH:

NONE — Rider App work starts after the Customer App and Restaurant App are complete
(CLAUDE.md §24), unless the project owner changes the order.
```

---

# 18. STITCH FILE NAMING

```text
apps/rider/design/stitch/

batch-01/
├── 01-splash/
├── 02-welcome/
├── 03-login/
└── 04-create-rider-account/
```

Place Stitch exports (screenshots, code, assets) in the relevant screen directory. Preserve exported code as reference only; do not copy it blindly if it conflicts with the project architecture.

---

# 19. SCREEN IMPLEMENTATION CHECKLIST

### Visual

* [ ] Stitch reference reviewed
* [ ] Layout, spacing, typography, colors match
* [ ] Components, icons, cards/buttons match
* [ ] Navigation presentation matches

### Functional

* [ ] Navigation works
* [ ] Inputs and validation work
* [ ] Loading / error / empty states exist
* [ ] API integration works where applicable
* [ ] Realtime reconnect falls back to REST re-fetch

### Engineering

* [ ] Authorization correct (RIDER only, own deliveries only)
* [ ] Backend remains authoritative (no self-assignment, no client-side state decisions)
* [ ] No fake production logic
* [ ] No unrelated files changed
* [ ] Tests added/updated
* [ ] Lint, typecheck, tests, build pass

---

# 20. BATCH COMPLETION FORMAT

```text
Rider App — Batch XX Complete

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

# 21. DO NOT AUTO-CONTINUE

After completing a batch:

```text
STOP.
```

The next batch begins only after explicit user instruction.

---

# 22. RIDER APP DEFINITION OF DONE

The Rider App is complete only when:

* all approved screens are implemented and match approved Stitch designs
* authentication, onboarding and verification work
* availability and location follow the backend and maps rules
* offers are received only through the Dispatch Engine; acceptance is atomic
* pickup, delivery and completion follow the order/delivery lifecycle
* COD handling follows the payment rules
* earnings, settlements and payouts are displayed from backend data only
* notifications/realtime work, including reconnection and resynchronization
* support follows support rules
* loading/error/empty states are handled
* lint, typecheck, tests and production build pass
* no known critical defects remain
