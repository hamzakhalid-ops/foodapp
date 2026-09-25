# QuickBite Observability Rules

**Path:** `docs/observability/OBSERVABILITY_RULES.md`

**Status:** FROZEN
**Phase:** 14 — Observability & Monitoring
**Authority:** Authoritative observability business and engineering rules

---

## 1. Purpose

This document defines the mandatory observability rules for QuickBite.

Observability exists to make the system:

* measurable
* debuggable
* auditable
* operationally visible
* secure
* reliable
* recoverable

Observability must cover both technical infrastructure and business-critical operations.

---

# 2. Core Observability Principles

## 2.1 Production must be observable

Every production-critical subsystem must expose sufficient:

* logs
* metrics
* errors
* health information
* operational state
* correlation information

to diagnose failures without directly inspecting production databases.

---

## 2.2 Backend is the primary source of operational truth

Operational dashboards and monitoring must be based on backend-generated events, metrics, logs, and database state.

Client-side values must not be treated as authoritative for:

* order status
* payment status
* delivery status
* rider assignment
* earnings
* settlement status
* risk status
* refund status

---

## 2.3 Sensitive data must not be logged

Never log:

* passwords
* password hashes
* authentication tokens
* refresh tokens
* API secrets
* payment secrets
* full card numbers
* CVV
* private authentication credentials
* unnecessary personal data

Sensitive identifiers must be masked or represented using safe identifiers.

---

# 3. Structured Logging

All backend logs must use structured logging.

Logs should contain fields such as:

```text
timestamp
level
service
environment
request_id
correlation_id
user_id
actor_type
route
method
status_code
duration_ms
event
error_code
```

Additional fields may be added when useful.

---

## 3.1 Log Levels

Supported levels:

* DEBUG
* INFO
* WARN
* ERROR
* FATAL

Production logging must avoid excessive DEBUG logging.

---

## 3.2 INFO

Use INFO for meaningful operational events such as:

* application startup
* successful deployment
* order creation
* order state transition
* dispatch offer creation
* rider assignment
* payment completion
* refund completion
* settlement completion
* configuration change
* support escalation

---

## 3.3 WARN

Use WARN for conditions that are abnormal but not necessarily system failures.

Examples:

* repeated dispatch offer expiry
* external provider degradation
* repeated payment failures
* unusual queue delay
* elevated API latency
* failed notification delivery
* Redis degradation

---

## 3.4 ERROR

Use ERROR for failures requiring investigation.

Examples:

* database operation failure
* payment provider failure
* dispatch assignment failure
* worker processing failure
* unexpected order transition failure
* notification processing failure
* settlement processing failure

---

## 3.5 FATAL

FATAL should be reserved for failures that prevent a critical application process from operating.

Examples:

* application cannot initialize required infrastructure
* required configuration is missing
* database connection cannot be established during startup

---

# 4. Correlation IDs

Every request must have a correlation/request identifier.

Correlation IDs must allow an operator to trace a business operation across:

* API request
* database operations where applicable
* background jobs
* outbox events
* notifications
* WebSocket events
* external provider calls
* worker execution

A request identifier must not expose sensitive information.

---

# 5. Business Operation Correlation

Critical business operations must be traceable end-to-end.

Examples:

```text
Order
→ Payment
→ Restaurant
→ Dispatch
→ Rider
→ Delivery
→ Earnings
→ Settlement
→ Payout
```

Operators should be able to correlate related records through safe identifiers.

---

# 6. Metrics

QuickBite must collect technical and business metrics.

Metrics must have stable names and documented meanings.

Avoid creating high-cardinality metric labels unnecessarily.

---

# 7. API Metrics

Track:

* request count
* response status
* error rate
* latency
* timeout rate
* rate-limit events
* endpoint usage
* authentication failures

Important latency measurements should include:

* average
* p95
* p99

where operationally appropriate.

---

# 8. Database Metrics

Monitor:

* connection count
* connection pool usage
* query latency
* slow queries
* transaction duration
* lock contention
* deadlocks
* failed queries
* database CPU
* database memory
* database storage
* replication/backup health where applicable

Database degradation must be visible before it becomes a major outage.

---

# 9. Redis Metrics

Monitor:

* availability
* latency
* memory usage
* connection count
* command failures
* eviction activity
* cache hit/miss behavior where relevant

Redis must not become a hidden single point of failure for durable business state.

PostgreSQL remains the durable source of truth.

---

# 10. Worker and Queue Metrics

Monitor:

* queue depth
* job processing time
* job success count
* job failure count
* retry count
* dead-letter/dead-job count where implemented
* oldest pending job age
* worker availability

Critical queues must have alerting thresholds.

---

# 11. WebSocket / Realtime Metrics

Monitor:

* active connections
* connection failures
* reconnect rate
* authentication failures
* subscription failures
* message delivery failures
* event processing latency
* connection duration

