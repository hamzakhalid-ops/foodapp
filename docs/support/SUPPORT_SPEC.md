# QuickBite Support & Customer Service Specification

**Document:** `docs/support/SUPPORT_SPEC.md`
**Product:** QuickBite
**Phase:** 12 — Support & Customer Service
**Status:** V1 Specification
**Authority:** Support system architecture and implementation specification
**Last Updated:** 2026-09-25

---

# 1. Purpose

This document defines the technical and product specification for QuickBite Support & Customer Service.

The system provides support capabilities for:

* Customers
* Restaurant Owners
* Restaurant Operators
* Riders
* Admin/support personnel
* Super Admins

The support system is implemented inside the existing QuickBite modular monolith.

It integrates with:

* Authentication
* Authorization
* Orders
* Payments
* Refunds
* Deliveries
* Restaurants
* Riders
* Promotions
* Reviews
* Trust & Risk
* Notifications
* Realtime
* Audit
* Financial systems

---

# 2. Architecture

QuickBite V1 remains a modular monolith.

Support is a backend module:

```text
backend/
└── support/
    ├── support.controller
    ├── support.service
    ├── support.repository
    ├── support.rules
    ├── support.authorization
    ├── support.validation
    ├── support.events
    ├── support.notifications
    └── support.tests
```

The exact framework/file naming must follow the repository's implementation conventions.

Do not create a separate support microservice for V1.

---

# 3. Existing Database Entities

The architecture already includes:

```text
support_tickets
support_messages
```

These remain the core support entities.

Existing database conventions must be followed:

* PostgreSQL as source of truth
* UUID/appropriate project identifier strategy
* timezone-aware timestamps
* foreign keys
* indexes
* constraints
* migrations
* auditability

Any required schema change must be implemented through a version-controlled migration.

---

# 4. Logical Support Ticket Model

A support ticket logically contains:

```text
id
ticket_number
requester_type
requester_id

category
priority
status

subject
description

customer_id
restaurant_id
rider_id
order_id
payment_id
refund_id
delivery_id

assigned_admin_id

first_response_at
resolved_at
closed_at

sla_first_response_due_at
sla_resolution_due_at

escalated_at

created_at
updated_at
```

Not every relationship is required for every ticket.

For example:

* Account issue → no order
* Order issue → order reference
* Payment issue → payment/order reference
* Rider earnings issue → rider/financial reference
* Restaurant issue → restaurant reference

The database implementation must use nullable relationships where appropriate.

---

# 5. Ticket Number

Each ticket should have a human-readable ticket number.

Example:

```text
QB-SUP-000001
QB-SUP-000002
```

The ticket number is for support/customer communication.

The internal primary key remains the database identifier.

Ticket numbers must be unique.

---

# 6. Support Message Model

A support message logically contains:

```text
id
ticket_id

sender_type
sender_id

message_type
body

attachments

created_at
updated_at
```

Message types:

```text
CUSTOMER_MESSAGE
RESTAURANT_MESSAGE
RIDER_MESSAGE
SUPPORT_MESSAGE
INTERNAL_NOTE
SYSTEM_EVENT
```

Internal notes must never be returned to external users.

---

# 7. Message Ordering

Messages must have deterministic ordering.

Primary ordering:

```text
created_at ASC
```

Where timestamps collide, use a stable secondary ordering such as message ID.

Clients must not determine message ordering.

---

# 8. Ticket Categories

Supported V1 categories are defined by `SUPPORT_RULES.md`.

The backend must maintain category validity.

The client should retrieve or use centrally defined categories rather than duplicating independent category definitions.

---

# 9. Ticket Priority

Supported:

```text
LOW
NORMAL
HIGH
URGENT
```

Priority changes are server-controlled.

A customer cannot simply submit:

```json
{
  "priority": "URGENT"
}
```

and force the ticket into urgent operational handling.

Backend rules determine whether requested priority is accepted.

---

# 10. Ticket Status

Supported:

```text
OPEN
IN_PROGRESS
WAITING_FOR_CUSTOMER
WAITING_FOR_INTERNAL
RESOLVED
CLOSED
REOPENED
```

All transitions are validated by the support service.

---

# 11. Status History

Ticket status changes should be recorded in an auditable history mechanism.

Each transition should capture:

```text
ticket_id
previous_status
new_status
actor_id
actor_type
reason
created_at
```

