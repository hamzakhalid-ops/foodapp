# QuickBite Observability Specification

**Path:** `docs/observability/OBSERVABILITY_SPEC.md`

**Status:** FROZEN
**Phase:** 14 — Observability & Monitoring

---

# 1. Purpose

This document defines the technical observability architecture for QuickBite.

The observability system must provide visibility across:

* frontend applications
* API
* database
* Redis
* workers
* queues
* WebSockets
* payments
* dispatch
* risk
* notifications
* support
* financial operations
* security
* administration
* infrastructure

The architecture must remain appropriate for the QuickBite V1 modular-monolith architecture.

---

# 2. Architecture

V1 observability consists of:

```text
Applications
    ↓
Structured Logging
    ↓
Metrics
    ↓
Error Tracking
    ↓
Tracing / Correlation
    ↓
Monitoring / Dashboards
    ↓
Alerting
    ↓
Incident Response
```

The exact vendor implementation may vary.

Vendor-specific integrations must remain behind appropriate infrastructure abstractions where practical.

---

# 3. Environments

Observability must distinguish:

```text
development
staging
production
```

Production telemetry must never be mixed with development telemetry.

Environment must be included in relevant logs and telemetry.

---

# 4. Request Context

Every backend request should establish an operational context containing:

```text
request_id
correlation_id
user_id
actor_type
route
HTTP method
environment
application version
```

Not every field will exist for anonymous requests.

---

# 5. Request ID

A unique request ID must identify an individual request.

Example:

```text
request_id = req_xxxxxxxxx
```

The exact identifier format may be implementation-specific.

---

# 6. Correlation ID

A correlation ID links multiple operations belonging to one logical workflow.

Example:

```text
correlation_id = corr_xxxxxxxxx
```

Example order flow:

```text
POST /orders
      ↓
Order Creation
      ↓
Payment
      ↓
Outbox Event
      ↓
Restaurant Notification
      ↓
Dispatch
      ↓
Rider Assignment
```

All relevant operations should remain traceable.

---

# 7. Structured Log Schema

Recommended base schema:

```json
{
  "timestamp": "...",
  "level": "INFO",
  "environment": "production",
  "service": "api",
  "event": "order.created",
  "request_id": "...",
  "correlation_id": "...",
  "user_id": "...",
  "actor_type": "CUSTOMER",
  "route": "/orders",
  "method": "POST",
  "status_code": 201,
  "duration_ms": 120
}
```

Additional fields may be added by subsystem.

---

# 8. Business Event Naming

Business events should use consistent names.

Examples:

```text
order.created
order.status_changed
order.cancelled
payment.created
payment.succeeded
payment.failed
refund.created
refund.succeeded
dispatch.started
dispatch.offer_created
dispatch.offer_expired
delivery.assigned
delivery.picked_up
delivery.delivered
risk.flag_created
risk.restriction_applied
notification.created
notification.sent
settlement.created
settlement.completed
payout.created
payout.completed
```

Event names must be stable.

---

# 9. API Metrics

Recommended metrics:

```text
http_requests_total
http_request_duration_ms
http_request_errors_total
http_request_timeouts_total
http_rate_limit_total
auth_failures_total
```

Labels should remain controlled.

Recommended labels may include:

```text
method
route
status_class
environment
```

Avoid user ID, order ID, or other unbounded identifiers as metric labels.

---

# 10. API Error Monitoring

API errors should be grouped by:

* error code
* endpoint
* HTTP status class
* application version

Raw user input should not be used as an uncontrolled metric label.

---

# 11. Database Observability

Track:

```text
db_connections
db_connection_pool_usage
db_query_duration
db_query_errors
db_transactions
db_transaction_duration
db_deadlocks
db_lock_waits
db_storage_usage
```

Slow-query logging must be enabled according to production performance requirements.

---

# 12. Database Health

Health checks should identify:

```text
database reachable
connection pool available
query execution functional
```

Health checks must remain lightweight.

---