Realtime failures must not corrupt authoritative database state.

---

# 12. Payment Monitoring

Payment operations require enhanced observability.

Track:

* payment attempts
* successful payments
* failed payments
* cancelled payments
* refund attempts
* successful refunds
* failed refunds
* webhook processing
* webhook failures
* duplicate webhook events
* payment provider latency
* payment reconciliation failures

Financial failures must be clearly distinguishable from ordinary application errors.

---

# 13. Dispatch Monitoring

Monitor the Delivery Dispatch Engine.

Track:

* READY_FOR_PICKUP orders
* dispatch searches
* eligible rider count
* dispatch radius
* offers created
* offers accepted
* offers expired
* offers rejected
* assignment success
* assignment failure
* dispatch timeout
* rider availability
* abnormal dispatch duration

Operators must be able to determine why an order has not been assigned.

---

# 14. Risk Monitoring

Monitor the Trust & Risk Engine.

Track:

* risk events
* risk flags
* restrictions
* COD restrictions
* additional verification
* order restrictions
* account restrictions
* repeated suspicious activity
* rule execution failures

Risk monitoring must not expose unnecessary sensitive user information.

---

# 15. Notification Monitoring

Monitor:

* notifications created
* notifications sent
* delivery success
* delivery failure
* retry count
* provider failures
* invalid destination errors
* delayed delivery

Notification failure must not silently cause critical business operations to fail.

---

# 16. Financial Monitoring

Financial systems require stronger monitoring than ordinary application features.

Monitor:

* restaurant earnings creation
* rider earnings creation
* settlement creation
* settlement processing
* payout processing
* refund processing
* reconciliation
* financial discrepancies
* failed financial jobs
* duplicate financial operations
* idempotency conflicts

Financial anomalies must be visible to operations staff.

---

# 17. Security Monitoring

Monitor security-sensitive events including:

* authentication failures
* authorization failures
* suspicious login activity
* rate-limit violations
* MFA failures
* step-up authentication failures
* administrative sensitive actions
* permission changes
* account restrictions
* suspicious API activity

Security events must be auditable.

---

# 18. Audit Monitoring

Important administrative and financial operations must produce audit records.

Examples:

* user suspension
* restaurant approval
* restaurant suspension
* rider restriction
* order cancellation by admin
* refund
* settlement modification
* configuration change
* permission change
* sensitive data access
* risk restriction

Audit logs must remain separate from ordinary application logs.

---

# 19. Error Tracking

Unexpected application errors must be captured by an error-tracking system.

Errors should contain enough context to identify:

* environment
* application version
* endpoint
* request/correlation ID
* actor where appropriate
* error code
* stack trace
* relevant operation

Sensitive data must be excluded.

---

# 20. Alerting

Alerts must be actionable.

Do not create alerts for every minor error.

Alerts should focus on:

* service unavailability
* elevated error rates
* severe latency
* database failure
* Redis failure
* queue backlog
* worker failure
* payment failure spikes
* dispatch degradation
* notification provider failure
* financial processing failure
* security incidents
* backup failure

---

# 21. Severity

Operational incidents should have severity levels.

Suggested V1 levels:

### SEV-1

Critical production outage or severe financial/security impact.

### SEV-2

Major degradation affecting important functionality or a significant portion of users.

### SEV-3

Limited operational degradation with workaround available.

### SEV-4

Minor issue or informational operational concern.

Severity definitions must be documented and used consistently.

---

# 22. SLI / SLO Rules

Important production systems should have measurable SLIs.

Examples:

### API

* availability
* successful request rate
* latency

### Orders

* order creation success rate
* order transition failure rate

### Payments

* successful payment processing
* webhook processing success
* refund processing success

### Dispatch

* successful rider assignment
* dispatch processing latency

### Notifications

* delivery success rate
* delivery latency

### Workers

* successful job completion
* queue age

SLO targets should be configurable operational values rather than hard-coded business logic.

---

# 23. Health Checks

Services must expose health information appropriate to their architecture.

Health checks should distinguish:

* process alive
* application ready
* required dependency available

A liveness failure and readiness failure must not be treated as identical.

---

# 24. Readiness

Readiness should indicate whether the application is capable of serving production traffic.

Required critical dependencies must be considered according to the deployment architecture.

---

# 25. Liveness

Liveness should determine whether the process itself is functioning.

Liveness checks must not create cascading failures by performing expensive dependency operations.

---

# 26. Dashboards

Operations dashboards should provide visibility into:

* API health
* infrastructure health
* orders
* payments
* dispatch
* riders
* notifications
* risk
* financial operations
* support
* security
* workers and queues

Dashboards should prioritize actionable information.

---

# 27. Order Operational Monitoring

Operations must be able to identify orders stuck in unusual states.

Examples:

```text
PENDING too long
RESTAURANT_ACCEPTED too long
PREPARING too long
READY_FOR_PICKUP without rider
RIDER_ASSIGNED without pickup
OUT_FOR_DELIVERY too long
```

