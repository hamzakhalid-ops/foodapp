# ADR-0004: Restaurant Role Consolidation

| Field | Value |
|-------|-------|
| Status | Accepted — records a frozen V1 decision |
| Date recorded | 2026-09-27 |
| Deciders | QuickBite project owner (frozen in Phases 1–18) |
| Supersedes | — |

> This ADR **records** a decision already frozen in the specifications listed under *Sources*. It introduces no new behavior. If this ADR and a source specification ever appear to differ, the specification is authoritative and the difference must be reported as a conflict (`docs/ARCHITECTURE_CONSISTENCY_REVIEW.md` §53).

## Context

Restaurants have owners, managers, order staff and kitchen staff in the real world. Modelling each as a role increases authorization complexity without V1 benefit.

## Decision

V1 has exactly two restaurant roles: **`RESTAURANT_OWNER`** and **`RESTAURANT_OPERATOR`**. Manager, order staff and kitchen staff are consolidated into `RESTAURANT_OPERATOR`. The owner controls sensitive financial/account operations.

The complete frozen role set is: `CUSTOMER`, `RESTAURANT_OWNER`, `RESTAURANT_OPERATOR`, `RIDER`, `ADMIN`, `SUPER_ADMIN`.

## Consequences

* No `RESTAURANT_MANAGER`, `ORDER_STAFF`, `KITCHEN_STAFF` or `DELIVERY_MANAGER` roles are created.
* Operator access is always tenant-scoped to the restaurants the operator belongs to (`restaurant_staff`).
* Finer-grained permissions, if ever needed, require a new ADR.

## Changing this decision

Requires an explicit project-owner decision, a new ADR that supersedes this one, and updates to every source specification before implementation.

## Sources

* `docs/product/PRD.md` §3
* `docs/architecture/ARCHITECTURE.md` §8
* `docs/security/AUTH_AUTHORIZATION.md`
* `CLAUDE.md` §5
* `packages/types/src/roles.ts`
