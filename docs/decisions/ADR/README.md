# Architecture Decision Records

Location: `docs/decisions/ADR/` (`docs/architecture/ARCHITECTURE.md` §68, `docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §47–48).

ADR-0001 … ADR-0013 **record** decisions that were already frozen in the V1 specifications, so
that they are discoverable in one place and are not re-litigated during implementation. They do
not introduce new product decisions.

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-0001](0001-modular-monolith.md) | Modular Monolith | Accepted |
| [ADR-0002](0002-postgresql-source-of-truth.md) | PostgreSQL as Source of Truth | Accepted |
| [ADR-0003](0003-redis-operational-role.md) | Redis Operational Role | Accepted |
| [ADR-0004](0004-restaurant-role-consolidation.md) | Restaurant Role Consolidation | Accepted |
| [ADR-0005](0005-backend-authority.md) | Backend Authority | Accepted |
| [ADR-0006](0006-order-lifecycle.md) | Order Lifecycle | Accepted |
| [ADR-0007](0007-dispatch-architecture.md) | Dispatch Architecture | Accepted |
| [ADR-0008](0008-payment-methods.md) | Payment Methods | Accepted |
| [ADR-0009](0009-review-scope.md) | Review Scope | Accepted |
| [ADR-0010](0010-promotion-scope.md) | Promotion Scope | Accepted |
| [ADR-0011](0011-outbox-pattern.md) | Outbox Pattern | Accepted |
| [ADR-0012](0012-idempotency.md) | Idempotency | Accepted |
| [ADR-0013](0013-one-active-delivery-per-rider.md) | One Active Delivery per Rider | Accepted |

## When to write a new ADR

Create a new ADR (next free number, `NNNN-kebab-title.md`) when:

* a significant architectural decision changes (architecture, provider, database architecture, security, deployment), or
* a genuine contradiction between specifications must be resolved, or
* an intentional deviation from a frozen rule is approved.

Process (`ARCHITECTURE_CONSISTENCY_REVIEW.md` §48): identify conflict → affected documents → impact →
proposed resolution → **owner approval** → ADR → update specifications → implement.

Do not create an ADR merely to restate an already-settled rule.

## Template

```markdown
# ADR-NNNN: Title

| Field | Value |
|-------|-------|
| Status | Proposed / Accepted / Superseded by ADR-XXXX |
| Date | YYYY-MM-DD |
| Deciders | ... |
| Supersedes | ... |

## Context
## Decision
## Consequences
## Affected specifications
```
