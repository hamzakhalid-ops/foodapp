# QuickBite — Order Business Rules

**Version:** 1.0
**Status:** Approved for Implementation
**Product:** QuickBite Food Delivery Platform

---

## 1. Purpose

This document defines the authoritative business rules governing the QuickBite order lifecycle.

It covers:

* Cart validation
* Checkout
* Order creation
* Pricing
* Order state transitions
* Restaurant actions
* Rider-related order transitions
* Payment validation
* Order history
* Order state concurrency
* Order cancellation references
* Financial snapshots

These rules apply to the Customer App, Restaurant App, Rider App, Admin Panel, backend APIs, background workers, and realtime systems.

---

# 2. Authority

The backend is authoritative for:

* Order status
* Prices
* Discounts
* Taxes
* Fees
* Delivery fees
* Payment status
* Restaurant availability
* Order totals
* Rider assignment
* Order cancellation eligibility
* Financial records
* Permissions

The frontend must never be trusted for these values.

---

# 3. Order Ownership

Every order belongs to exactly:

* One customer
* One restaurant
* One delivery address snapshot
* Zero or one active rider assignment
* One payment context

V1 does not support multi-restaurant carts.

---

# 4. Cart Rules

## 4.1 Restaurant Restriction

A customer may have only one restaurant in the active cart.

If the customer attempts to add an item from another restaurant:

```text
CART_RESTAURANT_MISMATCH
```

The backend must reject the operation unless the customer explicitly clears the existing cart.

---

## 4.2 Menu Item Validation

At checkout the backend must verify:

* Item exists
* Item belongs to the restaurant
* Item is active
* Item is available
* Selected variation exists and is active
* Selected add-ons exist and are active
* Requested quantity is valid
* Restaurant is orderable

The client-provided price must never be trusted.

---

# 5. Checkout Validation

Before creating an order, the backend must recalculate:

```text
subtotal
- discount
+ delivery fee
+ tax
+ service fee
= total
```

The backend must calculate all monetary values.

The client may submit selections, quantities, address, payment method, and promotion code, but cannot determine the final price.

---

# 6. Price Snapshot

When an order is created, the backend must snapshot:

* Item name
* Item unit price
* Variation name
* Variation price adjustment
* Add-on name
* Add-on price
* Quantity
* Discount
* Delivery fee
* Tax
* Service fee
* Total

Future menu price changes must not modify historical orders.

---

# 7. Minimum Order

If a restaurant has a configured minimum order amount:

```text
subtotal >= restaurant.minimum_order
```

must be true before order creation.

Otherwise:

```text
MINIMUM_ORDER_NOT_MET
```

---

# 8. Restaurant Availability

An order may only be created when the restaurant is orderable.

Normally orderable:

```text
ONLINE
```

Potentially orderable depending on configured rules:

```text
TEMPORARILY_PAUSED
```

Not orderable:

```text
OFFLINE
CLOSED
SUSPENDED
```

The backend must perform a final availability check during checkout.

---

# 9. Order Creation

A successful checkout creates an order with:

```text
PENDING
```

The initial order must include:

* Customer
* Restaurant
* Delivery address snapshot
* Order items
* Pricing snapshot
* Payment method
* Payment status
* Currency
* Promotion reference if applicable
* Order number
* Creation timestamp

---

# 10. Order Lifecycle

The authoritative V1 lifecycle is:

```text
PENDING
    ↓
RESTAURANT_ACCEPTED
    ↓
PREPARING
    ↓
READY_FOR_PICKUP
    ↓
RIDER_ASSIGNED
    ↓
PICKED_UP
    ↓
OUT_FOR_DELIVERY
    ↓
DELIVERED
```

Cancellation states:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

---

# 11. Valid State Transitions

Only the following normal transitions are allowed:

