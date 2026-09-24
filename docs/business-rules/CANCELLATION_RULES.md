# QuickBite — Cancellation Business Rules

**Version:** 1.0
**Status:** Approved for Implementation

---

## 1. Purpose

This document defines the authoritative cancellation rules for QuickBite.

Cancellation must be handled by a centralized **Cancellation Rules Engine**.

Cancellation logic must not be duplicated independently across the Customer App, Restaurant App, Rider App, Admin Panel, or frontend code.

---

# 2. Core Principle

The backend determines whether an order can be cancelled.

The frontend may display cancellation options based on backend-provided eligibility, but frontend visibility is not security.

A customer cannot bypass cancellation restrictions by directly calling an API.

---

# 3. Cancellation States

QuickBite supports:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

---

# 4. Normal Order States

Cancellation decisions are based on the current order state:

```text
PENDING
RESTAURANT_ACCEPTED
PREPARING
READY_FOR_PICKUP
RIDER_ASSIGNED
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
```

---

# 5. Customer Cancellation

## 5.1 PENDING

Customer cancellation is normally allowed while:

```text
PENDING
```

The backend must evaluate:

* Payment status
* Promotion effects
* Risk restrictions
* Refund rules
* Existing cancellation request
* Order state at the exact time of cancellation

Possible outcome:

```text
CANCELLED_BY_CUSTOMER
```

---

## 5.2 RESTAURANT_ACCEPTED

Customer cancellation is restricted.

The backend must evaluate configured cancellation rules before allowing cancellation.

Cancellation may be denied if preparation has effectively started.

---

## 5.3 PREPARING

Customer cancellation is normally not allowed.

The backend should return:

```text
CANCELLATION_NOT_ALLOWED
```

unless an authorized administrative/support workflow overrides the normal rule.

---

## 5.4 READY_FOR_PICKUP

Customer cancellation is not normally allowed.

---

## 5.5 RIDER_ASSIGNED

Customer cancellation is not normally allowed.

---

## 5.6 PICKED_UP

Customer cancellation is not normally allowed.

---

## 5.7 OUT_FOR_DELIVERY

Customer cancellation is not normally allowed.

---

## 5.8 DELIVERED

A delivered order cannot be cancelled.

Customer disputes after delivery must use the support/refund process.

---

# 6. Customer Cancellation Table

| Order State         | Customer Cancellation    |
| ------------------- | ------------------------ |
| PENDING             | Allowed subject to rules |
| RESTAURANT_ACCEPTED | Restricted/configurable  |
| PREPARING           | Normally not allowed     |
| READY_FOR_PICKUP    | Not normally allowed     |
| RIDER_ASSIGNED      | Not normally allowed     |
| PICKED_UP           | Not normally allowed     |
| OUT_FOR_DELIVERY    | Not normally allowed     |
| DELIVERED           | Not applicable           |

---

# 7. Restaurant Cancellation

A restaurant may cancel an order when it is unable to fulfill it and the order is still in an eligible state.

Typical reasons:

* Item unavailable
* Restaurant capacity issue
* Kitchen issue
* Restaurant closure
* Operational problem

Restaurant cancellation must be audited.

The restaurant must provide a cancellation reason.

---

# 8. Restaurant Cancellation Authority

Restaurant Owner and Restaurant Operator may perform restaurant cancellation where the order state permits.

Authorization must be checked server-side.

A restaurant user cannot cancel another restaurant's order.

---

# 9. Admin Cancellation

Authorized Admin users may cancel an order for legitimate operational reasons.

Examples:

* Restaurant cannot fulfill order
* Restaurant unexpectedly closed
* Payment issue
* Duplicate order
* Safety issue
* Platform error
* Customer support resolution
* Other approved administrative reason

Every admin cancellation must be audited.

---

# 10. Admin Override

Admin intervention may override a normal customer/restaurant cancellation restriction when legitimately required.

The admin must provide:

* Reason
* Actor identity
* Timestamp
* Order ID
* Resulting cancellation state
* Refund outcome if applicable

---

# 11. Support Intervention

Support staff should use the authorized backend cancellation workflow rather than directly modifying the database.

Support intervention must produce an audit record.

---

# 12. Cancellation Reason Codes

Reason codes should be standardized.

Example categories:

```text
CUSTOMER_CHANGED_MIND
CUSTOMER_ORDERED_BY_MISTAKE
RESTAURANT_ITEM_UNAVAILABLE
RESTAURANT_UNABLE_TO_FULFILL
RESTAURANT_CLOSED
PAYMENT_ISSUE
DUPLICATE_ORDER
SAFETY_REASON
PLATFORM_ERROR
ADMIN_RESOLUTION
OTHER
```

The final production list must be maintained centrally.

---

# 13. Refund Outcomes

Cancellation may produce:

```text
FULL_REFUND
PARTIAL_REFUND
NO_REFUND
```

The refund outcome must be determined by the applicable business rules and payment state.

The cancellation action must not assume that every cancellation produces a full refund.

---

# 14. Payment Rules

For online payments:

The backend must verify the actual payment state before processing a refund.

For COD:

No online payment refund exists unless another financial transaction was recorded.

Cancellation may still affect financial/accounting records.

---

# 15. Refund Integrity

Refunds must be represented using the refund system.

Do not overwrite the original payment to indicate a refund.

A refund must have:

* Payment reference
* Order reference
* Amount
* Reason
* Initiator
* Provider reference when applicable
* Status
* Timestamps

---

# 16. Idempotency

Cancellation requests must be idempotent.

