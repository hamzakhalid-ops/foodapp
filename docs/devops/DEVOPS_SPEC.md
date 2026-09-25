# QuickBite DevOps Specification

**File:** `docs/devops/DEVOPS_SPEC.md`
**Status:** FROZEN V1
**Purpose:** Define the concrete DevOps workflow, CI/CD pipeline, release process, deployment controls, rollback process, environment management, and operational responsibilities for QuickBite.

---

# 1. Scope

This specification covers:

* repository workflow
* branching
* pull requests
* CI
* automated testing
* security validation
* builds
* artifacts
* database migrations
* staging
* production releases
* deployment approvals
* rollback
* versioning
* environment protection
* secrets
* release records
* emergency changes
* post-deployment validation

This specification works with:

* `docs/infrastructure/INFRASTRUCTURE_RULES.md`
* `docs/infrastructure/DEPLOYMENT_SPEC.md`
* `docs/testing/TESTING_RULES.md`
* `docs/testing/TESTING_SPEC.md`
* `docs/observability/OBSERVABILITY_RULES.md`
* `docs/observability/OBSERVABILITY_SPEC.md`
* `docs/security/AUTH_AUTHORIZATION.md`
* `docs/flows/GOLDEN_E2E_FLOW.md`

---

# 2. Repository Model

QuickBite uses a single repository containing:

```text
quickbite/
├── apps/
│   ├── customer/
│   ├── restaurant/
│   ├── rider/
│   └── admin/
├── backend/
├── packages/
├── tests/
├── infrastructure/
├── scripts/
├── docs/
├── CLAUDE.md
└── README.md
```

The repository contains application code, shared packages, tests, documentation, infrastructure configuration, and deployment configuration.

---

# 3. Git Workflow

## 3.1 Main Branch

```text
main
```

`main` represents the deployable integration state.

Branch protection must prevent normal direct pushes.

---

## 3.2 Development Flow

```text
Developer
    ↓
Feature/Fix Branch
    ↓
Local Validation
    ↓
Pull Request
    ↓
CI
    ↓
Code Review
    ↓
Merge
    ↓
main
    ↓
Staging
    ↓
Production Approval
    ↓
Production
```

---

# 4. Branch Naming

Use:

```text
feature/<scope>-<description>
fix/<scope>-<description>
refactor/<scope>-<description>
test/<scope>-<description>
docs/<scope>-<description>
chore/<scope>-<description>
security/<scope>-<description>
hotfix/<scope>-<description>
```

Branch names should be short and descriptive.

---

# 5. Pull Request Template

The repository should provide a standard PR template.

Recommended sections:

```text
## Summary

## Scope

## Changed Components

## Database Changes

## API Changes

## Authorization/Security

## Business Rules

## Notifications/Realtime

## Financial Impact

## Risk Impact

## Tests

## Migration Plan

## Deployment Plan

## Rollback Plan

## Documentation
```

Not every section requires content for every PR, but authors should explicitly state "Not applicable" where useful.

---

# 6. CI Pipeline Architecture

The primary CI pipeline is:

```text
Source Checkout
      ↓
Dependency Installation
      ↓
Repository Validation
      ↓
Formatting
      ↓
Lint
      ↓
Typecheck
      ↓
Unit Tests
      ↓
Integration Tests
      ↓
API Tests
      ↓
Migration Validation
      ↓
Security Scans
      ↓
Build
      ↓
Artifact Validation
      ↓
CI Result
```

Additional test suites run according to the affected scope.

---

# 7. Fast Feedback Pipeline

The first CI stage should run inexpensive checks early.

Recommended order:

```text
format
lint
typecheck
unit tests
```

Failures should stop unnecessary expensive jobs where appropriate.

---

# 8. Full Validation Pipeline

The full validation pipeline should cover:

* unit tests
* integration tests
* API tests
* database tests
* security tests
* migration validation
* build validation
* relevant E2E tests

For high-risk changes, the pipeline must execute the relevant specialized tests.

---

# 9. Affected-Component Detection

CI may detect affected components to reduce unnecessary work.

Examples:

```text
Customer frontend change
→ customer app validation

Restaurant frontend change
→ restaurant app validation

Shared package change
→ dependent application validation

Backend order module change
→ backend + relevant integration/API/E2E validation

Database schema change
→ migration + database + affected backend tests
```

