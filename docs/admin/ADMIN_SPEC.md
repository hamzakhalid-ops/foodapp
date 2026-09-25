# QuickBite Admin & Operations Specification

**Document:** `docs/admin/ADMIN_SPEC.md`
**Product:** QuickBite
**Phase:** 13 — Admin & Operations
**Status:** V1 Specification
**Authority:** Admin architecture and implementation specification
**Last Updated:** 2026-09-25

---

# 1. Purpose

This document defines the technical specification for the QuickBite Admin Panel and operational backend.

The Admin Panel provides controlled management and monitoring of:

* Customers
* Restaurants
* Restaurant applications
* Riders
* Orders
* Payments
* Refunds
* Settlements
* Promotions
* Reviews
* Support
* Trust & Risk
* System configuration
* Audit logs
* Reports

---

# 2. Architecture

QuickBite V1 remains a modular monolith.

Admin is an application/interface layer over existing backend modules.

Logical structure:

```text
apps/
└── admin/

backend/
├── admin/
├── users/
├── restaurants/
├── orders/
├── payments/
├── delivery/
├── risk/
├── promotions/
├── reviews/
├── support/
├── financial/
├── notifications/
└── audit/
```

The exact implementation structure must follow repository conventions.

No separate Admin microservice is required for V1.

---

# 3. Admin Backend Principle

The Admin API coordinates authorized operations.

Example:

```text
Admin Panel
    ↓
Admin API
    ↓
Authorization
    ↓
Domain Service
    ↓
Business Engine
    ↓
Database
    ↓
Audit / Outbox
```

Not:

```text
Admin Panel
    ↓
Direct Database Update
```

---

# 4. Admin Dashboard

The Admin Dashboard should provide operational visibility.

Primary sections:

```text
Dashboard
Customers
Restaurants
Restaurant Applications
Riders
Orders
Payments
Settlements
Promotions
Reviews
Support
Risk
Reports
Audit Logs
Settings
```

Only authorized sections should be visible.

Frontend visibility must never replace backend authorization.

---

# 5. Dashboard Metrics

Initial dashboard metrics may include:

### Orders

* Orders today
* Active orders
* Delivered orders
* Cancelled orders

### Restaurants

* Active restaurants
* Pending applications
* Suspended restaurants

### Riders

* Active riders
* Online riders
* Riders currently delivering

### Support

* Open tickets
* Urgent tickets
* SLA breaches

### Payments

* Successful payments
* Failed payments
* Refunds

### Risk

* Active risk flags
* Restricted accounts
* High-priority risk events

Metrics must come from authoritative backend data.

---

# 6. Customer Management

Admin customer management should include:

```text
Customer List
Customer Search
Customer Detail
Order History
Support History
Risk Information
Account Status
Audit Information
```

Admin detail view may include:

* Customer identity
* Contact information according to permission
* Account status
* Registration metadata
* Order history
* Support tickets
* Risk state
* Relevant audit events

---

# 7. Customer Actions

Authorized actions may include:

```text
View
Restrict
Restore
Review Risk
Review Support
```

Account restriction must go through the appropriate account/risk mechanism.

---

# 8. Restaurant Management

Restaurant administration should include:

```text
Restaurant List
Restaurant Search
Restaurant Detail
Application Review
Documents
Operating Information
Orders
Financial Summary
Promotions
Reviews
Support
Risk
Status
```

Financial details require appropriate permission.

---

# 9. Restaurant Application Workflow

Logical flow:

```text
Application Submitted
        ↓
Pending Review
        ↓
Admin Review
        ↓
Approved / Rejected
        ↓
Restaurant Operational
```

Rejection should record a reason where required.

Approval/rejection must be audited.

---

# 10. Restaurant Suspension

Authorized admin can suspend a restaurant where supported.

Possible reasons:

* Operational issue
* Safety issue
* Policy violation
* Risk restriction
* Administrative issue

Suspension must:

* Validate current state
* Record reason
* Audit action
* Trigger relevant notifications
* Apply restaurant availability rules

---

# 11. Rider Management

Rider management should provide:

```text
Rider List
Search
Profile
Documents
Status
Delivery History
Earnings Summary
Support
Risk
Audit
```

Rider location history must remain subject to location privacy and authorization rules.

---

# 12. Rider Restriction

Authorized admins may restrict riders through the appropriate account/risk mechanism.

Admin must not directly manipulate:

* Rider availability
* GPS state
* Dispatch eligibility

without using the authoritative system.

---

# 13. Order Operations

Admin order screen should show:

```text
Order ID
Customer
Restaurant
Rider
Items
Totals
Payment
Status
Delivery
Cancellation
Timeline
Support
Audit
```

