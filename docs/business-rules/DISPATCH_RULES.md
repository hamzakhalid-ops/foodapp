# QuickBite — Delivery Dispatch Business Rules

**Version:** 1.0
**Status:** Approved for Implementation

---

## 1. Purpose

This document defines the authoritative rules for assigning delivery orders to riders.

QuickBite uses a dedicated:

```text
Delivery Dispatch Engine
```

The Dispatch Engine is backend-controlled.

The frontend must never directly assign riders.

---

# 2. Dispatch Trigger

Dispatch begins when:

```text
Order Status = READY_FOR_PICKUP
```

The backend emits a dispatch event.

Example:

```text
order.ready_for_pickup
```

The Dispatch Engine consumes this event.

---

# 3. Dispatch Flow

The standard flow is:

```text
Restaurant marks order READY
        ↓
Dispatch Engine
        ↓
Find eligible riders
        ↓
Filter by proximity
        ↓
Check availability
        ↓
Check active deliveries
        ↓
Check vehicle eligibility
        ↓
Check account status
        ↓
Check risk restrictions
        ↓
Rank eligible riders
        ↓
Create offer
        ↓
Rider accepts
        ↓
Assign rider
```

---

# 4. Rider Eligibility

A rider must normally satisfy all required conditions:

```text
APPROVED
ACTIVE
ONLINE
AVAILABLE
```

The rider must also:

* Be within the configured dispatch radius
* Not be suspended
* Not be restricted from delivery activity
* Not have an incompatible active delivery
* Have an eligible vehicle/type where required

---

# 5. Rider Proximity

Orders must only be offered to riders within an appropriate configurable distance from the restaurant.

Initial radius is configurable.

Example configuration:

```text
initial_radius
radius_increment
maximum_radius
```

These values must not be hard-coded into business logic.

---

# 6. Radius Expansion

If no suitable rider accepts the order:

```text
Initial Radius
↓
Expanded Radius
↓
Further Expanded Radius
↓
Maximum Radius
```

The Dispatch Engine must stop expansion at the configured maximum.

---

# 7. No Global Broadcast

QuickBite must not broadcast every order to every online rider.

The Dispatch Engine must first filter for eligibility and proximity.

This reduces:

* Rider notification spam
* Race conditions
* Unnecessary traffic
* Poor rider experience

---

# 8. Rider Availability

A rider marked:

```text
is_available = false
```

must not receive a new dispatch offer.

Online status alone does not mean the rider is available.

---

# 9. Active Delivery

A rider with an active delivery must normally not receive another offer unless future configuration explicitly permits multi-order batching.

V1 should assume:

```text
one active delivery per rider
```

unless explicitly changed.

---

# 10. Rider Account Status

Riders who are:

```text
SUSPENDED
REJECTED
```

must not receive dispatch offers.

---

# 11. Risk Restrictions

Dispatch must consider rider risk restrictions.

For example:

