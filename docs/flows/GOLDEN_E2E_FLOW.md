# GOLDEN E2E FLOW

**File:** `docs/flows/GOLDEN_E2E_FLOW.md`
**Status:** FROZEN V1
**Type:** Cross-domain validation artifact

---

# 1. Purpose

This document records the approved QuickBite V1 end-to-end flow.

It is the single most important integration path in the product:

> If this flow does not work reliably, QuickBite V1 is not ready for production.
> — `docs/product/PRD.md` §48

The Golden Flow verifies that the major domains connect correctly.

It does **not** replace the detailed business rules. If a detailed specification contains a rule that is not represented here, that rule remains valid (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §36).

This document introduces no new business behavior. Every step below is sourced from an existing specification.

---

# 2. The Flow

```text
Customer Registration
→ Restaurant Discovery
→ Menu Browsing
→ Cart
→ Checkout
→ Backend Recalculation
→ Payment/COD Validation
→ Risk Validation
→ Order Creation
→ Restaurant Receives Order
→ Restaurant Accepts
→ Preparing
→ Ready for Pickup
→ Dispatch
→ Rider Assignment
→ Rider Pickup
→ Out for Delivery
→ Delivered
→ Review
→ Restaurant Earnings
→ Rider Earnings
→ Settlement
→ Payout
→ Invoice
→ Reconciliation
→ Audit
```

---

# 3. Step Reference

Endpoints are taken from `docs/api/API_SPEC.md` §143 (Golden E2E API Flow) and the referenced sections. Order states are the frozen lifecycle from `docs/business-rules/ORDER_RULES.md`.

| # | Step | Actor | Interface | Order state after step | Authoritative source |
|---|------|-------|-----------|------------------------|----------------------|
| 1 | Customer Registration | Customer | `POST /api/v1/auth/register`, `POST /api/v1/auth/verify-phone`, `POST /api/v1/auth/verify-email` | — | API_SPEC §16–22, AUTH_AUTHORIZATION |
| 2 | Restaurant Discovery | Customer | `POST /api/v1/customer/addresses`, `GET /api/v1/restaurants` | — | API_SPEC §27–28, MAPS_LOCATION_SPEC |
| 3 | Menu Browsing | Customer | `GET /api/v1/restaurants/{restaurantId}/menu` | — | API_SPEC §30 |
| 4 | Cart | Customer | `POST /api/v1/cart/items` | — | API_SPEC §32–36 |
| 5 | Checkout | Customer | `POST /api/v1/checkout/preview` | — | API_SPEC §37 |
| 6 | Backend Recalculation | Backend | Internal (part of preview and order creation) | — | API_SPEC §36–38, FINANCIAL_SPEC §5–6 |
| 7 | Payment/COD Validation | Backend | Internal | — | PAYMENT_RULES |
| 8 | Risk Validation | Backend (Trust & Risk Engine) | Internal | — | RISK_RULES, PRD §27 |
| 9 | Order Creation | Customer → Backend | `POST /api/v1/orders` with `Idempotency-Key` | `PENDING` | API_SPEC §38, ORDER_RULES |
| 10 | Restaurant Receives Order | Backend → Restaurant | Outbox → realtime `order.created` + notification | `PENDING` | REALTIME_SPEC, NOTIFICATION_RULES |
| 11 | Restaurant Accepts | Restaurant Owner/Operator | `POST /api/v1/restaurant/orders/{orderId}/accept` | `RESTAURANT_ACCEPTED` | API_SPEC §52 |
| 12 | Preparing | Restaurant Owner/Operator | `POST /api/v1/restaurant/orders/{orderId}/preparing` | `PREPARING` | API_SPEC §54 |
| 13 | Ready for Pickup | Restaurant Owner/Operator | `POST /api/v1/restaurant/orders/{orderId}/ready` | `READY_FOR_PICKUP` | API_SPEC §55 |
| 14 | Dispatch | Backend (Dispatch Engine) | Internal: find eligible → rank → offer; realtime `delivery.offer_created` | `READY_FOR_PICKUP` | DISPATCH_RULES, API_SPEC §71–72 |
| 15 | Rider Assignment | Rider | `POST /api/v1/rider/delivery-offers/{offerId}/accept` (atomic assignment) | `RIDER_ASSIGNED` | DISPATCH_RULES, API_SPEC §70 |
| 16 | Rider Pickup | Rider | `POST /api/v1/rider/deliveries/{deliveryId}/arriving`, `POST /api/v1/rider/deliveries/{deliveryId}/pickup` | `PICKED_UP` | API_SPEC §73 |
| 17 | Out for Delivery | Rider | `POST /api/v1/rider/deliveries/{deliveryId}/out-for-delivery` | `OUT_FOR_DELIVERY` | API_SPEC §73 |
| 18 | Delivered | Rider | `POST /api/v1/rider/deliveries/{deliveryId}/complete` | `DELIVERED` | API_SPEC §73 |
| 19 | Review | Customer | `POST /api/v1/orders/{orderId}/review` | `DELIVERED` | REVIEW_RULES, API_SPEC §88 |
| 20 | Restaurant Earnings | Backend | Internal financial record | `DELIVERED` | FINANCIAL_SPEC §7–11, §19 |
| 21 | Rider Earnings | Backend | Internal financial record | `DELIVERED` | FINANCIAL_SPEC §14–15, §20 |
| 22 | Settlement | Backend / Admin | Settlement generation; `POST /api/v1/admin/settlements/{settlementId}/process` / `.../approve` | — | FINANCIAL_SPEC §25–33, API_SPEC §103 |
| 23 | Payout | Backend | Payout flow (idempotent) | — | FINANCIAL_SPEC §34–39 |
| 24 | Invoice | Backend | Invoice generation; `GET /api/v1/restaurant/invoices` | — | FINANCIAL_SPEC §44–46, API_SPEC §60 |
| 25 | Reconciliation | Backend / Admin | Reconciliation jobs and checks | — | FINANCIAL_SPEC §50–52, API_SPEC §151 |
| 26 | Audit | Backend | `audit_logs` for every sensitive action along the flow | — | AUTH_AUTHORIZATION, ADMIN_RULES §27, DATABASE §59 |

