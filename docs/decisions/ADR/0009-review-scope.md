# ADR-0009: Review Scope

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Reviews influence discovery and restaurant reputation, so their scope and integrity rules must be fixed before implementation.

## Decision

V1 reviews are **customer → restaurant** only, rating **1–5**, eligible only for **`DELIVERED`** orders, **one eligible review per order**.

Review statuses: `PUBLISHED`, `PENDING_MODERATION`, `HIDDEN`, `REMOVED`. Restaurant owners and authorized operators may respond. Rating aggregation is backend-owned.

## Consequences

* No rider ratings, AI sentiment, review rewards, or review photos/videos in V1.
* Moderation actions are audited.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/reviews/REVIEW_RULES.md` §3–7, §11, §15, §22, §49–50
* `docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §19–20
* `CLAUDE.md` §18
* `packages/types/src/review.ts`