# 13. Redis Observability

Track:

```text
redis_availability
redis_latency
redis_connections
redis_memory_usage
redis_command_errors
redis_evictions
```

Where cache behavior is important, monitor:

```text
cache_hits
cache_misses
```

Redis metrics must not be treated as durable business records.

---

# 14. Worker Architecture

Background workers should emit:

```text
job_started
job_completed
job_failed
job_retried
job_abandoned
```

Each job should be traceable using:

```text
job_id
correlation_id
job_type
attempt
```

---

# 15. Queue Metrics

Each important queue should expose:

```text
queue_depth
oldest_job_age
jobs_processed
jobs_failed
jobs_retried
processing_duration
```

---

# 16. Worker Failure Handling

A failed worker job must:

1. record the failure
2. preserve correlation information
3. retry when configured
4. avoid infinite retries
5. expose persistent failure to operations
6. preserve idempotency

Critical financial jobs require particularly careful retry behavior.

---

# 17. WebSocket Observability

Track:

```text
websocket_connections
websocket_connection_failures
websocket_auth_failures
websocket_subscription_failures
websocket_messages
websocket_delivery_failures
websocket_reconnects
```

WebSocket events should contain a correlation identifier where appropriate.

---

# 18. Realtime Failure Isolation

Realtime failures must not change authoritative business state.

For example:

```text
Order successfully changes to DELIVERED
        ↓
WebSocket delivery fails
        ↓
Order remains DELIVERED
```

The system may retry the notification/realtime event independently.

---

# 19. Payment Observability

Payment operations must emit operational events.

Examples:

```text
payment.created
payment.authorized
payment.succeeded
payment.failed
payment.cancelled
refund.created
refund.succeeded
refund.failed
payment.webhook_received
payment.webhook_processed
payment.webhook_failed
```

---

# 20. Payment Metrics

Track:

```text
payment_attempts_total
payment_success_total
payment_failure_total
payment_provider_errors_total
payment_webhook_total
payment_webhook_failures_total
refund_attempts_total
refund_success_total
refund_failure_total
```

Where possible, measure provider latency.

---

# 21. Payment Reconciliation Monitoring

Reconciliation processes should report:

* records checked
* mismatches detected
* mismatches resolved
* unresolved discrepancies
* processing duration
* failures

Financial discrepancies must be visible to authorized operations staff.

---

# 22. Dispatch Observability

Dispatch operations should expose structured events:

```text
dispatch.started
dispatch.search_started
dispatch.radius_expanded
dispatch.offer_created
dispatch.offer_accepted
dispatch.offer_rejected
dispatch.offer_expired
dispatch.assignment_created
dispatch.assignment_failed
dispatch.completed
```

---

# 23. Dispatch Metrics

Track:

```text
dispatch_orders_total
dispatch_searches_total
dispatch_offers_total
dispatch_offer_acceptances_total
dispatch_offer_rejections_total
dispatch_offer_expirations_total
dispatch_assignment_success_total
dispatch_assignment_failure_total
dispatch_duration_ms
```

Operational dashboards should support analysis by appropriate bounded dimensions such as:

* restaurant
* service area
* time period

where useful and safe.

---

# 24. Dispatch Diagnostics

For an unassigned order, operations should be able to determine:

```text
order ready?
↓
dispatch triggered?
↓
eligible riders found?
↓
radius sufficient?
↓
offers created?
↓
offers accepted?
↓
assignment transaction succeeded?
```

The system must not require manual database reconstruction for ordinary operational diagnosis.

---

# 25. Risk Observability

Risk events should be observable.

Examples:

```text
risk.event_created
risk.flag_created
risk.flag_resolved
risk.restriction_applied
risk.restriction_removed
risk.verification_required
```

Risk metrics:

```text
risk_events_total
risk_flags_total
risk_restrictions_total
risk_verification_requests_total
```

Do not expose sensitive internal risk information to unauthorized users.

---

# 26. Notification Observability

Notification events:

