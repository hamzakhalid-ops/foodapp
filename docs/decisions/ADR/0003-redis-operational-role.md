# ADR-0003: Redis Operational Role

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Dispatch, rate limiting, presence and background jobs need fast, short-lived state. Treating that state as authoritative would risk data loss on eviction or restart.

## Decision

**Redis is used only for operational/temporary workloads**: caching, rate limiting, temporary state, presence, dispatch coordination (geospatial index, offers), short-lived locks, realtime coordination and BullMQ job queues.

Redis is **not** the durable source of truth for business records.

## Consequences

* Every Redis-held fact that matters for business correctness has a PostgreSQL record (e.g. `dispatch_offers`, `delivery_assignments`).
* Redis loss degrades performance/realtime, not correctness; the system recovers from PostgreSQL.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/architecture/ARCHITECTURE.md` §37
* `docs/database/DATABASE.md` §1
* `docs/infrastructure/INFRASTRUCTURE_RULES.md` §11–12
* `CLAUDE.md` §4