Affected-component optimization must never skip required tests merely because the dependency graph is incorrectly configured.

---

# 10. Dependency Installation

Dependencies must be installed from repository lockfiles.

CI should fail if dependency metadata and lockfiles are inconsistent.

Dependency installation must not use untrusted arbitrary scripts without review.

---

# 11. Build Pipeline

Build all affected deployable artifacts.

Potential artifacts:

```text
customer-web
restaurant-app
rider-app
admin-panel
backend
worker
```

The exact artifact types depend on implementation technology.

Every artifact must be associated with:

* commit SHA
* build timestamp
* release identifier
* environment target where applicable

---

# 12. Artifact Promotion

Where practical:

```text
Build once
   ↓
Validate
   ↓
Deploy same artifact to staging
   ↓
Validate
   ↓
Promote same artifact to production
```

Avoid rebuilding different source states between staging and production.

---

# 13. Database Migration Pipeline

Database migrations are part of the release.

Before production:

```text
Validate migration
        ↓
Apply to staging
        ↓
Run tests
        ↓
Review production impact
        ↓
Approve release
        ↓
Apply production migration
        ↓
Deploy compatible application
        ↓
Verify
```

Migration execution must be controlled so multiple deployment processes cannot accidentally apply conflicting migrations simultaneously.

---

# 14. Migration Safety

Every migration must be reviewed for:

* table locks
* long-running operations
* index creation
* constraint changes
* data transformation
* nullability changes
* default values
* backward compatibility
* production data volume

Potentially expensive migrations require an explicit deployment plan.

---

# 15. Production Migration Strategy

When zero/minimal downtime is required:

```text
Compatible schema
      ↓
Application compatibility
      ↓
Data migration/backfill
      ↓
Application transition
      ↓
Old schema removal later
```

Do not combine destructive schema removal with an application release that still requires the removed structure.

---

# 16. CI Secrets

CI should use separate credentials for:

* test database
* test Redis
* test object storage
* staging
* production deployment

Credentials must be scoped to the minimum required permission.

---

# 17. Secret Injection

Secrets should be injected through the CI/CD platform's protected secret mechanism or the approved secret-management system.

Do not write secrets into:

* source files
* committed `.env` files
* Docker images
* build artifacts
* logs
* PR comments

---

# 18. Environment Variables

Use environment-specific configuration.

Example conceptual groups:

```text
APP_ENV
DATABASE_URL
REDIS_URL
OBJECT_STORAGE_CONFIG
PAYMENT_PROVIDER_CONFIG
MAPS_PROVIDER_CONFIG
NOTIFICATION_PROVIDER_CONFIG
JWT_CONFIG
WEBSOCKET_CONFIG
```

Actual secret names are implementation details and must follow the repository's environment configuration.

---

# 19. Development Environment

Development supports:

* local application execution
* local/test PostgreSQL
* local/test Redis
* local workers
* mock/sandbox external providers
* local WebSockets
* local object storage or development bucket

Development must not depend on production infrastructure.

---

# 20. Staging Environment

Staging is the production-like validation environment.

It should contain:

* staging database
* staging Redis
* staging object storage
* staging payment configuration
* staging notification configuration
* staging maps configuration
* staging frontend
* staging backend
* staging workers

Production customer data should not be copied into staging unless an approved process explicitly protects/redacts sensitive data.

---

# 21. Production Environment

Production contains the live system.

Production access is restricted.

Production deployment must be auditable.

Production configuration must be separated from staging and development.

---

# 22. CI Jobs

The CI system should logically separate jobs such as:

```text
validate
lint
typecheck
unit-tests
integration-tests
api-tests
database-tests
security
build
migration-check
e2e
```

The exact CI provider syntax is implementation-specific.

The required validation behavior is not.

---

# 23. Pull Request CI

Every normal PR should execute the required validation jobs.

Required checks must be configured as branch protection rules.

A PR cannot merge while a required check is failing.

---

# 24. Merge Validation

After merge to `main`, CI should run the appropriate integration/build pipeline again.

This protects against:

* merge conflicts
* incorrect branch assumptions
* race conditions between PRs
* stale test results