Order status is read from the Order system.

---

# 14. Order Timeline

The Admin Panel should provide a chronological operational timeline containing relevant events:

```text
Order Created
Payment
Restaurant Accepted
Preparing
Ready
Dispatch
Rider Assigned
Pickup
Out for Delivery
Delivered
Cancellation
Refund
```

The timeline must use authoritative event/status data.

---

# 15. Admin Order Actions

Depending on permission and current state:

```text
Cancel Order
Review Payment
Review Delivery
Open Support
Review Risk
```

Actions must use existing business engines.

---

# 16. Cancellation Operation

Admin cancellation API should logically be:

```http
POST /admin/orders/{orderId}/cancel
```

Request:

```json
{
  "reason": "RESTAURANT_UNABLE_TO_FULFILL"
}
```

Backend:

1. Authenticate.
2. Verify admin role.
3. Verify permission.
4. Verify order access.
5. Invoke Cancellation Rules Engine.
6. Apply payment/refund rules.
7. Update authoritative state.
8. Record audit.
9. Emit events.
10. Notify affected parties.

---

# 17. Payment Administration

Admin payment screen:

```text
Payment
Payment Method
Payment Status
Provider Reference
Attempts
Order
Refunds
Financial Records
Audit
```

Sensitive payment data must be masked/minimized.

---

# 18. Refund Administration

Refund workflow:

```text
Admin
 ↓
Open Order/Payment
 ↓
Review Refund Eligibility
 ↓
Select Refund Reason
 ↓
Permission Check
 ↓
Step-Up if required
 ↓
Idempotency
 ↓
Refund Service
 ↓
Payment Provider
 ↓
Financial Records
 ↓
Audit
 ↓
Notification
```

---

# 19. Settlement Administration

Settlement screen:

```text
Settlement
Restaurant/Rider
Period
Gross
Adjustments
Net
Status
Settlement Items
Payout
Reconciliation
Audit
```

Admin should be able to investigate settlement discrepancies.

Financial records remain authoritative in the financial subsystem.

---

# 20. Promotion Administration

Admin promotion screen:

```text
Promotion List
Promotion Detail
Create
Edit
Activate
Pause
Disable
Usage
```

Admin operations must use the Promotions Engine.

Promotion rules must remain consistent with:

`docs/promotions/PROMOTION_RULES.md`

---

# 21. Review Administration

Review moderation screen:

```text
Reported Reviews
Pending Moderation
Published
Hidden
Removed
Reports
Moderation History
```

Admin actions must use the Reviews module.

---

# 22. Support Administration

Support section:

```text
Ticket Queue
Search
Filters
Ticket Detail
Conversation
Internal Notes
Assignment
Escalation
SLA
Audit
```

Support implementation must follow:

`docs/support/SUPPORT_RULES.md`

and

`docs/support/SUPPORT_SPEC.md`

---

# 23. Risk Administration

Risk dashboard:

```text
Risk Events
Risk Flags
Restrictions
Subject
Severity
Reason
History
```

Supported subjects:

```text
CUSTOMER
RESTAURANT
RIDER
```

Risk decisions must use the Trust & Risk Engine.

---

# 24. Risk Detail

Authorized admins may view:

* Risk events
* Triggering signals
* Current flag
* Current restriction
* Relevant history
* Administrative actions

Sensitive risk information must not be exposed to unauthorized staff.

---

# 25. System Settings

Admin settings may include:

```text
Dispatch Settings
Risk Settings
Promotion Settings
Support Settings
Notification Settings
Operational Limits
```

Settings should be stored in the existing system configuration mechanism.

---

# 26. Configuration Versioning

Sensitive configuration changes should record:

```text
Setting
Previous Value
New Value
Changed By
Reason
Timestamp
```

Where appropriate, configuration changes should have a history.

---

# 27. Admin Permission Management

Permission management should allow authorized Super Admins to manage administrative permissions.

The system must avoid uncontrolled permission escalation.

Permission changes require:

* Strong authorization
* Audit
* Step-up authentication
* Actor identification
* Target identification

---

# 28. Admin User Management

Authorized administrators may manage admin accounts.

Possible actions:

```text
View
Activate
Deactivate
Reset administrative access
Manage permissions
Review MFA status
Review sessions
```

Admin account management is highly sensitive.

---

# 29. Super Admin Controls

SUPER_ADMIN may access:

* Admin user management
* Permission configuration
* Critical configuration
* Sensitive operational actions

Every Super Admin action must be audited.

---

# 30. Audit Log Interface

Admin Audit section should support:

