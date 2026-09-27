# ADR-0005: Backend Authority

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Four client applications display prices, totals, statuses and eligibility. Clients can be modified or replay requests; client-computed values cannot be trusted.

## Decision

**The backend is authoritative** for prices, menu availability, discounts, promotion eligibility, order totals, payment and refund status, order status, restaurant availability, rider assignment and eligibility, cancellation eligibility, earnings, settlements, payouts, permissions, risk status, review eligibility and status, and rating aggregation.

Client-provided values for these are presentation/input only. Authorization is always enforced server-side.

## Consequences

* The backend recalculates totals at checkout and order creation.
* Shared frontend packages contain vocabulary and input-shape validation only — never business rules.
* Generic client-controlled status mutation endpoints are forbidden (`API_SPEC.md` §147).

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `CLAUDE.md` §6–7
* `docs/api/API_SPEC.md` §146–147
* `docs/business-rules/ORDER_RULES.md` §2
* `docs/payments/PAYMENT_RULES.md` §2