The exact storage mechanism must follow the existing repository's audit/history conventions.

---

# 12. Assignment

A ticket may have:

```text
assigned_admin_id = NULL
```

when unassigned.

Once assigned:

```text
assigned_admin_id = support/admin user
```

Assignment operations must:

* Verify admin permission
* Verify target support user eligibility
* Update ticket atomically
* Record audit information
* Emit relevant internal realtime/notification events

---

# 13. Queue Model

V1 does not require a sophisticated workforce management system.

The support queue may be represented through:

* Unassigned tickets
* Assigned tickets
* Priority
* Category
* Status
* SLA state
* Creation time
* Escalation state

Admin users can filter and sort the queue.

Example operational filters:

```text
Status
Priority
Category
Assigned / Unassigned
Requester type
Order linked / Not linked
Escalated
SLA at risk
SLA breached
Created date
Updated date
```

---

# 14. SLA Model

The support system should calculate SLA timestamps from configurable rules.

Logical values:

```text
first_response_due_at
resolution_due_at
first_response_at
resolved_at
```

Example:

```text
created_at
      ↓
first response deadline
      ↓
resolution deadline
```

SLA configuration must not be hard-coded into frontend applications.

---

# 15. SLA States

A ticket can logically be:

```text
ON_TRACK
AT_RISK
BREACHED
COMPLETED
```

These may be calculated rather than persisted if the implementation architecture supports that efficiently.

SLA status must be based on backend time.

---

# 16. Escalation

Escalation can occur:

* Manually
* Due to operational severity
* Due to SLA conditions
* Due to safety/security concerns
* Due to financial significance
* Due to repeated unsuccessful handling

Escalation must preserve:

* Original ticket
* Conversation
* Attachments
* Audit trail
* Existing assignment history

---

# 17. Ticket Search

Admin support users should be able to search by:

* Ticket number
* Customer identifier where authorized
* Restaurant identifier where authorized
* Rider identifier where authorized
* Order identifier
* Payment identifier
* Relevant support metadata

Search must be permission-aware.

A user must not receive search results for resources they are not authorized to view.

---

# 18. Ticket Filtering

Admin support interfaces should support filters for:

```text
status
priority
category
requester type
assigned admin
unassigned
escalated
SLA at risk
SLA breached
created date
updated date
```

Pagination is required.

The backend must enforce maximum page sizes.

---

# 19. Ticket Creation API

The API layer should expose an endpoint equivalent to:

```http
POST /support/tickets
```

The request may contain:

```json
{
  "category": "ORDER_PROBLEM",
  "subject": "Problem with my order",
  "message": "The order arrived incomplete.",
  "order_id": "..."
}
```

The backend must:

1. Authenticate requester.
2. Determine actor identity.
3. Validate category.
4. Validate resource references.
5. Verify ownership/authorization.
6. Apply support rules.
7. Run relevant risk/security checks.
8. Create ticket.
9. Create initial message.
10. Generate audit information.
11. Create required outbox events.
12. Return the created ticket.

Ticket creation must be transactional.

---

# 20. Ticket Retrieval API

Equivalent endpoint:

```http
GET /support/tickets/{ticketId}
```

The backend must verify access before returning the ticket.

Returned information depends on actor type.

Customers should receive:

* Ticket information
* Customer-visible messages
* Status
* Relevant timestamps
* Attachments they are authorized to view

Support admins may receive:

* Internal notes
* Assignment
* SLA information
* Operational metadata
* Audit information according to permission

---

# 21. Ticket List API

Equivalent endpoint:

```http
GET /support/tickets
```

External users receive only their authorized tickets.

Admin users may receive operational queues subject to permission.

Required controls:

* Pagination
* Filters
* Sorting
* Authorization
* Maximum page size

---

# 22. Message API

Equivalent endpoint:

```http
POST /support/tickets/{ticketId}/messages
```

Request:

```json
{
  "message": "Here is the screenshot showing the problem.",
  "attachments": []
}
```

Backend must:

* Verify ticket access
* Verify ticket state
* Validate message
* Validate attachments
* Create message
* Generate notification/outbox event
* Publish realtime event where applicable
* Audit sensitive actions

---

# 23. Internal Note API

Equivalent endpoint:

```http
POST /support/tickets/{ticketId}/internal-notes
```

Only authorized support/admin users may call this operation.

Internal notes must never appear in customer/restaurant/rider responses.

