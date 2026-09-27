# ADR-0011: Outbox Pattern

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

A business change can commit while its follow-up event (notification, realtime update, risk processing) is lost if the process crashes between the two.

## Decision

Critical domain events are written to **`outbox_events` in the same database transaction** as the business record. A background worker (BullMQ) processes outbox events and performs external/asynchronous effects.

External providers are **never** called inside critical database transactions.

## Consequences

* Event consumers must be idempotent (events may be delivered more than once).
* Outbox infrastructure is established before the first critical event-driven workflow (`IMPLEMENTATION_PLAN.md` §24).

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/architecture/ARCHITECTURE.md` §54–56
* `docs/database/DATABASE.md` §62
* `docs/testing/TESTING_SPEC.md` §31–32
* `CLAUDE.md` §9, §11