| Current State       | Allowed Next State      |
| ------------------- | ----------------------- |
| PENDING             | RESTAURANT_ACCEPTED     |
| PENDING             | CANCELLED_BY_CUSTOMER   |
| PENDING             | CANCELLED_BY_RESTAURANT |
| PENDING             | CANCELLED_BY_ADMIN      |
| RESTAURANT_ACCEPTED | PREPARING               |
| RESTAURANT_ACCEPTED | CANCELLED_BY_ADMIN      |
| PREPARING           | READY_FOR_PICKUP        |
| PREPARING           | CANCELLED_BY_ADMIN      |
| READY_FOR_PICKUP    | RIDER_ASSIGNED          |
| READY_FOR_PICKUP    | CANCELLED_BY_ADMIN      |
| RIDER_ASSIGNED      | PICKED_UP               |
| RIDER_ASSIGNED      | CANCELLED_BY_ADMIN      |
| PICKED_UP           | OUT_FOR_DELIVERY        |
| PICKED_UP           | CANCELLED_BY_ADMIN      |
| OUT_FOR_DELIVERY    | DELIVERED               |
| OUT_FOR_DELIVERY    | CANCELLED_BY_ADMIN      |

The backend must reject invalid transitions.

---

# 12. Restaurant Accept

Restaurant Owner or Restaurant Operator may accept an eligible order.

Required state:

```text
PENDING
```

Result:

```text
RESTAURANT_ACCEPTED
```

The transition must be atomic.

Duplicate accept requests must not produce duplicate state changes.

---

# 13. Restaurant Reject

A restaurant may reject an order while it is:

```text
PENDING
```

The order becomes:

```text
CANCELLED_BY_RESTAURANT
```

A rejection reason should be captured.

Examples:

* Restaurant unavailable
* Item unavailable
* Kitchen issue
* Capacity issue
* Other configured reason

The rejection must be audited.

---

# 14. Preparing

Restaurant may move:

```text
RESTAURANT_ACCEPTED
→ PREPARING
```

Only authorized restaurant users may perform this action.

---

# 15. Ready for Pickup

Restaurant may move:

```text
PREPARING
→ READY_FOR_PICKUP
```

At this point the backend must trigger the Delivery Dispatch Engine.

The dispatch process must not be implemented as frontend logic.

---

# 16. Rider Assignment

When an order becomes:

```text
READY_FOR_PICKUP
```

the Dispatch Engine searches for eligible riders.

After successful assignment:

```text
READY_FOR_PICKUP
→ RIDER_ASSIGNED
```

The order must reference the active delivery/rider assignment.

---

# 17. Pickup

A rider may confirm pickup only when:

* Rider is assigned to the delivery
* Order is ready
* Rider is authorized
* Delivery is active

Result:

```text
RIDER_ASSIGNED
→ PICKED_UP
```

Pickup timestamp must be recorded.

---

# 18. Out for Delivery

After pickup:

```text
PICKED_UP
→ OUT_FOR_DELIVERY
```

This transition must be performed by the assigned rider or an authorized backend/admin workflow.

---

# 19. Delivery Completion

A rider may complete delivery only when:

* Rider is assigned
* Delivery is active
* Order has been picked up
* Required delivery confirmation conditions are satisfied

Result:

```text
OUT_FOR_DELIVERY
→ DELIVERED
```

The backend must record:

* Delivered timestamp
* Delivery completion metadata
* Rider delivery completion
* Earnings trigger
* Customer notification

---

# 20. Payment Rules

Payment status is separate from order status.

Payment states:

