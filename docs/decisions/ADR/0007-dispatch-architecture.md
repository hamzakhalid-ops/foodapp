# ADR-0007: Dispatch Architecture

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Broadcasting every delivery to every rider causes contention, unfairness and privacy exposure. Assignment must be safe under concurrent acceptance.

## Decision

When an order becomes `READY_FOR_PICKUP`, the backend **Dispatch Engine** determines eligible riders (proximity, online, available, no conflicting active delivery, vehicle eligibility, account status, risk restrictions), ranks them, creates offers, and performs an **atomic, idempotent assignment** on acceptance.

Radius expansion and timing are configuration: `initial_radius`, `radius_increment`, `maximum_radius`, `offer_timeout_seconds`, `max_offer_attempts`.

Orders are **never globally broadcast**. The rider app never assigns itself.

## Consequences

* Redis geospatial data supports candidate discovery; PostgreSQL records offers and assignments.
* Double assignment is prevented by transactional/locking guarantees and tested with race tests.
* Admin intervention cannot bypass eligibility and is audited.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/business-rules/DISPATCH_RULES.md` §2–24, §34
* `docs/architecture/ARCHITECTURE.md` §16–21
* `docs/api/API_SPEC.md` §70–72
* `CLAUDE.md` §14