---

# 25. Staging Deployment Pipeline

A typical staging pipeline:

```text
main
 ↓
Build
 ↓
Artifact
 ↓
Migration validation
 ↓
Deploy staging
 ↓
Migration
 ↓
Health checks
 ↓
Smoke tests
 ↓
Critical E2E tests
 ↓
Observability validation
```

---

# 26. Production Release Pipeline

Production:

```text
Approved Release
      ↓
Verify CI
      ↓
Verify Artifact
      ↓
Verify Staging
      ↓
Verify Migration Plan
      ↓
Production Approval
      ↓
Deploy
      ↓
Migration
      ↓
Health Checks
      ↓
Smoke Tests
      ↓
Monitor
      ↓
Release Complete
```

---

# 27. Production Approval

Production deployment must have an explicit approval gate.

The approval mechanism may be:

* protected environment approval
* deployment approval
* release approval
* equivalent platform control

The mechanism must ensure an unauthorized CI job cannot independently deploy arbitrary code to production.

---

# 28. Deployment Strategies

V1 should use the simplest safe deployment strategy supported by the infrastructure.

Possible strategies include:

* rolling deployment
* blue/green
* controlled replacement

Do not introduce complex canary infrastructure unless there is a concrete operational requirement.

---

# 29. Rollback

Rollback must be defined before production deployment.

Application rollback:

```text
Current Release
     ↓
Detect failure
     ↓
Stop rollout
     ↓
Deploy previous known-good artifact
     ↓
Verify
```

Database rollback:

```text
Assess schema state
     ↓
Determine compatibility
     ↓
Use rollback only if safe
OR
apply forward-fix migration
```

Do not automatically reverse production migrations.

---

# 30. Feature-Level Rollback

For features controlled by flags:

```text
Release
 ↓
Enable feature
 ↓
Monitor
 ↓
Problem
 ↓
Disable feature
 ↓
Investigate
```

Feature flags do not replace deployment rollback when infrastructure or schema changes are involved.

---

# 31. Release Identification

Each release should have a unique release identifier.

Recommended conceptual format:

```text
<version>-<commit-sha>
```

For example:

```text
v1.4.0-a81f32c
```

The exact versioning strategy may evolve, but commit-level traceability is mandatory.

---

# 32. Release Record

A production release record should contain:

```text
Release ID
Commit SHA
Build artifact
Author
Approver
Deployment time
Environment
Migration version
Configuration changes
Feature flags
Deployment result
Rollback result, if applicable
```

---

# 33. Deployment Metadata

The running application should expose safe deployment metadata sufficient for operators to determine:

* application version
* commit/build identifier
* environment

Do not expose secrets or sensitive infrastructure information.

---

# 34. Health Checks

After deployment, validate:

```text
Application startup
Database connectivity
Redis connectivity
Worker health
Queue health
Object storage access
External provider connectivity
WebSocket readiness
```

Health checks must distinguish:

* liveness
* readiness
* dependency health where appropriate

---

# 35. Smoke Tests

Production smoke tests should validate critical paths without creating unnecessary real-world side effects.

Examples:

* public API availability
* authentication endpoint
* restaurant discovery
* menu retrieval
* backend health
* worker processing
* notification infrastructure
* WebSocket connectivity

Payment and order-creation smoke tests should use safe sandbox/test mechanisms where possible.

---

# 36. Critical Business Flow Verification

For a release affecting order processing, verify the relevant path:

```text
Customer
 ↓
Restaurant discovery
 ↓
Menu
 ↓
Checkout
 ↓
Order creation
 ↓
Restaurant processing
 ↓
Dispatch
 ↓
Rider delivery
 ↓
Completion
```

The complete golden E2E flow remains authoritative for business behavior.

---

# 37. Observability Integration

Every deployment should be observable through:

* structured logs
* metrics
* traces where implemented
* error tracking
* deployment markers
* alerts

The observability system must allow operators to correlate incidents with releases.

---

# 38. Deployment Monitoring Window

After production deployment, actively monitor:

* HTTP error rate
* latency
* database errors
* Redis errors
* worker failures
* queue backlog
* WebSocket failures
* notification failures
* payment failures
* dispatch failures
* authentication failures

The exact thresholds come from the observability specification.