If the same request is submitted multiple times:

* The order must not transition multiple times.
* Multiple refunds must not be created.
* Multiple cancellation records must not be created.

---

# 17. Concurrency

Cancellation must be protected against race conditions.

Example:

Customer requests cancellation at the same moment the restaurant accepts the order.

The backend must atomically determine which valid transition occurs first.

The resulting state must be consistent.

---

# 18. Cancellation Transaction

Where cancellation affects multiple records, the backend should use a transaction.

Example:

```text
Validate order
↓
Validate cancellation eligibility
↓
Transition order state
↓
Create cancellation record
↓
Create refund request if required
↓
Create outbox event
↓
Commit
```

External payment-provider operations must be handled safely and idempotently.

---

# 19. Cancellation History

Every cancellation must be recorded in:

```text
order_cancellations
```

The record should contain:

* Order ID
* Cancelled by user
* Actor role
* Reason code
* Reason text where applicable
* Refund amount
* Timestamp

---

# 20. Order Status History

Cancellation must also create an entry in:

```text
order_status_history
```

Example:

```text
PENDING
→ CANCELLED_BY_CUSTOMER
```

---

# 21. Notification Rules

After successful cancellation, relevant parties should be notified.

Customer cancellation:

* Restaurant notification
* Customer confirmation
* Payment/refund notification where applicable

Restaurant cancellation:

* Customer notification
* Restaurant confirmation

Admin cancellation:

* Customer notification
* Restaurant notification where applicable
* Internal audit trail

Notification failure must not undo a successfully committed cancellation.

---

# 22. Risk Integration

Repeated cancellations may generate a risk event.

Example:

```text
REPEATED_ORDER_CANCELLATION
```

The Trust & Risk Engine determines whether repeated behavior results in:

```text
NORMAL
MONITORED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

Risk logic must not be hard-coded inside cancellation code.

---

# 23. Restaurant Closure

If a restaurant becomes unavailable while pending orders exist, the backend must evaluate each affected order individually.

The system must not blindly change every order without applying the appropriate cancellation workflow.

---

# 24. Rider Assignment

If an order is cancelled after rider assignment:

* Stop further dispatch actions
* Cancel/close the active delivery workflow
* Notify the rider
* Record the cancellation
* Process applicable financial adjustments
* Prevent further pickup actions

---

# 25. Already Picked-Up Orders

If an authorized admin/support workflow must cancel an order after pickup:

* The action must be explicitly authorized
* Rider delivery state must be reconciled
* Customer refund outcome must be calculated
* Restaurant financial outcome must be recorded
* Rider financial outcome must be recorded
* Full audit trail must be maintained

---

# 26. Delivered Orders

Delivered orders cannot be cancelled through the normal cancellation API.

Post-delivery problems must use:

```text
Support
Refund
Dispute
Complaint
```

workflows as applicable.

---

# 27. Cancellation API Rules

The cancellation endpoint must:

1. Authenticate the caller.
2. Determine caller role.
3. Load the authoritative order.
4. Check ownership/tenant access.
5. Check current state.
6. Evaluate Cancellation Rules Engine.
7. Validate reason.
8. Calculate refund outcome.
9. Perform state transition atomically.
10. Create cancellation record.
11. Create refund workflow if applicable.
12. Create audit/outbox records.
13. Return the authoritative result.

---

# 28. Error Codes

Examples:

```text
ORDER_NOT_FOUND
CANCELLATION_NOT_ALLOWED
ORDER_ALREADY_CANCELLED
ORDER_ALREADY_DELIVERED
INVALID_CANCELLATION_REASON
UNAUTHORIZED_CANCELLATION
REFUND_NOT_AVAILABLE
CANCELLATION_STATE_CHANGED
```

---

# 29. Audit Requirements

Audit:

* Who cancelled
* What role they had
* Which order
* Previous state
* New state
* Reason
* Refund amount
* IP address where applicable
* User agent where applicable
* Timestamp
* Admin override information

---

# 30. No Direct Database Cancellation

Application code must not directly set:

```text
orders.status = CANCELLED_...
```

without passing through the cancellation domain logic.

This prevents different application surfaces from implementing conflicting rules.

---

# 31. Configurability

Cancellation thresholds and business conditions that may change over time must be configurable.

Do not hard-code:

* Time limits
* Refund percentages
* Exception thresholds
* Risk thresholds

unless explicitly defined as immutable system behavior.

---

# 32. Testing Requirements

Test:

* Customer cancellation while PENDING
* Customer cancellation after restaurant acceptance
* Customer cancellation during PREPARING
* Cancellation after pickup
* Delivered order cancellation attempt
* Restaurant cancellation
* Admin cancellation
* Duplicate cancellation
* Concurrent cancellation
* Payment refund
* Partial refund
* Failed refund
* Rider assignment cancellation
* Restaurant closure
* Risk event creation
* Audit creation
* Notification failure

---

# 33. Implementation Rule

Claude Code must not invent:

* New cancellation states
* New cancellation permissions
* Refund percentages
* Cancellation deadlines
* New exception paths

Any change must update this document and the relevant API/database specifications first.

---

# 34. Definition of Done

Cancellation functionality is complete only when:

* Centralized cancellation service implemented
* Authorization implemented
* State validation implemented
* Refund handling implemented
* Idempotency implemented
* Concurrency protection implemented
* Audit logging implemented
* Risk integration implemented
* Notifications implemented
* Tests implemented
* Documentation synchronized

---

**End of CANCELLATION_RULES.md**