---

# 24. Status API

Equivalent endpoint:

```http
PATCH /support/tickets/{ticketId}/status
```

Example:

```json
{
  "status": "IN_PROGRESS"
}
```

Backend validates:

* Actor permission
* Current state
* Target state
* Transition validity
* Required fields
* Audit requirements

---

# 25. Assignment API

Equivalent endpoint:

```http
PATCH /support/tickets/{ticketId}/assignment
```

Example:

```json
{
  "assigned_admin_id": "..."
}
```

Only authorized admin/support users may assign or reassign tickets.

---

# 26. Priority API

Equivalent endpoint:

```http
PATCH /support/tickets/{ticketId}/priority
```

Priority changes require authorization.

The backend may automatically increase priority for specific operational/security conditions.

---

# 27. Category API

Equivalent endpoint:

```http
PATCH /support/tickets/{ticketId}/category
```

Category changes are support/admin operations.

Changing a category must not bypass security, financial, risk, or operational rules.

---

# 28. Escalation API

Equivalent endpoint:

```http
POST /support/tickets/{ticketId}/escalate
```

Escalation request should contain a reason.

Example:

```json
{
  "reason": "Customer safety issue requires immediate operational review."
}
```

The escalation must be audited.

---

# 29. Reopen API

Equivalent endpoint:

```http
POST /support/tickets/{ticketId}/reopen
```

Reopening must verify:

* Ticket is eligible
* Requester has permission
* Reopening window/rules
* Current state

The backend sets:

```text
status = REOPENED
```

and records the action.

---

# 30. Close API

Equivalent endpoint:

```http
POST /support/tickets/{ticketId}/close
```

Closing should generally occur after resolution.

The backend should prevent arbitrary closing of tickets that have not met the required support workflow.

---

# 31. Attachment Flow

Attachments should follow a controlled flow.

Recommended architecture:

```text
Client
  ↓
Request upload authorization
  ↓
Backend validates ticket access
  ↓
Backend returns controlled upload target
  ↓
Client uploads to object storage
  ↓
Backend finalizes attachment
  ↓
Attachment associated with message
```

The client must not be allowed to attach arbitrary storage URLs.

---

# 32. Attachment Restrictions

V1 should restrict:

* Maximum file size
* Allowed MIME types
* File extensions
* Number of attachments per message
* Storage lifetime/access

Executable files should not be accepted.

The exact limits should be configuration-driven.

---

# 33. Realtime Events

Support realtime events should use the existing WebSocket architecture.

Example event names:

```text
support.ticket.created
support.ticket.updated
support.ticket.status_changed
support.ticket.assigned
support.ticket.message_created
support.ticket.escalated
support.ticket.resolved
support.ticket.reopened
```

The exact event naming convention must remain consistent with the existing realtime specification.

---

# 34. Realtime Authorization

A client may subscribe only to channels it is authorized to access.

Example:

```text
support:ticket:{ticketId}
```

Backend must verify access before subscription.

Admin support channels require support/admin authorization.

Internal note events must never be sent to external clients.

---

# 35. Notification Events

Notifications should be generated for relevant events.

Examples:

### Customer

* Support ticket created
* Support replied
* Additional information requested
* Ticket resolved
* Ticket reopened

### Restaurant

* Support response
* Additional information requested
* Ticket resolved

### Rider

* Support response
* Additional information requested
* Ticket resolved

### Support/Admin

* New ticket assigned
* Ticket escalated
* SLA risk
* SLA breach
* New customer response

Notification preferences and delivery channels must follow the existing notification system.

---

# 36. Outbox Integration

Support events that trigger external effects must use the outbox system.

Example:

```text
Database transaction
    ↓
Create ticket
    ↓
Create initial message
    ↓
Create outbox event
    ↓
Commit
    ↓
Worker processes event
    ↓
Notification / realtime / external effect
```

Do not call external notification providers inside the critical database transaction.

---

# 37. Order Integration

Support can link to an order.

Order information displayed to support must come from the authoritative order subsystem.

Support may read:

* Order number
* Order status
* Restaurant
* Customer
* Rider where authorized
* Total
* Payment state
* Delivery state
* Relevant timestamps

Support must not invent or maintain a duplicate order state.

---

# 38. Cancellation Integration

If support determines that an order cancellation is appropriate, the cancellation must go through:

```text
Cancellation Rules Engine
```