```text
Search
Filter
View Detail
Actor
Action
Resource
Timestamp
Reason
Request/Correlation ID
```

Filters may include:

* Actor
* Action
* Resource type
* Resource ID
* Date range
* Sensitive action
* Admin role

---

# 31. Audit Detail

Example:

```text
Actor:
admin@example

Action:
ORDER_CANCELLED

Resource:
Order #QB-12345

Previous State:
OUT_FOR_DELIVERY

New State:
CANCELLED

Reason:
SAFETY_ISSUE

Timestamp:
...

Correlation ID:
...
```

Sensitive fields must be appropriately masked.

---

# 32. Reporting

V1 reporting should use operational reports that can be generated from existing authoritative data.

Examples:

* Order volume
* Cancellation volume
* Refund volume
* Restaurant activity
* Rider activity
* Support volume
* Review moderation
* Risk events
* Settlement status

Do not build a separate analytics platform for V1 unless required later.

---

# 33. Report Authorization

Reports may contain sensitive data.

Every report endpoint must enforce:

* Role
* Permission
* Resource scope
* Date-range limits where appropriate
* Export permission where applicable

---

# 34. Search Architecture

V1 should use PostgreSQL-backed search/filtering.

Search should support appropriate indexed fields.

Do not introduce Elasticsearch/OpenSearch solely for Admin V1.

A future specialized search architecture requires an ADR.

---

# 35. Pagination

All large Admin lists must support pagination.

Examples:

* Customers
* Restaurants
* Riders
* Orders
* Payments
* Reviews
* Support tickets
* Risk events
* Audit logs

Maximum page size must be enforced server-side.

---

# 36. Bulk Operations

Bulk operations should use explicit endpoints.

Example:

```http
POST /admin/bulk-actions
```

The exact API design must follow the authoritative API specification.

Bulk operations should return per-item results where partial processing is possible.

Example:

```json
{
  "succeeded": [],
  "failed": []
}
```

---

# 37. Bulk Safety

Bulk operations must not silently bypass:

* Authorization
* Business rules
* Risk rules
* Financial rules
* Audit requirements

Every affected resource must be validated.

---

# 38. Export

If exports are implemented:

```text
Request Export
      ↓
Permission Check
      ↓
Scope Validation
      ↓
Generate Export
      ↓
Audit
      ↓
Controlled Download
```

Large exports should be asynchronous.

---

# 39. MFA

Admin login should support MFA.

The backend must verify MFA status.

SUPER_ADMIN should require the strongest available authentication policy.

---

# 40. Step-Up Authentication

Sensitive actions may require reauthentication or step-up verification.

Example:

```text
Admin
 ↓
Initiate Refund
 ↓
Step-Up Challenge
 ↓
Verification
 ↓
Refund Authorization
 ↓
Refund
```

Step-up authorization must have limited validity and must not become a permanent session bypass.

---

# 41. Session Security

Admin sessions should support:

* Expiration
* Revocation
* Reauthentication
* Device/session visibility where supported
* Suspicious login detection
* Rate limiting

Admin logout/revocation must invalidate relevant session state.

---

# 42. API Structure

Logical Admin API namespace:

```text
/admin
```

Potential resource groups:

```text
/admin/dashboard
/admin/customers
/admin/restaurants
/admin/riders
/admin/orders
/admin/payments
/admin/refunds
/admin/settlements
/admin/promotions
/admin/reviews
/admin/support
/admin/risk
/admin/settings
/admin/audit
/admin/reports
/admin/admin-users
```

These are logical API groupings. The existing `API_SPEC.md` remains authoritative for exact endpoint contracts.

Claude Code must not invent a conflicting endpoint when an existing API is already defined.

---

# 43. Authorization Middleware

All `/admin/*` APIs should pass through administrative authorization middleware.

Conceptually:

```text
Request
 ↓
Authentication
 ↓
Admin Identity
 ↓
Permission
 ↓
Resource Authorization
 ↓
Business Rules
 ↓
Sensitive Action Check
 ↓
Controller
```

Authorization must be performed server-side.

---

# 44. Audit Middleware

Sensitive administrative actions should automatically produce audit records where appropriate.

However, audit logging must capture meaningful domain information and must not blindly log secrets or sensitive credentials.

---

# 45. Idempotency

Sensitive repeatable operations should use idempotency.

Examples:

* Refund
* Cancellation
* Financial adjustment
* Bulk operation
* Permission update
* Critical configuration update

The existing `idempotency_keys` mechanism should be reused.

---

# 46. Database Transactions

Critical administrative operations should use database transactions.

Examples:

### Restaurant approval

```text
Approval state
+
Audit
+
Outbox
```

