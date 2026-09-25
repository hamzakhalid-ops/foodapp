# QuickBite CI/CD Rules

**File:** `docs/devops/CI_CD_RULES.md`
**Status:** FROZEN V1
**Purpose:** Define the mandatory CI/CD rules for QuickBite development, testing, review, release, deployment, and rollback.

---

## 1. Purpose

These rules define how QuickBite code moves from development into staging and production.

The CI/CD system must provide:

* repeatable builds
* automated validation
* protected production deployments
* controlled database migrations
* reliable rollback
* environment isolation
* secret protection
* auditable releases
* consistent developer workflow

CI/CD must enforce the architecture and business rules already defined by the QuickBite specifications.

CI/CD must not introduce a second source of truth for application behavior.

---

# 2. Core Principles

## 2.1 Git Is the Source of Code History

Git is the authoritative source for:

* application code
* infrastructure configuration
* CI/CD configuration
* migrations
* tests
* documentation
* versioned configuration templates

Generated artifacts are not the source of truth.

---

## 2.2 CI Must Be Deterministic

CI should produce the same result from the same commit and dependency state.

Use:

* lockfiles
* pinned or controlled tool versions
* reproducible build commands
* deterministic migrations
* controlled environment variables
* isolated test environments

---

## 2.3 CI Must Fail Closed

If a required validation fails:

* the PR cannot merge
* the release cannot proceed
* the deployment cannot proceed

Do not bypass required CI checks merely to unblock a deployment.

Emergency procedures are explicitly documented and audited.

---

## 2.4 Production Is Protected

Production deployment must not be directly triggered by arbitrary developer code execution.

Production requires:

1. approved source
2. successful required CI
3. successful staging validation where applicable
4. production approval
5. controlled deployment
6. post-deployment verification

---

## 2.5 CI Does Not Replace Tests

CI executes the testing strategy.

The authoritative testing requirements remain in:

`docs/testing/TESTING_RULES.md`

and

`docs/testing/TESTING_SPEC.md`

---

# 3. Git Repository Rules

## 3.1 Main Branch

The primary integration branch is:

`main`

`main` must remain deployable.

Direct pushes to `main` are prohibited for normal development.

---

## 3.2 Feature Branches

Development occurs on short-lived branches.

Recommended naming:

```text
feature/<scope>-<description>
fix/<scope>-<description>
refactor/<scope>-<description>
docs/<scope>-<description>
test/<scope>-<description>
chore/<scope>-<description>
security/<scope>-<description>
hotfix/<scope>-<description>
```

Examples:

```text
feature/customer-checkout
fix/order-cancellation
feature/rider-dispatch
security/payment-webhook-validation
hotfix/payment-timeout
```

---

## 3.3 Branch Lifetime

Branches should remain small and focused.

Avoid long-lived branches containing unrelated work.

If a feature is large, split it into incremental vertical slices.

---

# 4. Commit Rules

Commits should be:

* focused
* understandable
* reviewable
* related to one logical change

Avoid:

* unrelated formatting changes
* generated-file noise
* unrelated refactors
* mixing multiple features
* large "everything changed" commits

Recommended commit format:

```text
type(scope): description
```

Examples:

```text
feat(checkout): create checkout validation flow
fix(dispatch): prevent duplicate rider assignment
test(payment): add refund idempotency coverage
docs(devops): define production deployment rules
```

Commit messages must describe the actual change.

---

# 5. Pull Request Rules

All normal changes to `main` require a pull request.

A PR should contain:

* purpose
* scope
* affected modules
* database changes
* API changes
* authorization implications
* business-rule implications
* notification/realtime implications
* financial implications
* risk implications
* testing performed
* migration requirements
* deployment considerations
* rollback considerations

Small documentation-only changes may use a lighter PR description where appropriate.

---

# 6. Pull Request Review

Required review depth depends on risk.

Higher-risk changes require additional scrutiny.

Examples:

* authentication
* authorization
* payments
* refunds
* financial calculations
* settlements
* payouts
* order state transitions
* dispatch
* risk restrictions
* database migrations
* production infrastructure
* secrets
* admin permissions

Reviewers must verify that the implementation follows the frozen specifications.

---

# 7. Required CI Pipeline

Every normal PR must run the applicable CI pipeline.

Minimum validation:

```text
Checkout
  ↓
Dependency installation
  ↓
Formatting/lint validation
  ↓
Type checking
  ↓
Unit tests
  ↓
Integration/API tests
  ↓
Database migration validation
  ↓
Security checks
  ↓
Build
  ↓
Artifact validation
```

Additional tests are required when affected by the change.

---

# 8. Formatting and Linting

CI must validate:

* formatting
* linting
* prohibited patterns
* project conventions

CI should use the repository's authoritative configuration.

