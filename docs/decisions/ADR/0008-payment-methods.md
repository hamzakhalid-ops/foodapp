# ADR-0008: Payment Methods

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

V1 must support the payment behaviour of its launch market while keeping financial integrity and a replaceable provider.

## Decision

V1 payment methods are **`ONLINE_PAYMENT`** and **`CASH_ON_DELIVERY`**.

Payment states: `PENDING`, `AUTHORIZED`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`.

Payment state is set only by the backend from verified provider confirmation (webhooks validated, idempotent). The provider is accessed through `PaymentService`.

## Consequences

* The client can never declare a payment successful.
* COD is subject to risk controls (`COD_RESTRICTED`).
* Payment and order state are separate state machines.
* The specific online payment provider is a pending owner decision; the abstraction keeps it replaceable.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/payments/PAYMENT_RULES.md` §3–4, §8–22
* `docs/payments/FINANCIAL_SPEC.md`
* `CLAUDE.md` §16
* `packages/types/src/payment.ts`