### Refund initiation

```text
Refund request state
+
Idempotency
+
Audit
+
Outbox
```

### Permission change

```text
Permission update
+
Audit
```

External provider calls must not be performed inside critical database transactions.

---

# 47. Outbox Integration

Administrative events affecting external systems must use the existing outbox architecture.

Examples:

```text
Admin cancellation
Admin refund
Restaurant suspension
Rider restriction
Customer restriction
Promotion activation
Support action
```

---

# 48. Notification Integration

Admin actions may generate:

* Push
* In-app
* SMS
* Email

according to the existing notification rules.

Admin must not implement an independent notification mechanism.

---

# 49. Realtime Integration

Admin dashboard may subscribe to authorized realtime channels.

Examples:

```text
Order updates
Delivery updates
Support updates
Risk updates
Payment updates
```

Realtime permissions must be enforced server-side.

---

# 50. Security Requirements

Admin Panel must protect against:

* Broken access control
* IDOR
* Privilege escalation
* CSRF where applicable
* Session theft
* Brute force
* Rate-limit bypass
* Sensitive data exposure
* Unsafe file handling
* Unauthorized exports
* Replay attacks
* Duplicate financial operations

---

# 51. Sensitive Data Handling

Admin responses should return the minimum required fields.

Sensitive data should be:

* Masked
* Redacted
* Permission-controlled
* Audited where accessed

Never return authentication secrets.

---

# 52. Admin File Uploads

Where Admin uploads documents:

* Validate file type
* Validate file size
* Validate authorization
* Store securely
* Prevent executable content
* Use controlled access URLs
* Audit sensitive uploads

---

# 53. Observability

Admin actions should integrate with platform observability.

Logs should include:

* Actor ID
* Admin role
* Action
* Resource
* Correlation ID
* Result
* Error where applicable

Metrics should include:

```text
admin_actions_total
admin_sensitive_actions_total
admin_auth_failures_total
admin_permission_denials_total
admin_bulk_operations_total
admin_export_operations_total
admin_errors_total
```

---

# 54. Failure Handling

If an external provider fails:

* Do not silently mark the operation successful.
* Preserve retryable state where applicable.
* Use outbox/job retry mechanisms.
* Display a clear operational error.
* Audit the attempted action.

If a transaction fails:

* Roll back the transactional changes.
* Do not create misleading audit state claiming success.

---

# 55. Concurrency

Examples:

### Duplicate Refund

Use idempotency and financial state checks.

### Concurrent Restaurant Suspension

Use transaction/state validation.

### Concurrent Configuration Changes

Use optimistic concurrency/version checking where appropriate.

### Concurrent Permission Changes

Use transactional updates and audit records.

---

# 56. Admin Testing

Required test categories:

```text
Unit
Integration
API
Security
Authorization
Concurrency
Idempotency
E2E
Regression
```

---

# 57. Required Authorization Tests

Test:

```text
ADMIN without permission → denied
ADMIN with permission → allowed
SUPER_ADMIN → allowed where permitted
Customer → denied
Restaurant user → denied
Rider → denied
Expired session → denied
Invalid step-up → denied
```

---

# 58. Required Resource Isolation Tests

Test:

```text
Admin unauthorized resource scope → denied
Restaurant A data → not exposed to Restaurant B
Customer private data → permission protected
Risk data → restricted
Financial data → restricted
Audit data → restricted
```

---

# 59. Required Financial Tests

Test:

* Duplicate refund
* Refund authorization
* Refund failure
* Provider timeout
* Concurrent refund
* Financial audit
* Settlement consistency

---

# 60. Required Operational Tests

Test:

* Restaurant approval
* Restaurant rejection
* Restaurant suspension
* Rider restriction
* Customer restriction
* Order cancellation
* Promotion activation
* Review moderation
* Support escalation
* Risk action

---

# 61. Required Security Tests

Test:

* IDOR
* Privilege escalation
* Permission bypass
* Session expiration
* MFA bypass
* Step-up bypass
* Export authorization
* Bulk action authorization
* Audit tampering
* Rate limiting

---

# 62. Admin E2E Flow

A representative operational flow:

```text
Admin Login
    ↓
MFA
    ↓
Dashboard
    ↓
Search Order
    ↓
Open Order
    ↓
Review Timeline
    ↓
Review Payment
    ↓
Review Delivery
    ↓
Open Support Ticket
    ↓
Determine Authorized Action
    ↓
Invoke Domain Engine
    ↓
Audit
    ↓
Notification
    ↓
Return to Dashboard
```

---

# 63. Restaurant Approval E2E