```text
notification.created
notification.queued
notification.sent
notification.failed
notification.retry
notification.delivered
```

Metrics:

```text
notifications_created_total
notifications_sent_total
notifications_failed_total
notification_delivery_duration
notification_retries_total
```

Provider-specific failures should be distinguishable.

---

# 27. Financial Observability

Financial operations must provide end-to-end traceability.

Example:

```text
Order
  ↓
Payment
  ↓
Restaurant Earnings
  ↓
Rider Earnings
  ↓
Settlement
  ↓
Payout
  ↓
Reconciliation
  ↓
Audit
```

Each step should be traceable to the originating business entity.

---

# 28. Financial Metrics

Track:

```text
restaurant_earnings_created_total
rider_earnings_created_total
settlements_created_total
settlements_completed_total
settlements_failed_total
payouts_created_total
payouts_completed_total
payouts_failed_total
financial_reconciliation_failures_total
```

---

# 29. Admin Observability

Admin actions should produce:

1. application log where appropriate
2. audit log for auditable actions
3. metrics for important operational actions where useful

Examples:

```text
admin.order_cancelled
admin.refund_created
admin.restaurant_approved
admin.restaurant_suspended
admin.rider_restricted
admin.configuration_changed
admin.permission_changed
```

---

# 30. Support Observability

Track:

* tickets created
* tickets assigned
* ticket response time
* escalations
* unresolved tickets
* ticket status transitions
* support notification failures

Support metrics must not expose unnecessary customer message content.

---

# 31. Security Observability

Security telemetry should cover:

```text
auth.login_success
auth.login_failure
auth.mfa_failure
auth.authorization_failure
security.rate_limit
security.suspicious_activity
security.sensitive_action
```

Repeated security events should be available for operational investigation.

---

# 32. Error Tracking

Application exceptions should be captured centrally.

Each error record should include:

```text
error_id
timestamp
environment
application_version
route
request_id
correlation_id
error_code
stack_trace
```

User input and secrets must be filtered.

---

# 33. Error Grouping

Equivalent errors should be grouped.

Grouping can use:

* exception type
* normalized stack
* error code
* route

Avoid creating a separate error issue for every unique user ID or request.

---

# 34. Alerts

Alerts should be defined around actionable conditions.

Example categories:

```text
availability
latency
error_rate
database
redis
workers
queues
payments
dispatch
notifications
financial
security
backups
```

---

# 35. Alert Deduplication

The alerting system should prevent an individual root failure from producing hundreds of duplicate alerts.

Related alerts should be grouped where supported.

---

# 36. Alert Escalation

Critical alerts should identify:

* affected subsystem
* severity
* time detected
* relevant dashboard
* correlation information where available
* expected operational response

---

# 37. SLI Definitions

Recommended V1 SLIs:

### API Availability

```text
successful_requests / total_requests
```

excluding intentionally rejected traffic according to the documented measurement definition.

### API Latency

Percentage of successful requests completed below the configured latency target.

### Payment Success

```text
successful_payment_operations / eligible_payment_attempts
```

### Dispatch Success

```text
successfully_assigned_deliveries / dispatch_attempts
```

### Notification Delivery

```text
successfully_delivered_notifications /
attempted_notifications
```

Exact business definitions must be documented before SLOs are used for operational reporting.

---

# 38. SLO Configuration

SLO values should be configurable operational targets.

They should not be embedded into business rules.

Changing an SLO must not change:

* order behavior
* payment behavior
* dispatch eligibility
* risk decisions
* cancellation eligibility

---

# 39. Health Endpoint Structure

The API should expose appropriate health endpoints, for example:

```text
/health/live
/health/ready
```

Exact routing may be adapted to the deployment architecture.

---

# 40. Liveness Endpoint

Liveness should answer:

```text
Is the application process alive?
```

It should remain lightweight.

It should not perform expensive external dependency checks.

---

# 41. Readiness Endpoint

Readiness should answer:

```text
Can this instance safely receive traffic?
```