Support must not directly set:

```text
order.status = CANCELLED
```

without the cancellation subsystem.

---

# 39. Payment Integration

Support can inspect payment information through the payment subsystem.

It may initiate an authorized refund through the existing refund mechanism.

Required controls:

* Authorization
* Idempotency
* Transaction safety
* Provider handling
* Audit
* Financial reconciliation

---

# 40. Risk Integration

Support events that represent risk signals may create Trust & Risk events.

Examples:

```text
REPEATED_FALSE_COMPLAINT
EXCESSIVE_REFUND_REQUEST
SUSPICIOUS_ACCOUNT_ACTIVITY
ABUSE_REPORT
```

The exact risk classification must remain owned by the Trust & Risk Engine.

---

# 41. Promotion Integration

Promotion-related support may inspect:

* Promotion eligibility
* Promotion application
* Promotion usage
* Discount result

Support must not manually modify promotion usage records without the Promotions Engine.

---

# 42. Review Integration

Review complaints may create support tickets.

Examples:

* Inappropriate review
* Review dispute
* Abuse report
* Review moderation request

Review moderation remains governed by the Reviews module.

Support should not directly alter review status without authorized review moderation functionality.

---

# 43. Restaurant Authorization

Restaurant support operations must use the existing restaurant authorization model.

The system must distinguish:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

The support system must not create another restaurant role.

Restaurant Operator support access must not automatically grant owner-only financial/account permissions.

---

# 44. Admin Permissions

Suggested permission families:

```text
support.ticket.view
support.ticket.create
support.ticket.assign
support.ticket.reassign
support.ticket.update
support.ticket.priority
support.ticket.category
support.ticket.message
support.ticket.internal_note
support.ticket.escalate
support.ticket.resolve
support.ticket.close
support.ticket.reopen
support.ticket.refund
support.ticket.cancel_order
support.ticket.audit
```

The exact permission naming must align with the existing authorization system.

Permissions must be centrally enforced.

---

# 45. Sensitive Actions

The following should be treated as sensitive:

* Refund
* Order cancellation override
* Account restriction
* Security action
* Risk-related action
* Financial adjustment
* Access to highly sensitive support information

Sensitive actions require:

* Explicit permission
* Audit log
* Reason where appropriate
* Idempotency where applicable
* Existing business engine enforcement

---

# 46. Support Dashboard

Admin support dashboard should provide:

### Queue

* Open tickets
* In-progress tickets
* Unassigned tickets
* High-priority tickets
* Urgent tickets
* SLA-at-risk tickets
* SLA-breached tickets

### Ticket Detail

* Requester
* Category
* Priority
* Status
* Assignment
* SLA
* Related order
* Related payment
* Related delivery
* Conversation
* Internal notes
* Attachments
* Audit information

---

# 47. Customer Support UI

Customer app should provide:

```text
Support
├── My Tickets
├── Create Ticket
└── Ticket Detail
```

Ticket detail:

```text
Ticket Number
Subject
Category
Status
Conversation
Attachments
Send Message
```

Customers must not see:

* Internal notes
* Internal risk information
* Admin-only audit information
* Other users' data

---

# 48. Restaurant Support UI

Restaurant app should provide:

```text
Support
├── My Restaurant Tickets
├── Create Ticket
└── Ticket Detail
```

The interface should support:

* Order-related support
* Restaurant operational support
* Payment/settlement questions
* Rider/customer problems
* Technical issues
* Abuse/safety reports

---

# 49. Rider Support UI

Rider app should provide:

```text
Support
├── My Tickets
├── Create Ticket
└── Ticket Detail
```

Relevant categories should be presented according to rider permissions.

---

# 50. Admin Support UI

Admin panel should provide:

```text
Support
├── Queue
├── Search
├── Filters
├── Ticket Detail
├── Assignment
├── Conversation
├── Internal Notes
├── Escalation
└── Audit
```

---

# 51. Error Handling

Support APIs should use structured errors.

Examples:

```text
SUPPORT_TICKET_NOT_FOUND
SUPPORT_ACCESS_DENIED
SUPPORT_INVALID_CATEGORY
SUPPORT_INVALID_PRIORITY
SUPPORT_INVALID_STATUS_TRANSITION
SUPPORT_TICKET_CLOSED
SUPPORT_REOPEN_NOT_ALLOWED
SUPPORT_MESSAGE_INVALID
SUPPORT_ATTACHMENT_INVALID
SUPPORT_ATTACHMENT_TOO_LARGE
SUPPORT_ASSIGNMENT_NOT_ALLOWED
SUPPORT_ESCALATION_NOT_ALLOWED
SUPPORT_SLA_CONFIGURATION_ERROR
```

