# ADR-0002: PostgreSQL as Source of Truth

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Orders, payments, earnings, settlements and audit records must be durable, consistent and auditable. Several subsystems (Redis, realtime, caches) hold copies or transient state.

## Decision

**PostgreSQL is the single durable source of truth** for all business records. Access is through Prisma; schema changes only through version-controlled migrations; money as `NUMERIC(12,2)` with currency; timestamps timezone-aware (UTC).

## Consequences

* Any state held elsewhere (Redis, client caches, realtime payloads) is derived and must be recoverable from PostgreSQL.
* Foreign keys, constraints and indexes protect integrity at the database level.
* The schema follows `docs/database/DATABASE.md`; tables are not invented for convenience.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/database/DATABASE.md` §1–2, §64–68, §73
* `docs/architecture/ARCHITECTURE.md` §36
* `CLAUDE.md` §8