It may verify required dependencies according to deployment requirements.

---

# 42. Dependency Health

Where relevant, readiness may consider:

* PostgreSQL
* Redis
* required configuration
* critical infrastructure dependencies

External providers that are not required for basic API startup should not automatically make the entire application unready.

---

# 43. Dashboard Structure

Recommended dashboards:

```text
01 - System Overview
02 - API
03 - Database
04 - Redis
05 - Workers & Queues
06 - Orders
07 - Payments
08 - Dispatch
09 - Notifications
10 - Risk & Security
11 - Financial Operations
12 - Support
13 - Deployments
```

---

# 44. System Overview Dashboard

Should show:

* overall availability
* API error rate
* API latency
* active workers
* queue backlog
* database health
* Redis health
* critical payment failures
* dispatch degradation
* active incidents

---

# 45. Order Dashboard

Should show:

* orders created
* orders cancelled
* order completion
* orders by state
* unusually old orders
* stuck order counts

---

# 46. Payment Dashboard

Should show:

* attempts
* success
* failure
* refund status
* webhook status
* provider latency
* reconciliation issues

---

# 47. Dispatch Dashboard

Should show:

* ready-for-pickup orders
* unassigned orders
* dispatch duration
* eligible riders
* offers
* acceptance
* expiration
* assignment failures

---

# 48. Financial Dashboard

Should show:

* earnings generation
* settlement processing
* payouts
* refund activity
* reconciliation failures
* unresolved discrepancies

Access must be restricted.

---

# 49. Security Dashboard

Should show:

* authentication failures
* authorization failures
* MFA failures
* rate-limit events
* suspicious activity
* sensitive admin actions

---

# 50. Deployment Dashboard

Should show:

* deployment status
* application version
* startup failures
* migration status
* error-rate changes
* latency changes
* worker health

---

# 51. Incident Workflow

Operational incident workflow:

```text
Detection
    ↓
Alert
    ↓
Triage
    ↓
Containment
    ↓
Investigation
    ↓
Recovery
    ↓
Verification
    ↓
Post-Incident Review
```

---

# 52. Incident Record

Critical incidents should record:

```text
incident_id
severity
started_at
detected_at
resolved_at
affected_system
summary
impact
actions_taken
root_cause
follow_up_actions
```

Sensitive information must be appropriately protected.

---

# 53. Backup Monitoring

Backup systems must report:

* backup success
* backup failure
* last successful backup
* backup age
* restore-test status where applicable

A backup that has never been tested for restoration should not be treated as fully verified.

---

# 54. Deployment Verification

A deployment verification process should check:

```text
application startup
health endpoints
database connectivity
critical API paths
worker health
queue health
error rate
critical business metrics
```

---

# 55. Migration Verification

After database migrations:

1. confirm migration success
2. confirm application startup
3. confirm database connectivity
4. confirm critical queries
5. monitor error rate
6. monitor latency
7. verify critical business flows

---

# 56. Observability Storage

Telemetry storage should have explicit retention policies.

Retention must balance:

* debugging
* security
* auditability
* privacy
* storage cost

Audit retention requirements must not be confused with ordinary application-log retention.

---

# 57. Data Privacy

Observability systems must not become an alternate database containing unnecessary copies of user data.

Do not log:

```text
password
authentication token
payment secret
full card number
CVV
```

Avoid logging complete:

* addresses
* message contents
* payment payloads
* identity documents

unless specifically required and appropriately protected.

---

# 58. Access Control

Observability access must follow least privilege.

Examples:

```text
Developer
→ development/staging telemetry

Operations
→ production operational telemetry

Finance
→ authorized financial dashboards

Security/Admin
→ security-sensitive telemetry
```

Exact permission mappings must follow the authorization specification.

---

# 59. Performance Requirements

Observability should preferably be asynchronous where external systems are involved.

Do not introduce:

```text
critical request
→ external logging API
→ wait
→ business response
```

when the external logging system is not required for business correctness.