Error codes must follow the project's global API error conventions.

---

# 52. Concurrency

Support must handle concurrent operations safely.

Examples:

### Two agents resolve the same ticket

Only one valid state transition should succeed.

### Two agents assign the same ticket

The backend must prevent inconsistent assignment state.

### Customer sends message while support closes ticket

The backend must apply deterministic state/message rules.

### Customer retries message submission

Idempotency should prevent duplicate messages where the operation supports idempotency keys.

---

# 53. Database Indexing

Support tables should have indexes supporting:

```text
ticket_number
requester_id
customer_id
restaurant_id
rider_id
order_id
payment_id
delivery_id
status
priority
category
assigned_admin_id
created_at
updated_at
```

Composite indexes should be added only where actual query patterns justify them.

Do not create excessive indexes without operational need.

---

# 54. Data Retention

Support data may contain sensitive operational information.

Retention must follow QuickBite's broader privacy and data-retention policy.

At minimum:

* Do not delete active tickets.
* Preserve audit records according to audit retention requirements.
* Preserve financial-support evidence as required for financial reconciliation.
* Remove or restrict unnecessary sensitive information according to applicable retention rules.

Retention periods should be configuration/policy decisions rather than hard-coded into application logic.

---

# 55. Observability

Support operations should emit:

### Logs

* Ticket creation
* Ticket update
* Assignment
* Message creation
* Escalation
* Resolution
* Closure
* Sensitive actions
* Errors

### Metrics

Examples:

```text
support_tickets_created_total
support_tickets_resolved_total
support_tickets_closed_total
support_tickets_reopened_total
support_messages_total
support_ticket_resolution_time
support_first_response_time
support_sla_breaches_total
support_escalations_total
support_attachment_failures_total
```

### Tracing

Support requests should participate in the global request/correlation tracing system.

---

# 56. Security Testing

Security tests must verify:

* Tenant isolation
* Object-level authorization
* Role authorization
* Permission enforcement
* Internal note protection
* Attachment protection
* Ticket enumeration protection
* Search authorization
* WebSocket authorization
* Rate limiting
* Sensitive action authorization

---

# 57. API Idempotency

Where an endpoint can create duplicate or financially harmful operations, support the standard idempotency mechanism.

Examples:

```http
Idempotency-Key: <unique-key>
```

The existing `idempotency_keys` table must be reused.

---

# 58. API Pagination

Ticket and message lists must use the project's standard pagination mechanism.

The backend must enforce:

* Maximum page size
* Valid cursors/page parameters
* Authorization on every query

The frontend must not assume unlimited history can be loaded in one request.

---

# 59. Support Message Limits

The backend should enforce:

* Maximum message length
* Attachment count
* Attachment size
* Attachment type
* Request rate

Limits should be configurable.

---

# 60. Abuse Prevention

Support endpoints are potential abuse targets.

Controls include:

* Rate limiting
* Authentication
* Authorization
* Ticket creation limits
* Message limits
* Attachment restrictions
* Risk integration
* Audit logging
* Duplicate detection

Repeated abuse may create Trust & Risk signals.

---

# 61. Testing Matrix

## Unit Tests

Test:

* Category validation
* Priority validation
* Status transitions
* SLA calculation
* Assignment rules
* Escalation rules
* Reopen rules
* Attachment validation

---

## Integration Tests

Test:

* Database transactions
* Ticket + initial message creation
* Status history
* Assignment
* Outbox events
* Notifications
* Risk events
* Order references
* Payment/refund integration

---

## API Tests

Test:

* Authentication
* Authorization
* Ticket creation
* Ticket retrieval
* Ticket listing
* Message creation
* Internal notes
* Assignment
* Status updates
* Priority changes
* Category changes
* Escalation
* Resolve
* Close
* Reopen

---

## Realtime Tests

Test:

* Authorized subscription
* Unauthorized subscription
* Message events
* Status events
* Reconnection
* Duplicate events
* Offline recovery

---

## Security Tests

Test:

```text
Customer A → Customer B ticket
Restaurant A → Restaurant B ticket
Rider A → Rider B ticket
Customer → internal notes
Unauthorized admin → sensitive action
Unauthorized user → attachment
Unauthorized user → WebSocket channel
```

All must be denied.

---

## Concurrency Tests

Test:

* Concurrent assignment
* Concurrent status transition
* Concurrent close/reopen
* Concurrent message submission
* Concurrent refund action
* Idempotent retry

---

# 62. End-to-End Support Flows

## Flow A — Customer Creates Ticket

```text
Customer
  ↓
Open Support
  ↓
Select Category
  ↓
Enter Subject/Message
  ↓
Optional Order Reference
  ↓
Submit
  ↓
Backend Authorization
  ↓
Validate
  ↓
Create Ticket
  ↓
Create Initial Message
  ↓
Create Audit/Event
  ↓
Outbox
  ↓
Support Queue
```

---

## Flow B — Support Responds

```text
Support Agent
  ↓
Open Ticket
  ↓
Review Context
  ↓
Send Message
  ↓
Backend Authorization
  ↓
Create Message
  ↓
Audit
  ↓
Outbox
  ↓
Notification
  ↓
Realtime Update
  ↓
Customer Receives Response
```

---

## Flow C — Support Needs More Information

```text
Support Agent
  ↓
Request Information
  ↓
Ticket = WAITING_FOR_CUSTOMER
  ↓
Notification
  ↓
Customer Responds
  ↓
Ticket = IN_PROGRESS
  ↓
Support Continues
```

---

## Flow D — Support Resolves Issue

```text
Support Agent
  ↓
Resolution Provided
  ↓
Ticket = RESOLVED
  ↓
Audit
  ↓
Notification
  ↓
Customer Reviews Resolution
```

---

## Flow E — Customer Reopens

```text
Customer
  ↓
Open Resolved Ticket
  ↓
Reopen
  ↓
Backend Eligibility Check
  ↓
Ticket = REOPENED
  ↓
Notification
  ↓
Support Queue
```

---

## Flow F — Support Refund

```text
Support Agent
  ↓
Review Ticket
  ↓
Verify Order/Payment
  ↓
Authorization
  ↓
Refund Rules
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

Support never directly changes payment records to simulate a refund.

---

# 63. Support and Financial Integrity

Support must remain separated from financial accounting.

The correct relationship is:

```text
Support
   ↓
Authorized Operational Action
   ↓
Payment / Refund / Financial Engine
   ↓
Financial Records
   ↓
Settlement / Reconciliation
```

Not:

```text
Support
   ↓
Direct database modification
```

---

# 64. Support and Risk Integrity

The relationship is:

```text
Support Activity
      ↓
Risk Signal where applicable
      ↓
Trust & Risk Engine
      ↓
Risk Flag / Restriction
```

Support does not replace the Trust & Risk Engine.

---

# 65. Support and Notification Integrity

The relationship is:

```text
Support Action
      ↓
Database Transaction
      ↓
Outbox Event
      ↓
Notification Worker
      ↓
Push / Email / SMS / In-App
```

Realtime events use the existing WebSocket infrastructure.

---

# 66. Support and Audit Integrity

Important support actions follow:

```text
Actor
 ↓
Authorization
 ↓
Action
 ↓
Database Change
 ↓
Audit Event
```

Audit records must identify the actor and affected resource.

---

# 67. Performance Requirements

V1 support does not require a separate search cluster.

PostgreSQL-backed search/filtering is sufficient initially.

If support volume later requires specialized search infrastructure, that should be introduced through an ADR.

Do not introduce Elasticsearch/OpenSearch merely for V1 support.

---

# 68. Scalability

The support module should remain horizontally scalable as part of the modular backend.

State should remain in:

* PostgreSQL
* Redis where appropriate
* Object storage
* Existing queue/outbox infrastructure

Do not store authoritative ticket state in process memory.

---

# 69. Failure Handling

If notification delivery fails:

* Ticket/message remains committed.
* Outbox event remains retryable.
* Support operation is not rolled back solely because notification delivery failed.

If realtime delivery fails:

* Persisted ticket/message remains authoritative.
* Client can retrieve state through API after reconnection.

If attachment processing fails:

* Attachment must not be treated as successfully associated.
* User receives an appropriate error.
* Partial storage objects should be cleaned up according to storage lifecycle rules.

---

# 70. Support Module Boundaries

The support module owns:

* Tickets
* Conversations
* Internal notes
* Support assignment
* Support escalation
* Support SLA metadata
* Support-specific audit events

Other modules own their own authoritative data.

```text
Support
 ├── Orders → Order Module
 ├── Payments → Payment Module
 ├── Refunds → Refund Module
 ├── Delivery → Delivery Module
 ├── Risk → Trust & Risk Engine
 ├── Promotions → Promotions Engine
 ├── Reviews → Reviews Module
 └── Notifications → Notification System