Thresholds should be configurable.

---

# 28. Configuration Monitoring

Changes to operational configuration must be observable.

Examples:

* dispatch radius
* offer timeout
* maximum dispatch attempts
* cancellation configuration
* risk thresholds
* promotion settings
* notification configuration
* system settings

Sensitive configuration changes must produce audit events.

---

# 29. Deployment Monitoring

Deployments must be observable.

Monitor:

* deployment status
* application startup
* migration status
* error-rate changes
* latency changes
* worker health
* queue health
* critical business metrics

A deployment must not be considered successful merely because the process starts.

---

# 30. Database Migration Monitoring

Production migrations must provide visibility into:

* migration started
* migration completed
* migration failed
* migration duration

Destructive or risky migrations require additional safeguards.

---

# 31. Incident Response

Operational incidents should follow a consistent process:

```text
Detect
→ Alert
→ Triage
→ Contain
→ Investigate
→ Recover
→ Verify
→ Document
```

Critical incidents should have an incident record.

---

# 32. Observability Failure Rules

Observability failures must not unnecessarily break core business operations.

Examples:

* metrics backend unavailable
* log transport temporarily unavailable
* tracing provider unavailable
* external error tracker unavailable

The application should degrade safely while preserving core business correctness.

---

# 33. No Logging as Business Logic

Business correctness must never depend on a log being written successfully.

For example:

```text
Order creation
```

must not fail solely because an external logging system is temporarily unavailable.

Critical business events that require durable processing must use the appropriate database/outbox/audit mechanisms.

---

# 34. Financial Observability

Financial systems must have stronger traceability.

Every important financial operation should be traceable through:

```text
Order
→ Payment
→ Earnings
→ Settlement
→ Payout
→ Reconciliation
→ Audit
```

Any discrepancy must be detectable and investigable.

---

# 35. Dispatch Observability

The dispatch engine must provide enough operational information to answer:

* Was the order eligible for dispatch?
* How many riders were eligible?
* What search radius was used?
* Were offers generated?
* Did riders reject or ignore offers?
* Did offers expire?
* Why did assignment fail?
* Was the rider later unassigned?

Sensitive rider location history must not be unnecessarily exposed.

---

# 36. Privacy

Observability data must follow least-data principles.

Do not collect or retain information merely because it could be useful someday.

Logs and telemetry should have appropriate retention policies.

---

# 37. Access Control

Observability systems must be protected.

Access should be limited according to:

* role
* environment
* operational need
* sensitivity

Production logs must not automatically be visible to every application user.

---

# 38. Production vs Development

Development may use more verbose logs.

Production should prioritize:

* actionable logs
* structured data
* controlled volume
* security
* performance
* useful retention

---

# 39. Performance

Observability must not materially degrade application performance.

Avoid:

* synchronous external logging on critical request paths
* expensive tracing everywhere
* excessive database queries solely for metrics
* high-cardinality uncontrolled metrics
* logging entire request/response bodies

---

# 40. Testing

Observability must be tested.

Tests should verify:

* correlation IDs
* structured logs
* error reporting
* metrics emission
* alert conditions where practical
* health checks
* readiness
* liveness
* audit events
* critical financial monitoring
* dispatch monitoring
* security events

---

# 41. Claude Code Implementation Rules

Before implementing observability:

1. Read `CLAUDE.md`.
2. Read architecture documentation.
3. Read API documentation.
4. Read security documentation.
5. Read payments/financial documentation.
6. Read dispatch documentation.
7. Read risk documentation.
8. Read notification/realtime documentation.
9. Read support and admin documentation.
10. Identify existing logging/metrics infrastructure.
11. Do not introduce duplicate observability systems unnecessarily.
12. Preserve backend authority.
13. Preserve audit requirements.
14. Preserve idempotency.
15. Preserve transaction boundaries.
16. Add tests.
17. Update documentation when implementation changes documented behavior.

---

# 42. V1 Exclusions

V1 does not require:

* complex distributed tracing infrastructure
* AI-based anomaly detection
* predictive incident detection
* advanced machine-learning observability
* large-scale data warehouse analytics
* unnecessary microservice-specific telemetry
* excessive third-party monitoring systems

Use simple, reliable observability appropriate for the modular-monolith architecture.

---

# 43. Core Rule

QuickBite must be observable enough that an operator can answer:

> What happened?

> When did it happen?

> Which operation was affected?

> Which actor/resource was affected?

> Why did it fail?

> What is the current state?

> Did money move?

> Did an order become stuck?

> Did dispatch fail?

> Did a security or risk event occur?

> Has the system recovered?

If the system cannot answer these questions for a critical operation, observability is incomplete.

---

# 44. Final Principle

**Observe everything important, protect sensitive data, measure what matters, alert only when action is required, and never allow observability complexity to compromise business correctness.**