---

# 60. Failure of Monitoring Infrastructure

If the monitoring provider becomes unavailable:

```text
Business operation
        ↓
continues where safe
        ↓
local/internal telemetry continues where possible
        ↓
telemetry is restored
```

Monitoring failure must not corrupt:

* orders
* payments
* refunds
* earnings
* settlements
* dispatch
* risk state

---

# 61. Testing Requirements

Tests should cover:

### Logging

* structured fields
* sensitive-data filtering
* correlation IDs

### Metrics

* expected metric emission
* bounded labels

### Errors

* exception capture
* error grouping

### Health

* liveness
* readiness
* dependency failure

### Workers

* job success
* retry
* permanent failure

### Payments

* payment failure monitoring
* webhook monitoring
* refund monitoring

### Dispatch

* dispatch diagnostics
* assignment failure visibility

### Financial

* reconciliation monitoring
* payout failures

### Security

* authentication failure events
* authorization failure events
* sensitive action auditing

---

# 62. E2E Observability Flow

A representative end-to-end test should be traceable:

```text
Customer creates order
        ↓
Order API
        ↓
Order DB transaction
        ↓
Payment
        ↓
Outbox
        ↓
Restaurant notification
        ↓
Restaurant accepts
        ↓
Preparation
        ↓
READY_FOR_PICKUP
        ↓
Dispatch
        ↓
Rider assignment
        ↓
Pickup
        ↓
Delivery
        ↓
DELIVERED
        ↓
Earnings
        ↓
Settlement
```

The operation should retain sufficient identifiers to diagnose failures at each stage.

---

# 63. Documentation Dependencies

This specification depends on and must remain consistent with:

```text
CLAUDE.md
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md

docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/DISPATCH_RULES.md
docs/business-rules/RISK_RULES.md

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

docs/flows/GOLDEN_E2E_FLOW.md
docs/decisions/ADR/*
```

Any contradiction must be resolved through the architecture/ADR process rather than silently changing this document.

---

# 64. Claude Code Implementation Sequence

Claude Code should implement observability incrementally.

Recommended order:

```text
1. Logging foundation
2. Request/correlation context
3. Error handling/tracking
4. API metrics
5. Database metrics
6. Redis metrics
7. Worker/queue metrics
8. WebSocket metrics
9. Payment observability
10. Dispatch observability
11. Risk observability
12. Notification observability
13. Financial observability
14. Security observability
15. Health endpoints
16. Dashboards
17. Alerts
18. Deployment monitoring
19. Backup monitoring
20. Tests
```

---

# 65. No Premature Complexity

V1 should not introduce complex distributed-observability architecture merely because it is technically possible.

The system is a modular monolith.

Use the simplest reliable stack that provides:

* structured logs
* metrics
* error tracking
* correlation
* health checks
* dashboards
* alerts

---

# 66. Acceptance Criteria

Phase 14 is complete when:

* structured logging exists
* sensitive values are filtered
* request IDs exist
* correlation IDs exist
* API metrics exist
* database monitoring exists
* Redis monitoring exists
* worker/queue monitoring exists
* WebSocket monitoring exists
* payment monitoring exists
* dispatch monitoring exists
* risk monitoring exists
* notification monitoring exists
* financial monitoring exists
* security monitoring exists
* error tracking exists
* health endpoints are defined
* readiness/liveness are defined
* dashboards are defined
* alerts are defined
* incident workflow is defined
* backup monitoring is defined
* deployment monitoring is defined
* observability tests are defined
* documentation dependencies are consistent

---

# 67. Final Architecture Principle

QuickBite observability must provide a reliable operational picture without becoming a second source of business truth.

The rule is:

```text
Business State
    ↓
PostgreSQL / authoritative systems

Operational Visibility
    ↓
Logs + Metrics + Errors + Traces + Dashboards

Operational Action
    ↓
Alerts + Incident Response + Admin Tools
```

**Observe the system without allowing observability itself to become the system.**
