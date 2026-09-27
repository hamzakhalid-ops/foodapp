# ADR-0010: Promotion Scope

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Promotions affect order totals, restaurant earnings and platform revenue; unbounded promotion features would complicate financial correctness.

## Decision

V1 promotion types are **`PERCENTAGE`** and **`FIXED_AMOUNT`**. Statuses: `DRAFT`, `ACTIVE`, `PAUSED`, `EXPIRED`, `DISABLED`.

**One promotion per order; no stacking.** Eligibility and discount calculation are backend-authoritative and redemption is concurrency-safe.

## Consequences

* No referral, cashback, loyalty, subscriptions or complex segmentation in V1.
* Promotion usage is recorded (`promotion_usages`) and interacts with cancellations/refunds per the rules.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/promotions/PROMOTION_RULES.md` §3–6, §24–30
* `docs/promotions/PROMOTION_SPEC.md`
* `CLAUDE.md` §17
* `packages/types/src/promotion.ts`
