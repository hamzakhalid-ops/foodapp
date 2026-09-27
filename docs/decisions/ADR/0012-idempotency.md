# ADR-0012: Idempotency

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Mobile networks cause retries. Duplicate order creation, payment, refund, settlement or payout would cause financial damage.

## Decision

Retry-sensitive operations require an **`Idempotency-Key`** header and use the existing **`idempotency_keys`** table (key, user, endpoint, request hash, stored response, expiry).

Reusing a key with a different request returns `IDEMPOTENCY_REQUEST_MISMATCH`. No parallel idempotency mechanism is introduced.

## Consequences

* Applies at least to order creation, payment creation/confirmation, refunds, settlement processing and payout initiation (and review creation / promotion redemption where applicable).
* Clients generate one key per logical operation and reuse it on retry (`@quickbite/api-client` `createIdempotencyKey`).

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/api/API_SPEC.md` §15
* `docs/database/DATABASE.md` §61
* `docs/architecture/ARCHITECTURE.md` §41
* `CLAUDE.md` §10