Developers should be able to run the same checks locally.

---

# 9. Type Checking

Where the implementation language supports static typing, CI must run type checking.

Type errors must not be silently ignored.

Any intentional exception must be explicitly documented in code and approved through normal review.

---

# 10. Unit Tests

Unit tests must cover changed business logic.

Particularly important areas include:

* order rules
* cancellation rules
* promotion eligibility
* risk rules
* authorization
* payment state transitions
* financial calculations
* dispatch ranking/eligibility
* review eligibility
* notification rules

---

# 11. Integration Tests

Integration tests are required when changes affect:

* PostgreSQL
* Redis
* workers
* queues
* object storage
* external provider integrations
* transactions
* outbox events
* idempotency
* WebSockets
* payment flows

---

# 12. API Tests

API changes must include appropriate API-level validation.

Tests must verify:

* authentication
* authorization
* input validation
* response structure
* error handling
* resource ownership
* tenant isolation
* business-rule enforcement

Client-side validation must never be treated as the security boundary.

---

# 13. Database Migration Validation

Every database schema change must use a migration.

Never modify production schema manually as part of normal deployment.

CI must validate:

* migration syntax
* migration ordering
* migration application
* migration rollback strategy where supported
* compatibility with application code
* required indexes/constraints
* seed/test-data compatibility

Destructive migrations require special review.

---

# 14. Expand-and-Contract Migration Rule

Production schema changes that may conflict with running application versions should use an expand-and-contract approach.

Typical sequence:

```text
1. Add compatible schema
2. Deploy code using compatible schema
3. Backfill/transform data if required
4. Verify
5. Stop using old schema
6. Remove old schema in a later deployment
```

Do not deploy a schema change that immediately breaks the currently running application version unless the deployment strategy explicitly guarantees compatibility.

---

# 15. Security Checks

CI should include automated checks for:

* dependency vulnerabilities
* known insecure packages
* secret leakage
* unsafe configuration
* dependency lockfile integrity
* static security issues where applicable
* container/image vulnerabilities where containers are used
* infrastructure configuration issues where applicable

Security checks must not expose secret values in logs.

---

# 16. Secret Detection

Secrets must never be committed to Git.

Examples:

* database credentials
* payment keys
* API keys
* JWT signing secrets
* encryption keys
* webhook secrets
* cloud credentials
* notification provider credentials

CI should scan commits and repository content for accidental secret exposure.

If a secret is exposed:

1. revoke/rotate it
2. investigate usage
3. remove the secret from the repository/history where appropriate
4. audit affected systems
5. document the incident

Deleting the visible file alone is not sufficient if the secret remains usable.

---

# 17. Build Validation

CI must verify that the affected applications can build successfully.

Relevant applications include:

```text
apps/customer
apps/restaurant
apps/rider
apps/admin
backend
workers
```

Only affected components need to be rebuilt when the repository architecture permits selective builds.

Shared package changes may require rebuilding dependent applications.

---

# 18. Artifact Rules

Build artifacts must be:

* generated from a known commit
* traceable to that commit
* immutable where practical
* identifiable by version or commit SHA

Do not deploy an artifact whose source commit cannot be identified.

---

# 19. Environment Separation

QuickBite environments are separated:

```text
development
staging
production
```

Credentials, databases, storage, queues, and provider configurations must not be casually shared across environments.

Production credentials must never be used for local development or ordinary CI jobs.

---

# 20. Environment Configuration

Application code must not contain environment-specific secrets.

Use environment configuration/secrets management.

Required configuration must be validated during startup or deployment.

Missing critical production configuration should fail deployment rather than silently using unsafe defaults.

---

# 21. CI Environment

CI must use isolated credentials with the minimum permissions required.

CI should not have unrestricted production access.

Production credentials must only be available to the specific deployment job or mechanism that requires them.

---

# 22. Staging Deployment

A normal release should pass through staging before production.

Staging should validate:

* application startup
* database migrations
* API health
* worker health
* frontend builds
* critical customer flows
* critical restaurant flows
* critical rider flows
* admin access
* payment integration behavior
* notification delivery
* realtime behavior
* observability

---

# 23. Production Deployment Gate

Production deployment requires:

* successful required CI
* approved release
* required staging validation
* production authorization
* correct environment configuration
* migration readiness
* rollback readiness

The exact approval mechanism is defined by the deployment platform and repository configuration.

---

# 24. Release Versioning

Every production release must have a unique identifier.

At minimum, retain:

* Git commit SHA
* release identifier
* deployment timestamp
* environment
* deployed artifact
* migration version

Semantic versioning may be used for public application releases where appropriate.

Internal deployment identity must always remain traceable to Git.

---

# 25. Release Notes

Production releases should record:

* release identifier
* included changes
* migrations
* configuration changes
* known limitations
* operational considerations
* rollback considerations