---

# 39. Automatic Rollback

Automatic rollback may be used for clearly defined infrastructure/deployment failures where safe.

Do not automatically rollback based solely on ambiguous business metrics without an explicit, tested rollback policy.

Financial or data-changing systems require particular caution.

---

# 40. Emergency Hotfix

Emergency flow:

```text
Issue
 ↓
Create hotfix branch
 ↓
Minimal targeted change
 ↓
Run required validation
 ↓
Review/approval
 ↓
Deploy
 ↓
Verify
 ↓
Merge hotfix back into main
```

Do not leave production-only code permanently disconnected from `main`.

---

# 41. Failed Production Release

If a release fails:

1. stop rollout
2. preserve deployment information
3. inspect logs/metrics/traces
4. determine failure class
5. rollback or apply approved remediation
6. verify recovery
7. record incident
8. identify root cause
9. add regression coverage where appropriate

---

# 42. CI/CD Failure Categories

Classify failures where useful:

```text
CODE
TEST
BUILD
DEPENDENCY
MIGRATION
CONFIGURATION
SECRET
INFRASTRUCTURE
EXTERNAL_PROVIDER
DEPLOYMENT
PERMISSION
```

This improves operational diagnosis.

---

# 43. Dependency Failure

If an external dependency fails during deployment:

* do not expose credentials
* preserve deployment logs
* determine whether deployment can safely continue
* avoid partial incompatible deployment
* use the documented provider fallback where applicable

---

# 44. External Provider Configuration

Production configuration for:

* payment provider
* maps provider
* notification provider
* object storage

must be environment-specific.

Provider credentials and endpoints must not be hard-coded.

Provider abstraction remains at the application layer.

---

# 45. Worker Deployment

Workers must be deployed compatibly with the backend.

If an event or job schema changes:

1. preserve backward compatibility where necessary
2. deploy compatible consumers
3. deploy producers
4. remove obsolete behavior only after the transition

This is particularly important for:

* outbox events
* notifications
* payment events
* dispatch jobs
* settlement jobs

---

# 46. Queue Compatibility

Job payload changes must consider workers already running older code.

Prefer versioned or backward-compatible payloads where required.

Do not deploy a producer that immediately generates jobs older workers cannot process unless the deployment guarantees that no old worker remains active.

---

# 47. WebSocket Deployment

WebSocket changes must account for existing connections.

The deployment must support:

* reconnect
* authentication
* channel authorization
* duplicate event handling
* event ordering requirements
* compatible event payloads

---

# 48. Cache Compatibility

Redis/cache changes must not assume that all cached values disappear immediately.

Application code should tolerate:

* missing cache
* stale cache
* expired cache
* incompatible old cache values where applicable

Cache invalidation must not become the source of durable business truth.

---

# 49. Documentation and DevOps Changes

Changes to deployment architecture require updates to:

```text
docs/infrastructure/
docs/devops/
docs/observability/
docs/testing/
```

where applicable.

Changes affecting architecture require an ADR.

---

# 50. Access Control

Deployment permissions should follow:

```text
Developer
    ↓
Code contribution
    ↓
CI validation
    ↓
Reviewer
    ↓
Release approval
    ↓
Production deployment
```

No role should receive broader access merely for convenience.

---

# 51. Auditability

The system must retain enough information to reconstruct:

```text
commit
→ PR
→ review
→ CI
→ artifact
→ staging
→ approval
→ production deployment
→ verification
```

This is particularly important for financial and security-sensitive systems.

---

# 52. Production Change Freeze

During major incidents or sensitive operational periods, production changes may be temporarily restricted.

Emergency changes remain possible through the emergency procedure.

The freeze must not prevent critical security or reliability remediation.

---

# 53. Backup Before Risky Changes

Before high-risk database operations or infrastructure changes, verify that required backups exist and are recoverable according to the infrastructure specification.

A backup that has never been tested for restoration must not be treated as fully reliable disaster recovery.

---

# 54. Disaster Recovery Relationship

CI/CD is not the disaster recovery system.

CI/CD provides:

* redeployment
* artifact recovery
* migration control
* infrastructure configuration

Disaster recovery additionally depends on:

* database backups
* object storage recovery
* infrastructure recovery
* secrets recovery
* provider recovery
* documented restoration procedures

