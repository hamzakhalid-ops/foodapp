# ADR-0013: One Active Delivery per Rider

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Multi-order batching complicates dispatch, ETAs, earnings and failure handling.

## Decision

In V1 a rider has **at most one active delivery**. A rider with an active delivery is not eligible for new offers.

## Consequences

* Rider availability (`ONLINE + AVAILABLE` vs `ONLINE + BUSY`) reflects this rule.
* Batching/multi-order delivery requires a future ADR and configuration change.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/business-rules/DISPATCH_RULES.md` §8–9
* `docs/api/API_SPEC.md` §68
* `CLAUDE.md` §14