```text
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

may prevent dispatch.

Risk decisions are governed by:

```text
RISK_RULES.md
```

---

# 12. Restaurant Eligibility

The restaurant must still be associated with the active delivery/order.

The restaurant's status must not invalidate the order workflow.

If the restaurant becomes suspended or unavailable after an order is ready, the Dispatch Engine must follow the appropriate operational workflow rather than blindly assigning a rider.

---

# 13. Dispatch Ranking

Eligible riders may be ranked using configurable factors such as:

* Distance to restaurant
* Estimated arrival time
* Rider availability
* Current workload
* Reliability
* Service zone
* Vehicle eligibility

The ranking algorithm must remain configurable.

---

# 14. Ranking Authority

The ranking result is produced by the backend Dispatch Engine.

The client must not determine:

```text
which rider gets the order
```

---

# 15. Dispatch Offer

An offer is represented in:

```text
dispatch_offers
```

Each offer should include:

* Order ID
* Rider ID
* Offer status
* Offered timestamp
* Expiration timestamp
* Response timestamp
* Distance to restaurant
* Estimated arrival time
* Rejection reason

---

# 16. Offer States

Supported V1 states:

```text
OFFERED
ACCEPTED
REJECTED
EXPIRED
CANCELLED
```

---

# 17. Offer Expiration

Offers must expire after:

```text
offer_timeout_seconds
```

The value is configurable.

An expired offer cannot later become a valid assignment.

---

# 18. Rider Accept

When a rider accepts an offer:

The backend must verify:

* Offer still exists
* Offer has not expired
* Offer belongs to rider
* Rider is still eligible
* Order is still available
* No other rider has already accepted
* Delivery is not cancelled

If valid, assignment occurs atomically.

---

# 19. Race Conditions

Example:

Two riders receive offers.

Both accept at almost the same time.

Only one rider may become the assigned rider.

The backend must enforce atomic assignment.

The second rider receives a business-state conflict.

Example:

```text
DELIVERY_ALREADY_ASSIGNED
```

---

# 20. Assignment

Successful assignment creates:

```text
delivery_assignments
```

and updates the active delivery/order state.

Order:

```text
READY_FOR_PICKUP
→ RIDER_ASSIGNED
```

Delivery:

```text
PENDING
→ ASSIGNED
```

---

# 21. Assignment Idempotency

Repeated rider acceptance requests must not create duplicate assignments.

The assignment operation must be idempotent.

---

# 22. Offer Rejection

A rider may reject an offer.

The system should record:

* Rider
* Order
* Reason where applicable
* Timestamp

The Dispatch Engine may then offer the order to another eligible rider.

---

# 23. Offer Expiration

If a rider does not respond before expiration:

```text
OFFERED
→ EXPIRED
```

The order remains dispatchable unless another valid assignment exists.

---

# 24. Dispatch Failure

If no rider can be assigned within the configured dispatch process:

The order must remain in an operationally recoverable state.

The system may:

* Expand the radius
* Retry dispatch
* Notify operations
* Create an internal alert

The system must not falsely mark the order as delivered or assigned.

---

# 25. Rider Goes Offline

If a rider goes offline before accepting an offer:

The offer should no longer be considered valid if eligibility requires online status.

If a rider goes offline after assignment:

The active delivery must be handled by the delivery exception/reassignment workflow.

---

# 26. Rider Becomes Ineligible

If the rider becomes:

* Suspended
* Restricted
* Unavailable
* Otherwise ineligible

before acceptance, the offer must be invalidated.

If this occurs after assignment, the backend must initiate the appropriate reassignment/exception workflow.

---

# 27. Restaurant Pickup

After assignment:

```text
RIDER_ASSIGNED
```

The rider proceeds to the restaurant.

The rider may transition the delivery to:

```text
ARRIVING_AT_RESTAURANT
```

when supported.

---

# 28. Pickup

Pickup requires:

* Correct rider
* Correct delivery
* Ready order
* Active assignment

After pickup:

```text
RIDER_ASSIGNED
→ PICKED_UP
```

Delivery:

```text
ASSIGNED
→ PICKED_UP
```

---

# 29. Out for Delivery

After pickup:

```text
PICKED_UP
→ OUT_FOR_DELIVERY
```

The rider may then proceed to the customer.

---

# 30. Delivery Completion

Only the assigned rider or authorized administrative workflow may complete the delivery.

Required state:

```text
OUT_FOR_DELIVERY
```

Result:

```text
DELIVERED
```

---

# 31. Location Data

Current rider location may be stored in Redis for dispatch and realtime purposes.

Historical location events should only be persisted where operationally necessary.

Location collection must respect privacy and retention requirements.

---

# 32. Location Quality

Dispatch should account for location quality where available.

Potential inputs:

* Latitude
* Longitude
* Accuracy
* Timestamp

Stale location data should not be treated as current without appropriate validation.

---

# 33. Redis Usage

Redis may be used for:

* Current rider location
* Rider online presence
* Rider availability
* Geospatial lookup
* Temporary dispatch state
* Offer expiration
* Short-lived locks

PostgreSQL remains the durable source of truth for assignment and financial state.

---

# 34. Dispatch Configuration

The following should be configurable:

```text
initial_radius
radius_increment
maximum_radius
offer_timeout_seconds
max_offer_attempts
```

Additional ranking factors may be configured later.

---

# 35. Maximum Attempts

Dispatch should respect:

```text
max_offer_attempts
```

If maximum attempts are reached, the order enters an operational exception workflow.

The order must not silently disappear.

---

# 36. Dispatch Retry

Temporary technical failures may be retried.

Examples:

* Redis unavailable
* Worker temporarily unavailable
* Network failure
* Notification failure

Retries must use controlled backoff and idempotency.

---

# 37. Dispatch Events

Important events include:

```text
order.ready_for_pickup
dispatch.started
dispatch.offer_created
dispatch.offer_expired
dispatch.offer_rejected
dispatch.offer_accepted
delivery.assigned
delivery.picked_up
delivery.out_for_delivery
delivery.delivered
dispatch.failed
```

Events must be safely retryable.

---

# 38. Cancellation Integration

If an order is cancelled:

* Pending offers must be cancelled
* Future offers must stop
* Active assignment must be reconciled
* Rider must be notified where necessary
* Financial consequences must be processed
* Audit trail must be preserved

Cancellation rules are governed by:

```text
CANCELLATION_RULES.md
```

---

# 39. Notifications

Riders should receive:

* New delivery offers
* Offer expiration
* Assignment confirmation
* Cancellation
* Operational updates

Notifications must not be treated as proof of assignment.

The database assignment remains authoritative.

---

# 40. Security

A rider must not be able to:

* Accept another rider's offer
* View arbitrary delivery offers
* Modify assignment IDs
* Assign themselves manually
* Mark another rider's delivery as picked up
* Complete another rider's delivery

All authorization is server-side.

---

# 41. Audit

Audit important administrative dispatch actions:

* Manual assignment
* Manual reassignment
* Forced unassignment
* Dispatch override
* Rider restriction override
* Administrative completion

---

# 42. Manual Admin Assignment

Admin may manually assign a rider when necessary.

The action must:

* Verify rider eligibility
* Verify order state
* Create assignment
* Record reason
* Audit actor
* Prevent duplicate assignments

---

# 43. Reassignment

Reassignment may occur when:

* Rider cancels/declines after assignment where permitted
* Rider becomes unavailable
* Rider is suspended
* Operational issue occurs
* Admin intervenes

Reassignment must preserve assignment history.

The previous assignment must not simply be overwritten.

---

# 44. Dispatch Data Integrity

The system must maintain consistency among:

```text
orders
deliveries
dispatch_offers
delivery_assignments
```

A rider assignment must correspond to a valid delivery.

---

# 45. Testing Requirements

Test:

* Rider eligibility
* Radius filtering
* Radius expansion
* Ranking
* Offer expiration
* Offer rejection
* Offer acceptance
* Simultaneous acceptance
* Duplicate acceptance
* Rider going offline
* Rider suspension
* Order cancellation
* Assignment reassignment
* Redis failure
* Worker failure
* Notification failure
* Location staleness
* Maximum attempts
* Manual admin assignment

---

# 46. Implementation Rule

Claude Code must not invent:

* Dispatch radius values
* Offer timeout values
* Ranking weights
* Maximum attempts
* New delivery states
* New assignment states
* Multi-order batching behavior

Any such change must first be approved and documented.

---

# 47. Definition of Done

Dispatch is complete only when:

* Eligibility engine implemented
* Geospatial lookup implemented
* Configurable radius implemented
* Offer system implemented
* Offer expiration implemented
* Atomic assignment implemented
* Concurrency protection implemented
* Reassignment implemented
* Rider authorization implemented
* Realtime notifications implemented
* Audit logging implemented
* Failure/retry handling implemented
* Unit tests implemented
* Integration tests implemented
* E2E dispatch tests implemented
* Documentation synchronized

---

**End of DISPATCH_RULES.md**