```

---

# 71. V1 Implementation Sequence

Support should be implemented in this order:

### Step 1

Database/migrations for required support fields and constraints.

### Step 2

Support authorization.

### Step 3

Ticket creation.

### Step 4

Ticket retrieval/listing.

### Step 5

Messages.

### Step 6

Internal notes.

### Step 7

Status lifecycle.

### Step 8

Assignment.

### Step 9

Priority/category handling.

### Step 10

Attachments.

### Step 11

Notifications/outbox.

### Step 12

Realtime.

### Step 13

Escalation/SLA.

### Step 14

Order/payment/refund integration.

### Step 15

Risk integration.

### Step 16

Customer UI.

### Step 17

Restaurant UI.

### Step 18

Rider UI.

### Step 19

Admin support UI.

### Step 20

Complete support test suite.

---

# 72. Documentation Dependencies

Before implementing support, Claude Code must read:

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
```

Only read additional documents when the implementation requires them.

---

# 73. Conflict Handling

If implementation discovers a conflict between:

* Support specification
* Existing database specification
* API specification
* Security specification
* Payment specification
* Order specification
* Risk specification
* Notification specification

Claude Code must:

1. Stop the conflicting implementation.
2. Identify the conflict.
3. Identify affected documents.
4. Explain the technical impact.
5. Propose the smallest coherent change.
6. Request approval.
7. Update the authoritative specifications.
8. Then continue implementation.

No silent architectural changes are permitted.

---

# 74. V1 Non-Goals

The following are explicitly outside Phase 12 V1:

```text
Call center infrastructure
Telephony integration
AI support agent
AI chatbot
AI ticket classification
AI sentiment analysis
Voice support
Complex workforce scheduling
Advanced CRM integration
Predictive support analytics
Automated compensation engine
Complex omnichannel contact center
External helpdesk synchronization
```

These require separate product and architecture decisions.

---

# 75. Acceptance Criteria

Phase 12 is considered technically complete when:

* Customers can create support tickets.
* Restaurants can create authorized support tickets.
* Riders can create support tickets.
* Support/admin users can manage tickets according to permissions.
* Ticket status transitions are enforced.
* Assignment is enforced.
* Priority is enforced.
* Categories are enforced.
* Internal notes are private.
* Customer-visible messages work.
* Attachments are securely controlled.
* Ticket access is tenant/resource isolated.
* Order-related support integrates with orders.
* Payment/refund support integrates with payment systems.
* Delivery support integrates with delivery systems.
* Risk-related support integrates with Trust & Risk.
* Notifications use existing notification infrastructure.
* Realtime uses existing WebSocket infrastructure.
* Sensitive actions are audited.
* Idempotency is implemented where required.
* Rate limiting exists.
* Concurrency is handled.
* Security tests exist.
* API tests exist.
* Integration tests exist.
* End-to-end support flows are tested.
* No support logic bypasses authoritative business engines.
* No new restaurant role is introduced.
* No V1 call-center infrastructure is introduced.

---

# 76. Final Architecture Principle

QuickBite support follows this architecture:

```text
CUSTOMER / RESTAURANT / RIDER
            │
            ▼
       Support API
            │
            ▼
    Authorization Layer
            │
            ▼
      Support Module
       │    │    │
       │    │    └── SLA / Escalation
       │    └─────── Assignment / Conversation
       └──────────── Ticket Lifecycle
            │
            ├── Order Module
            ├── Payment Module
            ├── Delivery Module
            ├── Trust & Risk Engine
            ├── Promotions Engine
            ├── Reviews Module
            ├── Notification System
            ├── Realtime/WebSocket
            └── Audit System
```

The support module provides controlled assistance around the platform.

It does **not** become an alternative order engine, payment engine, dispatch engine, financial engine, or risk engine.

This separation preserves the existing QuickBite architecture and keeps the V1 implementation secure, auditable, and maintainable.
