# QuickBite Infrastructure Rules

**Path:** `docs/infrastructure/INFRASTRUCTURE_RULES.md`

**Status:** FROZEN
**Phase:** 16 — Infrastructure & Deployment
**Authority:** Authoritative infrastructure and operational rules

---

# 1. Purpose

This document defines the infrastructure rules for deploying and operating QuickBite.

The infrastructure must support:

* reliability
* security
* scalability
* observability
* backups
* disaster recovery
* controlled deployments
* rollback
* environment isolation
* financial safety
* operational simplicity

V1 infrastructure must remain appropriate for the modular-monolith architecture.

---

# 2. Core Infrastructure Principle

QuickBite V1 should use the simplest production infrastructure capable of reliably supporting the application.

Do not introduce infrastructure complexity merely because it is technically available.

---

# 3. Architecture

The production system consists conceptually of:

```text
Internet
   ↓
DNS
   ↓
TLS / Reverse Proxy / Edge
   ↓
Application API
   ├── PostgreSQL
   ├── Redis
   ├── Background Workers
   ├── Object Storage
   ├── Payment Provider
   ├── Maps Provider
   └── Notification Providers
```

Frontend applications may be deployed separately from the backend.

---

# 4. Environments

QuickBite must maintain separate environments for:

* development
* staging
* production

Production data must never be casually copied into development or staging.

---

# 5. Development Environment

Development should prioritize:

* fast iteration
* reproducibility
* low cost
* local debugging
* isolated test data

Production infrastructure should not be required for ordinary local development unless a specific integration needs it.

---

# 6. Staging Environment

Staging should be sufficiently production-like to validate:

* application builds
* migrations
* database behavior
* Redis
* workers
* queues
* notifications
* object storage
* realtime
* payment sandbox
* deployment
* critical E2E flows

---

# 7. Production Environment

Production must provide:

* secure networking
* encrypted connections
* durable database
* reliable backups
* application monitoring
* worker monitoring
* error tracking
* logging
* controlled deployments
* rollback capability
* secret management

---

# 8. PostgreSQL

PostgreSQL is the durable source of truth.

Production PostgreSQL must use appropriate:

* backups
* storage
* connection management
* monitoring
* access controls
* encryption
* recovery procedures

Business-critical data must not depend solely on Redis.

---

# 9. PostgreSQL Security

Database access must be restricted.

The application should connect using a dedicated application database identity.

Administrative database credentials must not be embedded in application code.

Production database access should be limited to authorized operational personnel.

---

# 10. Database Backups

Production PostgreSQL must have automated backups.

Backups must have:

* defined frequency
* retention policy
* monitoring
* failure alerting
* restore procedure

Backup success alone is insufficient; restore capability must be periodically verified.

---

# 11. Redis

Redis is used for temporary and performance-oriented state such as:

* cache
* rider geo lookup
* presence
* rate limiting
* temporary dispatch state
* short-lived locks
* job/temporary state
* realtime presence

Redis is not the durable source of truth.

---

# 12. Redis Failure

The application must define safe behavior for Redis failure.

Redis failure must not corrupt durable business state.

Critical business operations should not depend on Redis being the only copy of authoritative information.

---

# 13. Background Workers

Background workers are required for asynchronous processing.

Examples:

* outbox processing
* notifications
* payment callbacks
* retries
* settlement jobs
* reconciliation
* other asynchronous operations

Workers must be monitored and restartable.

---

# 14. Queue Safety

Critical jobs must support:

* retry
* idempotency
* failure handling
* observability
* controlled concurrency

Infinite retry loops are prohibited.

---

# 15. Object Storage

Object storage should be used for appropriate uploaded assets such as:

* restaurant documents
* rider documents
* permitted support attachments
* other approved files

Files should not be stored directly inside PostgreSQL unless explicitly required by the architecture.

---

# 16. Object Storage Security

Object storage must provide:

* private buckets/containers where appropriate
* authorization
* signed access where required
* upload validation
* file-size limits
* content-type validation
* safe filenames
* access logging where appropriate

Sensitive documents must not be publicly accessible.

---

# 17. CDN

A CDN may be used for:

* public static assets
* frontend assets
* cacheable content

Sensitive application data must not be publicly cached.

---

# 18. Reverse Proxy / Edge

The edge layer should provide appropriate:

* TLS termination
* routing
* request limits
* security headers
* compression where appropriate
* health routing
* protection against basic abuse

The exact provider may vary.

---

# 19. TLS

Production traffic must use HTTPS/TLS.

Sensitive internal communication should also use encrypted connections where supported and appropriate.

Certificates must be monitored and renewed before expiration.

---

# 20. DNS

Production DNS must be managed through a controlled system.

DNS records should be documented.

Changes to critical production DNS must be auditable and access-controlled.

---

# 21. Secrets

Secrets must never be committed to source control.

Examples:

* database passwords
* Redis credentials
* payment credentials
* API keys
* notification provider credentials
* signing secrets
* encryption keys

Secrets should be supplied through secure environment/configuration mechanisms.

---

# 22. Environment Variables

Environment-specific configuration should be externalized.

Examples:

```text
DATABASE_URL
REDIS_URL
PAYMENT_PROVIDER_KEY
MAPS_PROVIDER_KEY
NOTIFICATION_PROVIDER_KEY
OBJECT_STORAGE_CONFIG
APP_ENV
```

Actual variable names may be standardized during implementation.

---

# 23. Configuration Safety

Configuration must be validated during startup.

Missing critical configuration should cause the application to fail safely rather than start with insecure defaults.

---

# 24. No Secrets in Logs

Secrets must never appear in:

* application logs
* error reports
* metrics
* traces
* CI output
* deployment logs

---

# 25. Network Security

Production networking should restrict access according to least privilege.

Database and Redis should not be unnecessarily exposed directly to the public Internet.

---

# 26. Public Exposure

Only required public services should be Internet-accessible.

Typical public components:

* frontend
* API/edge

Typical private components:

* PostgreSQL
* Redis
* worker infrastructure
* internal administrative infrastructure

---

# 27. Admin Infrastructure

Admin systems must receive appropriate additional protection.

Sensitive administrative access should use:

* authentication
* authorization
* MFA/step-up where defined
* HTTPS
* audit logging
* restricted operational access

---

# 28. Application Deployment

The backend application should be deployed as a repeatable build artifact.

Deployment must be:

* versioned
* reproducible
* observable
* rollback-capable

---

# 29. Worker Deployment

Workers must use controlled versions.

Application and worker versions must remain compatible with the database and job formats.

---

# 30. Database Migrations

Database schema changes must use version-controlled migrations.

Never modify production schema manually as the normal deployment process.

---

# 31. Migration Safety

Migrations should prefer backward-compatible changes when possible.

Avoid combining risky destructive schema changes with application changes that still depend on the old structure.

---

# 32. Deployment Strategy

V1 may use a controlled rolling or replacement deployment strategy appropriate to the hosting platform.

The selected strategy must provide:

* health verification
* failure detection
* rollback
* minimal unnecessary downtime

---

# 33. Zero-Downtime Assumption

Do not assume every deployment can be zero-downtime.

If a migration or infrastructure change requires downtime, it must be explicitly planned and communicated.

---

# 34. Rollback

Every production deployment must have a rollback strategy.

Rollback must consider:

* application version
* worker version
* database compatibility
* configuration
* queues
* outbox events

Database migrations must not be blindly rolled back.

---

# 35. Horizontal Scaling

The API should be designed to support multiple application instances when needed.

Application instances should remain stateless where practical.

State should live in:

* PostgreSQL
* Redis
* object storage
* appropriate external systems

rather than local application memory.

---

# 36. Worker Scaling

Workers may scale horizontally.

Concurrency must be controlled for:

* financial jobs
* settlement
* payout
* notifications
* dispatch-related jobs

Idempotency and database locking remain authoritative protections.

---

# 37. WebSocket Scaling

Realtime architecture must account for multiple application instances if horizontal scaling is introduced.

Shared realtime state or pub/sub mechanisms may be required.

The implementation must preserve:

* authorization
* event ordering where required
* duplicate handling
* reconnection behavior

---

# 38. Resource Limits

Production services should have controlled:

* CPU
* memory
* connections
* worker concurrency
* queue concurrency
* request size
* upload size

Unbounded resource usage is prohibited.

---

# 39. Autoscaling

Autoscaling may be introduced when justified by workload.

Do not add complex autoscaling infrastructure before there is a measurable operational need.

---

# 40. Storage Monitoring

Monitor:

* database storage
* object storage
* logs
* backups
* application disk usage

Storage exhaustion must have warning and critical thresholds.

---

# 41. Cost Management

Infrastructure must be cost-aware.

Monitor:

* compute
* database
* Redis
* storage
* bandwidth
* logs
* monitoring
* third-party APIs

Avoid unnecessary always-on infrastructure.

---

# 42. Availability

Critical production dependencies should have appropriate availability characteristics.

Availability expectations must be consistent with the chosen deployment architecture and provider.

---

# 43. Disaster Recovery

QuickBite must have documented recovery procedures for:

* database failure
* application failure
* Redis failure
* worker failure
* object storage issues
* provider outages
* deployment failures

---

# 44. Recovery Priority

Recovery priority should generally protect:

1. data integrity
2. financial correctness
3. order processing
4. authentication
5. core API
6. dispatch
7. notifications/realtime
8. secondary features

Actual incident prioritization may depend on the failure.

---

# 45. Recovery Point Objective

The production system should define an acceptable maximum amount of data loss for disaster recovery.

The RPO must be chosen according to:

* database backup capabilities
* business requirements
* cost

---

# 46. Recovery Time Objective

