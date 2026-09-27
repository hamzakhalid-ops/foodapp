# ADR-0006: Order Lifecycle

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Customers, restaurants, riders and admins all act on orders. A single, backend-owned state machine avoids competing lifecycles.

## Decision

The frozen primary lifecycle is:

```text
PENDING → RESTAURANT_ACCEPTED → PREPARING → READY_FOR_PICKUP
        → RIDER_ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
```

Cancellation states: `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_RESTAURANT`, `CANCELLED_BY_ADMIN`.

Only the backend order state machine performs transitions, each through a dedicated action endpoint, recorded in `order_status_history`. Cancellation eligibility is decided by the Cancellation Rules Engine.

## Consequences

* No frontend-only or additional order states.
* Every transition is transactional, writes history and emits an outbox event.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/business-rules/ORDER_RULES.md` §10–19
* `docs/business-rules/CANCELLATION_RULES.md`
* `docs/architecture/ARCHITECTURE.md` §11–15
* `docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §38
* `CLAUDE.md` §12–13
* `packages/types/src/order.ts`
