# ADR-0014: V1 Decisions for Previously Unspecified Behavior

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-09-27 |
| Deciders | QuickBite project owner |
| Supersedes | — |

## Context

Backend completion (Phase 20) required decisions that the frozen specifications leave open
(`docs/REPOSITORY_CONSISTENCY_REPORT.md` H1, H2, H5, H6, H7 and the financial "configured business
rules" of `docs/payments/FINANCIAL_SPEC.md` §8–16). The project owner chose the options below.
Every monetary value is **configuration**, never a hard-coded constant.

## Decisions

### 1. Order fees (FINANCIAL_SPEC §12–13, §62)

* **Delivery fee:** one flat platform-wide amount.
* **Service fee:** one flat platform-wide amount (may be `0.00`).
* **Tax:** one percentage applied to `subtotal − discount` (may be `0`).
* All three are admin-managed `system_settings` values and are snapshotted on every order (§5).

### 2. Earnings (FINANCIAL_SPEC §8–16)

* **Restaurant:** `gross = subtotal − restaurant-funded discount`;
  `commission = gross × platform commission %`; `net = gross − commission`.
  One platform-wide commission percentage.
* **Rider:** one flat base amount per completed delivery; no bonuses in V1
  (`bonus_amount = 0`). Customer delivery fee and rider earning remain separate concepts (§15).
* Rates are snapshotted on each earning record.

### 3. Promotion funding (PROMOTION_RULES §36)

Promotions are **restaurant-funded only**. Restaurants create promotions for their own restaurant;
the discount reduces restaurant earnings. Administrators can view, edit status and disable
promotions but do not create platform-funded promotions in V1.

### 4. Cart storage (API_SPEC §32–36)

Carts are **PostgreSQL** records (`carts`, `cart_items`, `cart_item_variations`,
`cart_item_add_ons`). Carts never carry authoritative prices; totals are recalculated on read and
at checkout.

### 5. Online payments (ADR-0008)

`PaymentService` provider interface with a **sandbox adapter** for development/test that simulates
a provider (payment intents, signed webhooks, refunds). Staging and production refuse to start with
the sandbox adapter until a real provider adapter is added. Cash on delivery is fully implemented.

### 6. Market

Currency **PKR**; business timezone **Asia/Karachi** (settlement periods, operating hours,
promotion windows). Both are configuration.

### 7. Realtime events (resolves the API_SPEC vs REALTIME_SPEC conflict)

Socket.IO event names use the API_SPEC style (`order.status_changed`, `delivery.offer_created`).
The envelope follows REALTIME_SPEC §15 with camelCase fields matching the REST API:
`eventId, eventType, version, occurredAt, resourceType, resourceId, channel, sequence, data`.

### 8. Admin authorization

* Role split only: `ADMIN` and `SUPER_ADMIN` capabilities per ADMIN_RULES §4–5; no custom
  permission tables in V1.
* **TOTP MFA** for admin accounts, enforced by the backend; step-up (recent MFA) for sensitive
  admin actions (AUTH_AUTHORIZATION §34–38).

### 9. Refunds on cancellation (CANCELLATION_RULES §13, PAYMENT_RULES §23–24)

No automatic refunds. When an order whose payment was captured is cancelled, the cancellation is
recorded without a refund amount and the refund decision is left to an administrator, who records
`FULL_REFUND`, `PARTIAL_REFUND` (amount) or `NO_REFUND` with a reason. Every decision is audited.

### 10. Cash on delivery collection (PAYMENT_RULES §21)

The authoritative collection event is the assigned rider completing a COD delivery: the completion
request confirms cash collected, and the backend marks the COD payment `SUCCEEDED` in the same
transaction. Non-receipt is handled through support/risk (`COD_NON_RECEIPT`).

### 11. Delivery completion proof (API_SPEC §73)

The assigned rider's authenticated completion action at `OUT_FOR_DELIVERY` (with optional notes) is
the V1 proof. OTP/photo/signature may be added later behind the same endpoint.

### 12. Customer cancellation after acceptance (CANCELLATION_RULES §5.2, §31)

Controlled by the admin setting `orders.accepted_cancellation_window_seconds`. When unset or `0`,
customers cannot cancel after `RESTAURANT_ACCEPTED`. Only `ONLINE` restaurants are orderable
(ORDER_RULES §8: `TEMPORARILY_PAUSED` is not orderable unless a future rule says otherwise).

## Consequences

* New tables/columns are added to `DATABASE.md` with the slices that introduce them.
* Changing any decision requires a superseding ADR and specification updates.