Financial, security, or operationally sensitive changes should be explicitly identified.

---

# 26. Deployment Order

Where components have dependencies, deployment order must be intentional.

Typical sequence:

```text
Infrastructure/configuration
        ↓
Database compatible migration
        ↓
Backend/API
        ↓
Workers
        ↓
Frontend applications
        ↓
Post-deployment verification
```

The exact order may differ when the deployment architecture requires it.

The key requirement is compatibility between concurrently running components.

---

# 27. Rollback Rules

Every production deployment must have a rollback strategy.

Rollback may mean:

* deploying the previous application artifact
* reverting a compatible configuration
* disabling a feature
* reverting a release
* applying a forward database migration

Database rollback must not be assumed to mean simply reversing a migration.

Data-destructive changes require forward-recovery planning.

---

# 28. Failed Deployment

If deployment fails:

1. stop further rollout
2. inspect deployment health
3. determine whether the failure is application, infrastructure, migration, configuration, or dependency related
4. rollback or remediate according to the release plan
5. verify service health
6. record the incident/release failure
7. fix the underlying cause before retrying

Do not repeatedly redeploy the same failed release without understanding the failure.

---

# 29. Post-Deployment Verification

Production deployments must verify:

* health endpoints
* readiness
* API error rates
* database connectivity
* Redis connectivity
* worker processing
* queue health
* WebSocket connectivity
* notification processing
* payment integration
* dispatch processing
* critical business flows
* logs
* metrics
* alerts

The deployment is not considered complete until verification succeeds.

---

# 30. Feature Flags

Feature flags may be used for controlled rollout where useful.

Feature flags must have:

* clear ownership
* documented purpose
* safe default
* environment awareness
* auditability where operationally important
* removal plan when temporary

Do not create permanent feature flags for every feature.

---

# 31. Emergency Changes

Emergency production changes must still be:

* traceable to Git
* reviewed as soon as practical
* tested to the greatest practical extent
* audited
* documented

Emergency procedures must not become the normal deployment path.

---

# 32. Production Access

Production access must follow least privilege.

Developers should not receive unrestricted production credentials merely to simplify development.

Sensitive production operations should be performed through controlled tooling and auditable workflows.

---

# 33. CI/CD Logs

CI/CD logs must be retained according to the operational retention policy.

Logs must not expose:

* passwords
* tokens
* API keys
* payment credentials
* database credentials
* private customer information

---

# 34. CI/CD Auditability

For each production deployment, it must be possible to determine:

```text
Who approved it?
Which commit was deployed?
Which artifact was deployed?
When was it deployed?
Which migrations ran?
Which environment was targeted?
What validation passed?
What happened after deployment?
```

---

# 35. Dependency Updates

Dependency updates must pass normal CI.

Security updates may receive expedited handling when necessary.

Do not blindly upgrade large groups of dependencies in a production-critical change without validation.

---

# 36. Monorepo Rules

Because QuickBite contains multiple applications and shared packages:

```text
apps/customer
apps/restaurant
apps/rider
apps/admin
backend
packages/*
```

CI should support affected-component detection where practical.

A shared package change must trigger validation of dependent applications.

---

# 37. Documentation Changes

Changes to frozen architecture/business rules must update the corresponding documentation.

Code must not silently redefine:

* order states
* roles
* permissions
* financial rules
* cancellation rules
* dispatch rules
* risk rules
* promotion rules
* review rules
* support rules

If implementation requires a specification change, update the specification through the appropriate architecture/ADR process before implementation.

---

# 38. CI Failure Ownership

A failing CI pipeline must be treated as actionable engineering work.

Do not:

* ignore failures
* permanently disable checks
* mark important checks as non-blocking without reason
* merge around failed required checks

---

# 39. Definition of Merge-Ready

A PR is merge-ready when:

* required reviews are complete
* required CI passes
* tests are adequate
* migrations are reviewed
* security checks pass
* documentation is updated
* no frozen rule is silently changed
* deployment/rollback implications are understood

---

# 40. Frozen V1 Decisions

The following are frozen:

1. `main` is the primary integration branch.
2. Normal development occurs through short-lived branches.
3. Direct normal pushes to `main` are prohibited.
4. Required CI checks block merging.
5. Production is protected.
6. Production releases are traceable to Git commits.
7. Database changes require migrations.
8. Production-compatible schema evolution is required.
9. Secrets must not be stored in Git.
10. Production credentials are isolated from normal CI/development.
11. Staging validation precedes normal production deployment.
12. Every production deployment has a rollback/recovery strategy.
13. Post-deployment verification is mandatory.
14. CI/CD does not replace the authoritative QuickBite business specifications.
15. No microservice-specific CI/CD complexity is introduced merely for theoretical scalability.
