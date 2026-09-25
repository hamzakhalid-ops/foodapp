# QuickBite Deployment Specification

**Path:** `docs/infrastructure/DEPLOYMENT_SPEC.md`

**Status:** FROZEN
**Phase:** 16 — Infrastructure & Deployment

---

# 1. Purpose

This document defines the deployment architecture for QuickBite.

It specifies how the following components are deployed and operated:

* Customer App
* Restaurant App
* Rider App
* Admin Panel
* Backend API
* Background workers
* PostgreSQL
* Redis
* object storage
* realtime infrastructure
* external integrations

---

# 2. Deployment Architecture

Conceptual production architecture:

```text
                    Internet
                       │
                       ▼
                DNS / Edge / TLS
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
     Frontend Apps              Backend API
          │                         │
          │             ┌───────────┼─────────────┐
          │             │           │             │
          │             ▼           ▼             ▼
          │        PostgreSQL     Redis        Object Storage
          │
          │
          └───────────────► External Providers
                              ├─ Payments
                              ├─ Maps
                              └─ Notifications
```

Background workers operate alongside the API and consume asynchronous jobs/events.

---

# 3. Frontend Deployment

The four frontend products are:

```text
apps/customer
apps/restaurant
apps/rider
apps/admin
```

They may be deployed independently.

The deployment platform may differ between frontend applications and backend infrastructure.

---

# 4. Frontend Environment Configuration

Frontend configuration must distinguish:

```text
development
staging
production
```

Public configuration may be embedded in frontend builds.

Secrets must never be embedded into frontend applications.

---

# 5. Frontend API Configuration

Frontend applications must use the configured backend API endpoint for their environment.

Example:

```text
Development → development API
Staging     → staging API
Production  → production API
```

A production frontend must not accidentally point to development/staging APIs.

---

# 6. Backend Deployment

The backend API should be deployed as a versioned artifact.

Each deployment must identify:

```text
application version
source commit
build version
environment
deployment time
```

---

# 7. Backend Runtime

The backend requires access to:

* PostgreSQL
* Redis
* configuration/secrets
* object storage where needed
* external providers
* job/queue infrastructure
* observability infrastructure

---

# 8. Worker Deployment

Workers should run the same compatible application codebase or explicitly version-compatible worker artifact.

Workers must be independently restartable.

---

# 9. Worker Responsibilities

Workers may handle:

* outbox events
* notifications
* retries
* payment webhook processing
* reconciliation
* settlement jobs
* financial processing
* other asynchronous tasks

---

# 10. PostgreSQL Deployment

PostgreSQL must be deployed as a durable production database.

Recommended characteristics:

* managed PostgreSQL where practical
* automated backups
* monitoring
* encrypted connections
* persistent storage
* restricted network access
* controlled credentials

The exact provider may vary.

---

# 11. Redis Deployment

Redis should be deployed as a managed or reliably operated service where practical.

Required characteristics:

* authentication
* private networking where possible
* monitoring
* memory limits
* persistence configuration appropriate to its use
* backup/recovery strategy where required

Redis remains non-authoritative.

---

# 12. Object Storage Deployment

Object storage should provide:

* durable storage
* access control
* encryption
* private storage for sensitive files
* signed URLs where needed
* lifecycle/retention policies

---

# 13. Edge Layer

The production edge should provide:

```text
DNS
→ TLS
→ Reverse Proxy / Edge
→ Backend / Frontend
```

The exact provider is implementation-specific.

---

# 14. TLS Configuration

Production domains must use valid TLS certificates.

Certificate management must support:

* automated renewal where possible
* expiration monitoring
* secure private-key storage

---

# 15. DNS Structure

A possible production structure:

```text
quickbite.example
api.quickbite.example
admin.quickbite.example
restaurant.quickbite.example
rider.quickbite.example
```

Actual domain names may be selected during infrastructure implementation.

---

# 16. Network Structure

Recommended logical separation:

```text
Public
├── frontend
└── API edge

Private
├── PostgreSQL
├── Redis
├── workers
└── internal infrastructure
```

---

# 17. Database Network Access

PostgreSQL should accept connections only from authorized application/worker infrastructure and approved administrative paths.

It should not be exposed publicly by default.

---

# 18. Redis Network Access

Redis should accept connections only from authorized application/worker infrastructure.

Public Internet access should be disabled unless a specific architecture requires it.

---

# 19. Secrets Management

Production secrets should be supplied through secure infrastructure mechanisms.

Potential categories:

```text
DATABASE_URL
REDIS_URL
PAYMENT_SECRET
PAYMENT_WEBHOOK_SECRET
MAPS_API_KEY
NOTIFICATION_PROVIDER_SECRET
OBJECT_STORAGE_SECRET
SESSION_SECRET
JWT_SIGNING_SECRET
```

Exact secrets depend on implementation.

---

# 20. Secret Rotation

Sensitive credentials should support rotation.

Rotation must be planned so that an application does not unexpectedly lose access to critical services.

---

# 21. Environment Configuration

Configuration should be separated into:

### Application Configuration

Non-secret values such as:

* environment
* API URLs
* feature configuration
* operational thresholds

### Secrets

Sensitive values such as:

* passwords
* API secrets
* signing keys
* provider credentials

---

# 22. Startup Configuration Validation

Application startup should validate required configuration.

Failure should produce an observable startup error.

Do not silently use insecure fallback credentials.

---

# 23. Database Migration Deployment

Deployment sequence should generally be:

```text
Build
→ Validate
→ Backup/check recovery where required
→ Apply compatible migration
→ Deploy application
→ Run health checks
→ Verify
```

Exact ordering may change for backward-compatible migration strategies.

---

# 24. Expand-and-Contract Migrations

For risky schema changes, prefer:

```text
Expand
→ Deploy compatible application
→ Migrate/backfill
→ Switch usage
→ Contract later
```

Avoid migrations that immediately remove fields still required by the previous application version.

---

# 25. Deployment Health Checks

After deployment verify:

```text
/health/live
/health/ready
```

plus:

* API startup
* database connection
* Redis connection where required
* worker health
* queue processing
* observability
* critical API paths

---

# 26. Deployment Failure

If health checks fail:

```text
Deployment
→ Detect failure
→ Stop rollout
→ Investigate
→ Roll back where safe
```

Do not continue deploying a known unhealthy version.

---

# 27. Rollback

Rollback may include:

* application version
* worker version
* configuration
* frontend version where required

Database rollback must be treated separately.

---

# 28. Database Rollback Rule

Never assume a database migration can safely be rolled back automatically.

For destructive changes, use backward-compatible migration strategies whenever possible.

---

# 29. Worker Compatibility

During deployments, old and new worker versions may temporarily coexist.

Therefore:

* job payloads must remain compatible
* event formats must remain compatible
* database schema must remain compatible

during the transition.

---

# 30. Outbox Compatibility

Outbox events must remain consumable during application upgrades.

Breaking event changes require versioning or coordinated deployment.

---

# 31. Deployment Strategy

V1 may use:

* rolling deployment
* replacement deployment
* platform-managed deployment

depending on the selected hosting environment.

The strategy must support health verification and rollback.

---

# 32. Frontend Deployment Strategy

Frontend deployment should be versioned and immutable where practical.

Static assets should be associated with a specific release.

---

# 33. Frontend Cache Safety

When deploying frontend changes:

* asset versioning should prevent stale incompatible bundles
* API compatibility must be maintained during rollout
* CDN caching must be controlled

---

# 34. API Compatibility

Backend deployments should preserve API compatibility during normal rolling deployment.

Breaking API changes require:

* explicit versioning
* migration strategy
* coordinated client rollout

---

# 35. Mobile Application Compatibility

If customer/restaurant/rider applications are mobile applications, backend APIs must account for older application versions remaining in use.

Breaking changes must not be introduced without a compatibility strategy.

---

# 36. Configuration Deployment

Configuration changes should be:

* version-controlled where appropriate
* auditable
* validated
* observable

Sensitive changes may require step-up authorization.

---

# 37. Infrastructure as Code

Production infrastructure should be represented in version-controlled configuration where practical.

Recommended conceptual structure:

```text
infrastructure/
├── environments/
│   ├── development/
│   ├── staging/
│   └── production/
├── modules/
└── scripts/
```

Exact structure may vary with the selected tooling.

---

# 38. Infrastructure Changes

Infrastructure changes should follow the same review discipline as application code.

A significant infrastructure change should include:

* reason
* affected components
* security impact
* availability impact
* rollback strategy
* cost impact

---

# 39. Production Access

Production access must use authenticated accounts.

Shared production credentials are prohibited.

---

# 40. Administrative Access

Administrative infrastructure access should use:

* least privilege
* MFA
* controlled credentials
* auditability
* restricted network access where possible

---

# 41. Database Administrative Access

Direct production database access should be limited to authorized personnel.