```text
Restaurant Application
        ↓
Admin Queue
        ↓
Review Documents
        ↓
Review Restaurant Data
        ↓
Approve / Reject
        ↓
Domain State Update
        ↓
Audit
        ↓
Notification
```

---

# 64. Refund E2E

```text
Admin
 ↓
Open Order
 ↓
Open Payment
 ↓
Review Refund Eligibility
 ↓
Permission Check
 ↓
Step-Up if Required
 ↓
Idempotency Check
 ↓
Refund Service
 ↓
Provider
 ↓
Financial Records
 ↓
Audit
 ↓
Notification
```

---

# 65. Risk E2E

```text
Risk Event
 ↓
Risk Engine
 ↓
Risk Flag
 ↓
Admin Review
 ↓
Authorized Action
 ↓
Risk Engine
 ↓
Restriction
 ↓
Audit
 ↓
Notification where appropriate
```

---

# 66. Admin UI Principles

Admin Panel should prioritize:

* Operational clarity
* Fast search
* Clear status
* Safe destructive actions
* Visible audit information
* Permission-aware UI
* Clear confirmation dialogs
* Minimal unnecessary complexity

Destructive or sensitive actions should clearly display:

* Action
* Target
* Consequence
* Required reason
* Confirmation
* Step-up requirement where applicable

---

# 67. No Direct Database Operations

Admin UI must never contain functionality that directly writes to production database tables outside approved backend services.

All actions go through backend APIs.

---

# 68. Configuration of Thresholds

Operational thresholds should be configurable where already defined by the architecture.

Examples:

* Dispatch radius
* Dispatch offer timeout
* Risk thresholds
* Support SLA
* Promotion limits

Configuration must remain centralized.

---

# 69. Documentation Dependencies

Before implementing Admin, Claude Code must read:

```text
CLAUDE.md

docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md

docs/flows/GOLDEN_E2E_FLOW.md

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

docs/decisions/ADR/*
```

The ADR directory must be reviewed for decisions affecting Admin behavior.

---

# 70. Conflict Handling

If Admin implementation conflicts with an existing specification:

1. Stop the conflicting implementation.
2. Identify the affected specifications.
3. Explain the conflict.
4. Determine whether an existing ADR already resolves it.
5. If no ADR exists, propose an ADR.
6. Obtain approval before changing frozen architecture.
7. Update affected specifications.
8. Then continue implementation.

No silent changes are permitted.

---

# 71. V1 Exclusions

Admin V1 does not include:

* AI operations assistant
* AI autonomous decision-making
* Fully autonomous moderation
* Complex BI platform
* Advanced predictive analytics
* Microservices architecture
* Kubernetes-specific administration
* Enterprise multi-organization admin hierarchy
* Full call-center workforce management
* Complex external CRM synchronization
* Automated compensation engine
* Advanced data warehouse

These may be considered later through explicit product/architecture decisions.

---

# 72. Acceptance Criteria

Phase 13 Admin & Operations is complete when:

* Admin authentication is defined.
* MFA requirements are defined.
* Permission model is defined.
* Super Admin controls are defined.
* Customer management is defined.
* Restaurant management is defined.
* Restaurant approval is defined.
* Rider management is defined.
* Order operations are defined.
* Payment operations are defined.
* Refund operations are defined.
* Settlement operations are defined.
* Promotion administration is defined.
* Review moderation is defined.
* Support administration is defined.
* Risk administration is defined.
* System configuration is defined.
* Audit requirements are defined.
* Search/filtering is defined.
* Bulk operations are defined.
* Export controls are defined.
* Sensitive actions are protected.
* Step-up authentication is defined.
* Financial integrity is preserved.
* Domain engines remain authoritative.
* Security tests are defined.
* Concurrency tests are defined.
* Idempotency requirements are defined.
* Admin E2E flows are defined.
* No unauthorized architectural changes are introduced.

---

# 73. Final Architecture Principle

The final Admin architecture is:

```text
                    ADMIN PANEL
                         │
                         ▼
                   ADMIN API
                         │
                         ▼
               AUTHORIZATION LAYER
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       PERMISSION CHECK        RESOURCE CHECK
             │                       │
             └───────────┬───────────┘
                         ▼
                  DOMAIN SERVICE
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
     ORDER            PAYMENT            RISK
       │                 │                 │
       ▼                 ▼                 ▼
  ORDER ENGINE      FINANCIAL ENGINE   RISK ENGINE
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                    AUDIT / OUTBOX
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       NOTIFICATIONS             REALTIME
```

The Admin Panel is therefore an **authorized operational control layer over QuickBite's existing domain engines**, not a parallel business-logic system.
