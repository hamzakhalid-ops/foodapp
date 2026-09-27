# ADR-0001: Modular Monolith

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

QuickBite has many domains (orders, payments, restaurants, riders, dispatch, risk, earnings, notifications). V1 needs reliable cross-domain transactions (e.g. order + payment record + status history + event) and a simple deployment footprint.

## Decision

QuickBite V1 is a **modular monolith**: one backend codebase and build artifact (NestJS), deployed as an API process and a worker process, with strict in-process module boundaries.

* Modules own their tables and expose services; other modules do not access those tables directly.
* Microservices are not introduced without a new approved ADR.

## Consequences

* Critical multi-domain operations can use a single PostgreSQL transaction.
* Deployment is limited to API, worker, PostgreSQL, Redis (plus object storage and providers).
* Boundaries must be kept disciplined so modules could be extracted later if ever justified.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/architecture/ARCHITECTURE.md` §1–4, §72
* `docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §3, §52
* `CLAUDE.md` §4
* `backend/src/modules/README.md`