The production system should define an acceptable recovery time for critical services.

The RTO must be realistic for the actual infrastructure.

---

# 47. Disaster Recovery Testing

Backups and recovery procedures must be tested periodically.

A backup that cannot be restored is not considered sufficient.

---

# 48. Monitoring

Infrastructure must integrate with the observability architecture.

Monitor:

* CPU
* memory
* network
* storage
* database
* Redis
* workers
* queues
* application health
* deployment state

---

# 49. Alerting

Infrastructure alerts should cover:

* service unavailable
* high error rate
* high latency
* database failure
* Redis failure
* worker failure
* queue backlog
* storage exhaustion
* backup failure
* certificate expiration
* resource exhaustion

---

# 50. Health Checks

Production deployments must use health checks appropriate to the application.

At minimum:

```text
/health/live
/health/ready
```

where supported by the deployed architecture.

---

# 51. Logging

Infrastructure logs must integrate with centralized observability.

Do not rely solely on local machine logs that disappear when an instance is replaced.

---

# 52. Deployment Artifacts

Every deployment should identify:

* application version
* source revision
* build artifact
* deployment timestamp
* environment

This information should be available to operators.

---

# 53. Version Compatibility

Application, worker, migration, and queue formats must remain compatible during deployment transitions.

Breaking changes require controlled rollout.

---

# 54. Infrastructure as Code

Production infrastructure should be represented through version-controlled infrastructure configuration where practical.

Manual production changes should be minimized.

---

# 55. Manual Changes

Emergency manual changes may occur when necessary.

They must be:

* authorized
* documented
* audited where applicable
* reconciled back into infrastructure configuration

---

# 56. Access Control

Production infrastructure access must follow least privilege.

Developers should not automatically receive unrestricted production infrastructure access.

---

# 57. Production Database Access

Direct production database access should be restricted to authorized personnel.

Application behavior must normally operate through application APIs/services rather than manual database edits.

---

# 58. No Direct Production Data Manipulation

Do not manually modify:

* order state
* payment state
* earnings
* settlements
* payouts
* risk restrictions

through ad-hoc SQL as a normal operational workflow.

Use authorized application/admin operations.

---

# 59. Financial Infrastructure Safety

Financial systems require:

* durable storage
* backups
* auditability
* idempotency
* reconciliation
* controlled access

Infrastructure failure must not create silent duplicate financial effects.

---

# 60. Security Updates

Infrastructure dependencies should receive security updates.

Critical vulnerabilities must be evaluated promptly.

---

# 61. Dependency Management

Production images/builds should use controlled dependency versions.

Avoid uncontrolled floating production dependencies where reproducibility matters.

---

# 62. Containerization

Containerization may be used where beneficial.

It is not mandatory to introduce containers everywhere if the selected hosting platform provides an equally reliable deployment model.

---

# 63. Kubernetes

Kubernetes is not required for QuickBite V1.

Do not introduce Kubernetes merely for perceived scalability.

A simpler deployment platform is preferred unless real requirements justify additional orchestration complexity.

---

# 64. Microservices

Infrastructure must remain compatible with the V1 modular monolith.

Do not split the system into microservices as an infrastructure exercise.

Any architectural split requires an ADR.

---

# 65. CDN and Cache Safety

Caching must never expose private data across users or restaurants.

Cache keys must include appropriate scope where necessary.

---

# 66. Rate Limiting

Public API endpoints must have appropriate rate limiting.

Rate limiting infrastructure must not become a single point of business-state truth.

---

# 67. File Upload Infrastructure

Uploads must be:

* size-limited
* type-validated
* access-controlled
* stored securely
* monitored where appropriate

---

# 68. Environment Isolation

Credentials, databases, storage buckets, queues, and other environment resources should be separated appropriately.

A staging action must not accidentally affect production.

---

# 69. Production Data Protection

Production data must be protected through:

* access controls
* encryption
* backups
* monitoring
* retention policies
* least privilege

---

# 70. Testing Infrastructure

Infrastructure changes must be tested in development/staging before production where practical.

---

# 71. Claude Code Infrastructure Rules

Claude Code must:

1. read `CLAUDE.md`
2. read architecture documentation
3. read database documentation
4. read observability documentation
5. read security documentation
6. read deployment requirements
7. identify infrastructure impact
8. identify migration impact
9. identify secret/configuration impact
10. implement minimally
11. test
12. document changes
13. never silently introduce major infrastructure complexity

---

# 72. V1 Exclusions

V1 does not require:

* Kubernetes
* service mesh
* multi-region active-active architecture
* complex distributed databases
* Kafka solely for event transport
* Elasticsearch solely for search
* complex infrastructure orchestration without need
* multi-cloud deployment
* active-active global deployment

These may be introduced later only when justified.

---

# 73. Final Principle

**QuickBite infrastructure must be secure, recoverable, observable, scalable enough for its real workload, and simple enough for the team to operate correctly.**