Notes:

* Review (step 19) is optional for the customer; the flow requires that an eligible review **can** be created once the order is `DELIVERED`. Review does not change order state.
* Earnings (steps 20–21) are recorded by the backend on completion; the ordering relative to the customer's review is not a dependency.
* "Arriving" (step 16) is a delivery-level signal. It does not introduce an additional order state.

---

# 4. Backend Order-Creation Sequence

From `docs/api/API_SPEC.md` §143 Step 8:

```text
validate
→ calculate
→ risk check
→ create order
→ create payment record
→ create status history
→ publish event (outbox)
```

Order creation is transactional and idempotent. External providers are never called inside the transaction (`CLAUDE.md` §9–11).

---

# 5. Invariants Checked by This Flow

* The client never supplies authoritative prices, totals, order status, payment status, rider assignment, or earnings.
* Only the frozen order states are used:

  ```text
  PENDING → RESTAURANT_ACCEPTED → PREPARING → READY_FOR_PICKUP
          → RIDER_ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
  ```

* Riders are never globally broadcast; only eligible, ranked riders receive offers.
* Rider assignment is atomic; a rider has at most one active delivery in V1.
* Every state change writes status history and emits an outbox event.
* Every sensitive or financial action is audited.

---

# 6. Testing

The automated Golden E2E test is defined in `docs/testing/TESTING_SPEC.md` §51.

Failure scenarios around this flow are defined in `docs/testing/TESTING_SPEC.md` §52 and `docs/payments/FINANCIAL_SPEC.md` §75.

---

# 7. Related Documents

```text
docs/product/PRD.md                         §4, §48
docs/api/API_SPEC.md                        §143
docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/DISPATCH_RULES.md
docs/business-rules/RISK_RULES.md
docs/payments/PAYMENT_RULES.md
docs/payments/FINANCIAL_SPEC.md             §74
docs/reviews/REVIEW_RULES.md
docs/notifications/REALTIME_SPEC.md
docs/notifications/NOTIFICATION_RULES.md
docs/ARCHITECTURE_CONSISTENCY_REVIEW.md     §35–36
docs/testing/TESTING_SPEC.md                §51–52
```