Operational changes should normally use application/admin workflows.

---

# 42. Backups

Production PostgreSQL backups must be:

* automated
* monitored
* retained
* protected
* restorable

---

# 43. Backup Verification

Recovery testing should periodically verify that:

```text
Backup
→ Restore
→ Database starts
→ Application connects
→ Critical data exists
```

---

# 44. Disaster Recovery

Document recovery procedures for:

### Database

Restore from backup or provider recovery mechanism.

### API

Deploy known-good version.

### Redis

Recreate/recover temporary state as appropriate.

### Workers

Restart from known-good artifact.

### Object Storage

Use provider recovery/versioning mechanisms where available.

### External Providers

Use configured fallback/retry behavior where defined.

---

# 45. Redis Recovery

Because Redis is non-authoritative, recovery must prioritize reconstruction from durable state where possible.

Examples:

* cache can be rebuilt
* rider presence can be re-established
* temporary dispatch state can be reconstructed where supported

Do not assume all Redis state is recoverable.

---

# 46. Scaling

Initial deployment should support vertical scaling.

As traffic grows, horizontal scaling may be introduced for:

* API
* workers
* WebSocket infrastructure

PostgreSQL scaling should be considered carefully because it is the durable source of truth.

---

# 47. API Horizontal Scaling

API instances should avoid storing authoritative state in local memory.

Use:

```text
PostgreSQL
Redis
Object Storage
External Services
```

for shared state.

---

# 48. Worker Horizontal Scaling

Workers may scale according to queue demand.

Critical financial jobs must remain concurrency-safe.

---

# 49. WebSocket Scaling

If multiple realtime instances exist, shared event propagation must be supported.

The exact mechanism may be Redis pub/sub or another suitable mechanism.

Do not make individual instance memory the authoritative realtime state.

---

# 50. Autoscaling Signals

Potential signals:

* CPU
* memory
* request latency
* request volume
* queue depth
* worker utilization
* WebSocket connection count

Autoscaling decisions must be validated against actual workload behavior.

---

# 51. Resource Limits

Define operational limits for:

* request body size
* file upload size
* API connections
* DB connections
* Redis connections
* worker concurrency
* queue depth
* memory
* CPU

---

# 52. Rate Limiting Infrastructure

Rate limiting should be implemented consistently across applicable API endpoints.

It must not rely on local memory when multiple API instances require shared enforcement.

---

# 53. Object Storage Upload Flow

Recommended:

```text
Client
→ Authorized upload request
→ Backend validation/authorization
→ Signed upload/access mechanism where appropriate
→ Object Storage
→ Backend record
```

Sensitive objects must remain private.

---

# 54. CDN

CDN should be used primarily for:

* static frontend assets
* public assets
* safe cacheable content

Do not cache private customer/restaurant/rider/admin data publicly.

---

# 55. Logging Infrastructure

Production logs should be centrally available.

Logs should contain:

* environment
* version
* request ID
* correlation ID
* event
* severity

Sensitive data must be filtered.

---

# 56. Monitoring Infrastructure

Monitoring should cover:

```text
Application
Database
Redis
Workers
Queues
WebSockets
Payments
Dispatch
Risk
Notifications
Financials
Security
Infrastructure
```

---

# 57. Deployment Observability

Each deployment should emit an operational event containing:

```text
deployment_started
deployment_completed
deployment_failed
rollback_started
rollback_completed
```

---

# 58. Deployment Alerts

Alert on:

* deployment failure
* startup failure
* migration failure
* elevated error rate
* severe latency increase
* worker failure
* queue backlog
* database health degradation

---

# 59. Cost Monitoring

Track infrastructure costs by major category:

```text
compute
database
Redis
storage
bandwidth
logs
monitoring
third-party providers
```

---

# 60. Cost Guardrails

Where provider tooling supports it, configure:

* budgets
* spending alerts
* resource limits
* unexpected usage alerts

---

# 61. Security Monitoring

Monitor:

* unauthorized access attempts
* infrastructure login failures
* exposed credentials
* certificate issues
* abnormal resource usage
* suspicious network activity

---

# 62. Production Change Management

Major production changes should record:

* what changed
* why
* who approved it
* deployment version
* expected effect
* rollback strategy

---

# 63. Emergency Changes

Emergency changes are permitted when required to protect:

* users
* data
* finances
* security
* availability

Afterward:

1. document the change
2. test it
3. reconcile infrastructure configuration
4. review the incident

---

# 64. Deployment Checklist

Before production deployment:

```text
[ ] CI passed
[ ] Tests passed
[ ] Security checks passed
[ ] Migration reviewed
[ ] Backup status verified
[ ] Configuration verified
[ ] Secrets available
[ ] Rollback strategy verified
[ ] Monitoring available
[ ] Health checks available
[ ] Release identified
```

---

# 65. Post-Deployment Checklist

After deployment:

```text
[ ] Application healthy
[ ] Readiness healthy
[ ] Workers healthy
[ ] Queues processing
[ ] Database healthy
[ ] Redis healthy
[ ] Error rate normal
[ ] Latency normal
[ ] Critical API paths verified
[ ] Monitoring healthy
```

---

# 66. Staging Deployment

Every production release should normally pass through staging first.

Staging should verify:

* build
* migration
* application
* workers
* queues
* realtime
* payment sandbox
* notifications
* critical E2E flow

---

# 67. Production Release Artifact

Every production release should be identifiable by:

```text
release version
source commit
build timestamp
environment
```

---

# 68. Versioned Infrastructure

Infrastructure changes should be linked to source-control revisions where possible.

---

# 69. No Untracked Production Infrastructure

Production should not depend on undocumented manual infrastructure state.

Emergency exceptions must be reconciled afterward.

---

# 70. Provider Abstraction

External providers should be accessed through appropriate application abstractions where the architecture defines them.

Examples:

```text
PaymentService
MapsService
NotificationService
ObjectStorageService
```

Infrastructure provider details should not spread unnecessarily through business logic.

---

# 71. Provider Failure

External provider failure must be handled explicitly.

Examples:

* payment timeout
* maps outage
* notification provider failure
* object storage failure

Business correctness must remain authoritative in PostgreSQL and application rules.

---

# 72. Deployment Security

Build and deployment systems must prevent unauthorized production deployments.

Production credentials must not be available to every CI job.

---

# 73. Artifact Security

Build artifacts should be controlled and traceable.

Where supported:

* dependency scanning
* image scanning
* artifact signing
* provenance

may be used.

---

# 74. No Unnecessary Infrastructure

Do not introduce:

* Kubernetes
* service mesh
* Kafka
* Elasticsearch
* multi-region active-active
* complex orchestration

unless a documented requirement justifies it.

---

# 75. Documentation Dependencies

This deployment specification must remain consistent with:

```text id="w4p8td"
docs/CLAUDE.md
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md

docs/security/AUTH_AUTHORIZATION.md

docs/notifications/NOTIFICATION_RULES.md
docs/notifications/REALTIME_SPEC.md

docs/payments/PAYMENT_RULES.md
docs/payments/FINANCIAL_SPEC.md

docs/maps/MAPS_LOCATION_RULES.md
docs/maps/MAPS_LOCATION_SPEC.md

docs/promotions/PROMOTION_RULES.md
docs/promotions/PROMOTION_SPEC.md

docs/reviews/REVIEW_RULES.md
docs/reviews/REVIEW_SPEC.md

docs/support/SUPPORT_RULES.md
docs/support/SUPPORT_SPEC.md

docs/admin/ADMIN_RULES.md
docs/admin/ADMIN_SPEC.md

docs/observability/OBSERVABILITY_RULES.md
docs/observability/OBSERVABILITY_SPEC.md

docs/testing/TESTING_RULES.md
docs/testing/TESTING_SPEC.md

docs/flows/GOLDEN_E2E_FLOW.md
docs/decisions/ADR/*
```

---

# 76. Acceptance Criteria

Phase 16 is complete when:

* environments are defined
* production architecture is defined
* frontend deployment is defined
* backend deployment is defined
* worker deployment is defined
* PostgreSQL deployment is defined
* Redis deployment is defined
* object storage is defined
* networking is defined
* DNS/TLS is defined
* secrets are defined
* configuration is defined
* migrations are defined
* deployment strategy is defined
* rollback is defined
* scaling is defined
* backups are defined
* disaster recovery is defined
* monitoring is defined
* cost management is defined
* infrastructure security is defined
* deployment checklists are defined
* staging is defined
* production smoke verification is defined
* provider failure handling is defined
* documentation dependencies are consistent

---

# 77. Final Architecture Principle

QuickBite infrastructure should follow:

```text
Simple
+
Secure
+
Observable
+
Recoverable
+
Versioned
+
Cost-aware
```

The goal is not maximum infrastructure complexity.

The goal is a deployment platform that reliably runs the production QuickBite architecture and can be operated safely by the development team.