---

# 55. Developer Local Workflow

Developers should be able to run the important CI checks locally.

Recommended:

```text
install
format
lint
typecheck
test
build
```

The repository should provide convenient scripts/commands for these operations.

---

# 56. Claude Code Compatibility

Before implementing a feature, Claude Code must follow the repository development rules.

It must:

1. read `CLAUDE.md`
2. identify authoritative specifications
3. inspect affected modules
4. inspect dependencies
5. inspect database implications
6. inspect API implications
7. inspect authorization
8. inspect business rules
9. inspect notifications/realtime
10. inspect financial/risk implications
11. inspect tests
12. identify ambiguity
13. ask before inventing behavior
14. implement
15. run validation
16. update documentation when required

CI is the final automated enforcement layer, not a replacement for this workflow.

---

# 57. Recommended Repository Scripts

The implementation should expose consistent commands conceptually equivalent to:

```text
dev
lint
format
format:check
typecheck
test
test:unit
test:integration
test:e2e
test:api
db:migrate
db:validate
build
security:check
```

Exact package-manager syntax is implementation-specific.

---

# 58. CI Configuration Location

CI configuration should live in the repository's standard CI configuration directory.

For example, depending on the selected CI provider:

```text
.github/workflows/
```

or the provider's equivalent.

Do not maintain duplicate independent CI systems unless there is a documented requirement.

---

# 59. Deployment Configuration

Infrastructure/deployment configuration belongs under the repository infrastructure/deployment structure defined by Phase 16.

DevOps configuration should reference those definitions rather than duplicating infrastructure architecture.

---

# 60. Production Release Checklist

Before production:

```text
[ ] Correct commit
[ ] Required PR approvals
[ ] CI passing
[ ] Security checks passing
[ ] Build successful
[ ] Artifact identified
[ ] Migration reviewed
[ ] Staging deployment successful
[ ] Staging smoke tests successful
[ ] Production configuration verified
[ ] Secrets verified
[ ] Rollback plan confirmed
[ ] Monitoring ready
[ ] Production approval obtained
```

---

# 61. Post-Deployment Checklist

After production:

```text
[ ] Deployment completed
[ ] Application healthy
[ ] Database healthy
[ ] Redis healthy
[ ] Workers healthy
[ ] Queue healthy
[ ] WebSockets healthy
[ ] Notifications healthy
[ ] Payment integration healthy
[ ] Dispatch healthy
[ ] Error rates normal
[ ] Critical smoke tests passed
[ ] No unexpected alerts
[ ] Release marked successful
```

---

# 62. V1 DevOps Decisions

The following decisions are frozen:

### Repository

```text
Single repository
main = primary integration branch
short-lived feature/fix branches
protected main
PR-based normal changes
```

### CI

```text
Formatting
Lint
Typecheck
Unit tests
Integration/API tests
Migration validation
Security checks
Build validation
Relevant E2E
```

### Deployment

```text
Development
    ↓
Staging
    ↓
Production approval
    ↓
Production
```

### Release

```text
Git commit
    ↓
CI
    ↓
Artifact
    ↓
Staging
    ↓
Approval
    ↓
Production
```

### Database

```text
Schema changes require migrations
Production migrations require compatibility planning
Destructive changes require special review
```

### Security

```text
Secrets are never committed
Production credentials are protected
CI uses least privilege
Production deployment is authorization-controlled
```

### Reliability

```text
Rollback/recovery plan required
Post-deployment verification required
Observability required
Deployment must be traceable
```

---

# 63. Non-Goals

V1 does not require:

* Kubernetes-specific CI/CD complexity
* multi-region deployment
* multi-cloud deployment
* complex progressive delivery
* permanent canary infrastructure
* dozens of independent pipelines
* microservice-specific deployment orchestration
* elaborate release train management
* unnecessary Git branching models

Complexity must be justified by a real QuickBite operational requirement.

---

# 64. Final DevOps Principle

QuickBite DevOps must make the path from code to production:

```text
Predictable
Repeatable
Secure
Auditable
Tested
Reversible
```

while remaining simple enough for the V1 modular-monolith architecture.

The CI/CD system must enforce the specifications rather than silently redefining them.