```text
PENDING
AUTHORIZED
SUCCEEDED
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

The backend must never mark an online payment as successful solely because the client reports success.

Payment provider confirmation is authoritative.

---

# 21. Cash on Delivery

For COD:

```text
payment_method = COD
```

The order may proceed without online payment authorization.

COD risk restrictions must be checked before order creation.

If the customer is restricted from COD:

```text
COD_RESTRICTED
```

the backend must reject the COD checkout.

---

# 22. Idempotency

The following operations require idempotency protection:

* Order creation
* Payment creation
* Payment confirmation
* Refund
* Order cancellation
* Rider assignment
* Delivery completion
* Financial record creation

Repeated requests must not create duplicate orders or financial records.

---

# 23. Concurrency

Order state transitions must be concurrency-safe.

Example:

Two restaurant operators simultaneously attempt to accept the same order.

Only one request may successfully transition:

```text
PENDING
→ RESTAURANT_ACCEPTED
```

The other request must receive a conflict/business-state error.

Example:

```text
ORDER_STATE_CHANGED
```

---

# 24. Order History

Every order status change must create an append-only record in:

```text
order_status_history
```

Each record should include:

* Order ID
* Previous state
* New state
* Actor
* Reason
* Metadata
* Timestamp

Historical order state must not be silently overwritten.

---

# 25. Customer Order Visibility

Customers may view only their own orders.

The backend must enforce ownership.

Client-provided customer IDs must never be trusted.

---

# 26. Restaurant Order Visibility

Restaurant users may only access orders belonging to their authorized restaurant.

Restaurant tenant isolation must be enforced server-side.

---

# 27. Rider Order Visibility

A rider may access delivery/order information only when:

* The rider is assigned to that delivery, or
* The order is exposed through an active dispatch offer.

Riders must not receive arbitrary restaurant orders.

---

# 28. Admin Access

Admin users may access orders according to their permissions.

Sensitive actions must be audited.

Super Admin actions must receive enhanced auditing where applicable.

---

# 29. Cancellation

Cancellation behavior is governed by:

```text
CANCELLATION_RULES.md
```

Order logic must not duplicate cancellation policy in multiple places.

The Cancellation Rules Engine is authoritative.

---

# 30. Risk

Risk restrictions are governed by:

```text
RISK_RULES.md
```

Order creation must check relevant customer restrictions before final creation.

---

# 31. Notifications

Important order state changes should generate notifications.

Examples:

* Order placed
* Restaurant accepted
* Restaurant rejected
* Preparing
* Ready
* Rider assigned
* Picked up
* Out for delivery
* Delivered
* Cancelled

Notification failure must not incorrectly roll back the completed business state.

---

# 32. Realtime

Realtime events may be emitted for order-state changes.

Example:

```text
order.created
order.accepted
order.preparing
order.ready
order.rider_assigned
order.picked_up
order.out_for_delivery
order.delivered
order.cancelled
```

The database remains authoritative.

WebSocket state must not become the source of truth.

---

# 33. Financial Integrity

Order financial values must remain immutable after creation except through explicit adjustment/refund workflows.

Refunds must create separate financial records.

The original payment must not be overwritten merely to represent a refund.

---

# 34. Audit Requirements

The following actions require auditing:

* Admin cancellation
* Restaurant cancellation
* Refund
* Manual order state change
* Manual financial adjustment
* Rider reassignment
* Risk override
* Administrative intervention

---

# 35. Error Handling

Business errors must use stable machine-readable error codes.

Examples:

```text
ORDER_NOT_FOUND
ORDER_STATE_INVALID
ORDER_STATE_CHANGED
RESTAURANT_NOT_ORDERABLE
MINIMUM_ORDER_NOT_MET
MENU_ITEM_UNAVAILABLE
INVALID_VARIATION
INVALID_ADD_ON
PAYMENT_FAILED
COD_RESTRICTED
ORDER_ALREADY_CANCELLED
UNAUTHORIZED_ORDER_ACCESS
```

---

# 36. Testing Requirements

Order implementation must test:

* Valid transitions
* Invalid transitions
* Duplicate requests
* Concurrent requests
* Price changes after cart creation
* Menu item becoming unavailable
* Restaurant going offline
* Minimum order boundaries
* Promotion boundaries
* Payment failures
* COD restrictions
* Cancellation boundaries
* Rider assignment races
* Delivery completion races
* Notification failures
* Database transaction failures

---

# 37. Implementation Rule

Claude Code must not invent:

* New order states
* New transition paths
* New cancellation behavior
* New financial behavior
* New payment states
* New rider assignment rules

Any required change must first update the authoritative business-rule documentation.

---

# 38. Definition of Done

Order functionality is complete only when:

* UI implemented
* API implemented
* Backend validation implemented
* Database behavior implemented
* Authorization implemented
* State machine implemented
* Idempotency implemented
* Concurrency protection implemented
* Notifications implemented where required
* Audit logging implemented where required
* Unit tests implemented
* Integration tests implemented
* E2E tests implemented
* Error handling implemented
* Security checks implemented
* Documentation updated

---

**End of ORDER_RULES.md**
