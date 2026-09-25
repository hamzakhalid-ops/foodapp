# QuickBite — Reviews & Ratings Technical Specification

**Path:** `docs/reviews/REVIEW_SPEC.md`
**Status:** Frozen Specification
**Phase:** 11 — Reviews & Ratings
**Architecture:** Modular Monolith
**Database:** PostgreSQL
**Realtime:** WebSocket + Outbox
**Cache:** Redis

---

# 1. Purpose

This document defines the technical architecture for implementing QuickBite Reviews & Ratings.

It translates:

```text
docs/reviews/REVIEW_RULES.md
```

into backend modules, database behavior, APIs, services, authorization, events, caching, moderation, testing, and operational requirements.

The document must be treated as an implementation contract.

---

# 2. Architectural Position

Reviews belong to the Reviews module of the QuickBite modular monolith.

Conceptually:

```text
backend/
└── modules/
    └── reviews/
        ├── domain/
        ├── application/
        ├── infrastructure/
        ├── controllers/
        ├── services/
        ├── repositories/
        └── tests/
```

The Reviews module owns:

* Review creation
* Review retrieval
* Review editing
* Review lifecycle
* Restaurant responses
* Review reporting
* Moderation workflow
* Rating aggregation queries
* Review-specific events

The Reviews module does not own:

* Orders
* Customer identity
* Restaurant identity
* Authentication
* Authorization policy
* Trust & Risk policy
* Notifications
* Payments
* Settlements

Those capabilities remain owned by their respective modules.

---

# 3. Module Dependencies

The Reviews module depends on:

```text
Auth / Users
Orders
Restaurants
Restaurant Staff
Trust & Risk
Notifications
Audit
Database
Outbox
Realtime
```

Dependency direction must remain controlled.

The Reviews module should call application services/contracts rather than directly manipulating another module's tables unless the architecture explicitly permits it.

---

# 4. Existing Database Model

The existing database specification contains:

```text
reviews
---------
id
order_id
customer_id
restaurant_id
rating
comment
status
created_at
updated_at
```

And:

```text
review_responses
----------------
id
review_id
restaurant_user_id
response
created_at
updated_at
```

And:

```text
review_reports
--------------
id
review_id
reported_by
reason
status
resolved_by
resolved_at
created_at
```

The implementation must add constraints and indexes required by this specification.

---

# 5. Required Database Constraints

The `reviews` table must enforce:

```text
rating >= 1
rating <= 5
```

and:

```text
UNIQUE(order_id)
```

where the one-review-per-order rule applies.

Foreign keys must exist for:

```text
order_id
customer_id
restaurant_id
```

Status must be restricted to the supported review statuses.

Review responses must reference valid reviews.

Reports must reference valid reviews.

---

# 6. Recommended Database Indexes

Indexes should support:

```text
reviews(order_id)
reviews(customer_id, created_at)
reviews(restaurant_id, created_at)
reviews(restaurant_id, status, created_at)
reviews(status, created_at)

review_responses(review_id)
review_reports(review_id, status)
```

Exact indexes should be validated against actual query patterns.

Do not create excessive indexes without evidence.

---

# 7. Review Domain Entity

Conceptual entity:

```text
Review
```

Fields:

```text
id
orderId
customerId
restaurantId
rating
comment
status
createdAt
updatedAt
```

Domain invariants:

```text
rating ∈ {1,2,3,4,5}
orderId must identify a valid order
customerId must own the order
restaurantId must match the order restaurant
order must be DELIVERED
only one review may exist for an order
```

---

# 8. Review Status Model

Supported statuses:

```text
PUBLISHED
PENDING_MODERATION
HIDDEN
REMOVED
```

Conceptual transitions:

```text
PUBLISHED
   ↓
HIDDEN
   ↓
PUBLISHED

PUBLISHED
   ↓
REMOVED
```

And:

```text
PENDING_MODERATION
        ↓
     PUBLISHED
        ↓
       ...
```

Administrative restoration must be permission-controlled.

Invalid transitions must be rejected.

---

# 9. Review Creation Service

The primary application operation should be conceptually:

```text
CreateReview
```

Input:

```text
orderId
rating
comment
idempotencyKey?
```

The service obtains:

```text
customerId
```

from the authenticated identity.

It obtains:

```text
restaurantId
```

from the authoritative order.

The client cannot supply arbitrary ownership relationships.

---

# 10. Create Review Transaction

Recommended flow:

```text
BEGIN
   ↓
Authenticate
   ↓
Authorize Customer
   ↓
Load Order
   ↓
Verify Customer Ownership
   ↓
Verify Order = DELIVERED
   ↓
Verify Review Eligibility
   ↓
Check Existing Review
   ↓
Validate Rating
   ↓
Validate Comment
   ↓
Create Review
   ↓
Create Outbox Event
   ↓
Create Audit Record
   ↓
COMMIT
```

External notification providers must not be called inside the database transaction.

---

# 11. Idempotency

Review creation may use the existing idempotency infrastructure:

```text
idempotency_keys
```

A retry with the same valid idempotency key and equivalent request should return the previously created result rather than creating another review.

A reused key with a materially different request must be rejected.

The one-review-per-order database constraint remains the final duplicate protection.

---

# 12. Review Eligibility Service

Create a dedicated application/domain service:

```text
ReviewEligibilityService
```

Responsibilities:

* Verify order exists
* Verify customer owns order
* Verify order delivered
* Verify review does not already exist
* Verify applicable review policy
* Return eligibility result

Example conceptual response:

```text
eligible: true
```

or:

```text
eligible: false
reason: REVIEW_ORDER_NOT_DELIVERED
```

The frontend may call an eligibility endpoint, but the order-creation transaction must perform its own authoritative check.

---

# 13. Review Validation Service

Create:

```text
ReviewValidationService
```

Responsibilities:

* Rating validation
* Comment validation
* Content size validation
* Input normalization
* Security validation

Do not duplicate validation rules independently across four frontends.

Frontend validation may improve UX but backend validation is authoritative.

---

# 14. Content Moderation Service

Create a review moderation boundary:

```text
ReviewModerationService
```

Responsibilities:

* Determine whether content requires moderation
* Change moderation state
* Process reports
* Apply authorized administrative decisions
* Record moderation events
* Preserve auditability

The first V1 implementation may use rule-based moderation and manual admin review.

Do not introduce AI moderation as a required dependency.

---

# 15. Restaurant Response Service

Conceptual service:

```text
ReviewResponseService
```

Responsibilities:

* Create response
* Edit response
* Retrieve response
* Validate restaurant ownership
* Validate restaurant staff permissions
* Moderate response where required

Authorization must verify the restaurant relationship.

---

# 16. Review Report Service

Conceptual service:

```text
ReviewReportService
```

Responsibilities:

* Create report
* Validate reporter
* Validate review
* Prevent abusive duplicate reports
* Process moderation queue integration
* Resolve reports
* Audit administrative decisions

Reports must not directly modify review status unless the configured moderation workflow explicitly does so.

---

# 17. Rating Aggregation Service

Create:

```text
RatingAggregationService
```

Responsibilities:

* Calculate restaurant average rating
* Calculate published review count
* Calculate rating distribution
* Refresh cached aggregates
* Reconcile aggregate data where required

The aggregate is derived from authoritative review records.

---

# 18. Aggregate Strategy

V1 may use either:

1. Query-time aggregation for low-volume datasets, or
2. A maintained aggregate/cache for frequently accessed restaurant pages.

Recommended architecture:

```text
PostgreSQL Reviews
       ↓
Aggregation Service
       ↓
Redis / Aggregate Cache
       ↓
Restaurant API
```

Redis is a performance layer only.

If Redis fails, the system must be able to retrieve authoritative information from PostgreSQL or rebuild the cache.

---

# 19. Aggregate Cache Key

Conceptually:

```text
restaurant:{restaurantId}:rating
```

The exact key namespace must follow the project's shared Redis conventions.

Cached data may contain:

```text
averageRating
reviewCount
ratingDistribution
updatedAt
```

Do not treat cached values as authoritative.

---

# 20. Aggregate Update Events

When a review changes public rating eligibility:

```text
Review Created
Review Hidden
Review Restored
Review Removed
Review Rating Edited
```

the system should trigger:

```text
rating.aggregate.refresh
```

or the project's equivalent internal event.

Workers may perform aggregate refresh asynchronously.

The API must define acceptable temporary consistency behavior.

---

# 21. Review Editing

Conceptual service:

```text
UpdateReview
```

Authorization:

```text
Authenticated User
        ↓
Customer Role
        ↓
Review Owner
        ↓
Review Editable
        ↓
Validate
        ↓
Update
```

The update must never modify:

```text
orderId
customerId
restaurantId
```

If rating changes, the rating aggregate must be refreshed.

---

# 22. Restaurant Response API Behavior

Conceptual operations:

```text
CreateReviewResponse
UpdateReviewResponse
GetReviewResponse
```

Authorization:

```text
Authenticated User
        ↓
Restaurant Owner / Authorized Operator
        ↓
Restaurant Membership
        ↓
Review.restaurantId == Membership.restaurantId
        ↓
Permission Check
```

---

# 23. Review Reporting API Behavior

Conceptual operation:

```text
ReportReview
```

Input:

```text
reviewId
reason
description?
```

Backend derives:

```text
reportedBy
```

from authentication.

The client cannot impersonate another reporter.

---

# 24. Moderation API Behavior

Administrative operations should conceptually support:

```text
ListModerationQueue
GetReviewModerationDetails
HideReview
RestoreReview
RemoveReview
ModerateResponse
ResolveReport
```

Every administrative action requires:

* Authentication
* MFA/strong authentication where applicable
* Permission
* Reason where required
* Audit logging

---

# 25. API Endpoints

The following endpoint structure should be implemented consistently with the master API specification.

## Customer Review Eligibility

```http
GET /api/v1/orders/{orderId}/review-eligibility
```

Purpose:

Determine whether the authenticated customer may review the order.

---

## Create Review

```http
POST /api/v1/orders/{orderId}/review
```

Request:

```json
{
  "rating": 5,
  "comment": "Great food and fast delivery."
}
```

The backend derives customer and restaurant from the order.

---

## Get Customer's Review

```http
GET /api/v1/orders/{orderId}/review
```

---

## Update Review

```http
PATCH /api/v1/reviews/{reviewId}
```

Request:

```json
{
  "rating": 4,
  "comment": "Updated review."
}
```

---

## Remove Own Review

```http
DELETE /api/v1/reviews/{reviewId}
```

This should implement controlled removal rather than destructive deletion.

---

## List Restaurant Reviews

```http
GET /api/v1/restaurants/{restaurantId}/reviews
```

Supported query concepts:

```text
page
limit
rating
sort
```

Public responses must contain only publicly visible data.

---

## Create Restaurant Response

```http
POST /api/v1/reviews/{reviewId}/response
```

Request:

```json
{
  "response": "Thank you for your feedback."
}
```

---

## Update Restaurant Response

```http
PATCH /api/v1/reviews/{reviewId}/response
```

---

## Report Review

```http
POST /api/v1/reviews/{reviewId}/reports
```

Request:

```json
{
  "reason": "ABUSIVE_CONTENT",
  "description": "Optional additional context."
}
```

---

# 26. Restaurant Review Summary

A restaurant endpoint may expose:

```http
GET /api/v1/restaurants/{restaurantId}/rating-summary
```

Response concept:

```json
{
  "averageRating": 4.6,
  "reviewCount": 128,
  "distribution": {
    "1": 3,
    "2": 5,
    "3": 12,
    "4": 30,
    "5": 78
  }
}
```

The exact response envelope must follow `API_SPEC.md`.

---

# 27. Admin APIs

Conceptual endpoints:

```http
GET /api/v1/admin/reviews
GET /api/v1/admin/reviews/{reviewId}
GET /api/v1/admin/review-reports
POST /api/v1/admin/reviews/{reviewId}/hide
POST /api/v1/admin/reviews/{reviewId}/restore
POST /api/v1/admin/reviews/{reviewId}/remove
POST /api/v1/admin/review-reports/{reportId}/resolve
```

Exact permissions must be defined through the authorization system.

---

# 28. API Authorization Matrix

| Operation                    | Customer | Owner |         Operator | Admin | Super Admin |
| ---------------------------- | -------: | ----: | ---------------: | ----: | ----------: |
| View public reviews          |      Yes |   Yes |              Yes |   Yes |         Yes |
| Create own review            |      Yes |   No* |              No* |   No* |         No* |
| Edit own review              |      Yes |   No* |              No* |   No* |         No* |
| Remove own review            |      Yes |   No* |              No* |   No* |         No* |
| Respond to restaurant review |       No |   Yes | Permission-based |    No |          No |
| Report review                |      Yes |   Yes |              Yes |   Yes |         Yes |
| Moderate review              |       No |    No |               No |   Yes |         Yes |
| Manage reports               |       No |    No |               No |   Yes |         Yes |

`*` A user who is also a customer may perform customer actions through their customer identity if the order is genuinely theirs. Role combinations must be evaluated by the authorization system.

---

# 29. Pagination

Review listing APIs must support cursor- or page-based pagination according to the platform's standard API conventions.

At minimum:

```text
limit
cursor/page
```

Sorting should use deterministic ordering.

Recommended default:

```text
created_at DESC
id DESC
```

The secondary identifier prevents ambiguous ordering when timestamps match.

---

# 30. Filtering

Restaurant review APIs may support:

```text
rating
status
date range
```

Public APIs must never expose internal moderation statuses unless explicitly required.

Admin APIs may expose moderation state and report information according to permission.

---

# 31. Search

V1 does not require a dedicated search engine for reviews.

PostgreSQL is sufficient for:

* Restaurant review listing
* Rating filtering
* Basic moderation queries
* Basic admin search

A dedicated search engine requires a future architecture decision.

---

# 32. Internal Events

Recommended events:

```text
review.created
review.updated
review.removed
review.hidden
review.restored
review.reported
review.response.created
review.response.updated
review.moderated
review.rating.aggregate.refresh
```

Events should be published through the existing outbox architecture.

---

# 33. Outbox Flow

```text
Review Transaction
      ↓
PostgreSQL Review Change
      ↓
Outbox Event
      ↓
Background Worker
      ↓
Notification / Risk / Analytics / Realtime
```

This prevents external service failure from corrupting the review transaction.

---

# 34. Notification Integration

The Reviews module emits events.

The Notifications module decides:

* Whether to send
* Which channel
* Template
* User preference
* Priority
* Retry policy

The Reviews module must not directly own push/SMS/email provider logic.

---

# 35. Trust & Risk Integration

Review events may be consumed by the Trust & Risk Engine.

Example:

```text
review.created
      ↓
Risk Signal Evaluation
      ↓
risk_events
      ↓
Configured risk rule
      ↓
Possible risk flag/restriction
```

The Reviews module should not hard-code account restrictions.

---

# 36. Moderation Queue

The Admin application should consume a moderation API rather than querying the reviews database directly.

Conceptual queue:

```text
Pending Reviews
Reported Reviews
Flagged Reviews
Reported Responses
Recently Moderated
```

Admin UI actions must call authorized backend APIs.

---

# 37. Review Visibility

Public visibility is determined by backend status.

Example:

```text
PUBLISHED → public
PENDING_MODERATION → policy-dependent
HIDDEN → not public
REMOVED → not public
```

The exact query predicate must be centralized.

Do not duplicate visibility logic throughout controllers.

---

# 38. Review DTOs

Public review response should expose only appropriate fields.

Conceptually:

```json
{
  "id": "review-id",
  "rating": 5,
  "comment": "Great food.",
  "customer": {
    "displayName": "Hamza"
  },
  "restaurantResponse": {
    "response": "Thank you!"
  },
  "createdAt": "..."
}
```

Do not expose:

```text
customer phone
customer email
delivery address
risk flags
internal moderation notes
audit metadata
internal IDs not required by client
```

---

# 39. Review Author Display

The platform should use a controlled customer display identity.

Possible V1 representation:

```text
First name + initial
```

or another product-defined display format.

The exact public identity format should be centralized rather than independently implemented by each frontend.

Never expose unnecessary personal information.

---

# 40. Content Safety

Review content should be treated as untrusted user-generated content.

The system must defend against:

* XSS
* HTML injection
* Script injection
* Malicious URLs
* SQL injection
* Log injection
* Unicode abuse
* Oversized payloads

Output encoding must occur according to the frontend/platform rendering strategy.

---

# 41. API Rate Limits

Create configurable rate-limit categories for:

```text
review.create
review.update
review.delete
review.report
review.response.create
review.response.update
review.public.list
review.admin.moderate
```

Exact values belong in centralized configuration.

---

# 42. Caching

Recommended cache candidates:

* Restaurant rating summary
* Frequently requested public review pages where appropriate

Do not cache:

* Authorization-sensitive moderation decisions as the sole source of truth
* Risk restrictions
* Review ownership
* Review eligibility
* Financial information

Authorization must still occur against authoritative state.

---

# 43. Cache Failure

If Redis is unavailable:

```text
Review API
    ↓
PostgreSQL
```

must remain functional where technically feasible.

A Redis outage must not:

* Create duplicate reviews
* Change ownership
* Approve unauthorized responses
* Corrupt ratings

---

# 44. Background Jobs

Potential jobs:

```text
review.aggregate.refresh
review.moderation.process
review.report.process
review.analytics.aggregate
review.notification.dispatch
review.risk.process
```

Workers must be idempotent.

A failed job must be retryable.

Repeated processing must not duplicate side effects.

---

# 45. Observability

Track metrics such as:

```text
reviews.created
reviews.updated
reviews.removed
reviews.reported
reviews.moderated
reviews.responses.created
reviews.creation_failures
reviews.duplicate_attempts
reviews.risk_flags
reviews.aggregate_refresh_failures
```

Latency metrics:

```text
review.create.latency
review.list.latency
review.aggregate.latency
review.moderation.latency
```

---

# 46. Logging

Structured logs should include:

```text
request_id
correlation_id
actor_user_id where appropriate
review_id where appropriate
order_id where appropriate
restaurant_id where appropriate
operation
result
latency
error_code
```

Never log:

* Passwords
* Tokens
* Payment credentials
* Sensitive customer information unnecessarily
* Internal secrets

---

# 47. Audit

Audit events should be generated for sensitive actions.

Examples:

```text
REVIEW_CREATED
REVIEW_UPDATED
REVIEW_REMOVED
REVIEW_HIDDEN
REVIEW_RESTORED
REVIEW_REPORTED
REVIEW_RESPONSE_CREATED
REVIEW_RESPONSE_UPDATED
REVIEW_RESPONSE_REMOVED
REVIEW_MODERATED
REPORT_RESOLVED
```

Administrative actions must include the actor and reason where required.

---

# 48. Security

Security requirements include:

* Authentication
* RBAC
* Resource ownership
* Restaurant tenant isolation
* Input validation
* Output filtering
* Rate limiting
* Audit logging
* Secure session handling
* CSRF protection where applicable
* CORS policy
* HTTPS
* Security headers
* Abuse monitoring

Follow:

```text
docs/security/AUTH_AUTHORIZATION.md
```

---

# 49. Failure Handling

### Database failure

Return a safe server error.

Do not partially create the review.

### Duplicate submission

Return the existing result where idempotency permits, otherwise return:

```text
REVIEW_ALREADY_EXISTS
```

### Notification failure

Review creation remains successful.

Notification is retried asynchronously.

### Risk service unavailable

Follow the platform's defined risk-service failure policy.

Do not silently bypass required risk checks.

### Moderation service unavailable

The system should use the configured safe fallback, such as:

```text
PENDING_MODERATION
```

when content cannot safely be evaluated.

---

# 50. Concurrency Scenarios

Tests must cover:

### Double review submission

Two simultaneous requests for the same order.

Expected:

```text
One review
One successful creation
One duplicate/conflict result
```

### Simultaneous edits

Concurrent updates must follow the platform's optimistic concurrency strategy where applicable.

### Aggregate update race

Multiple review changes must not leave the aggregate permanently inconsistent.

### Simultaneous moderation

Two admins acting on the same review must result in a deterministic valid state.

---

# 51. Testing Strategy

## Unit Tests

Test:

* Rating validation
* Comment validation
* Eligibility rules
* Ownership checks
* Status transitions
* Response authorization
* Report validation
* Aggregation
* Moderation rules

## Integration Tests

Test:

* PostgreSQL constraints
* Review creation transaction
* One-review-per-order constraint
* Restaurant tenant isolation
* Authorization
* Outbox events
* Aggregate updates

## API Tests

Test every review endpoint.

## E2E Tests

Test:

```text
Delivered Order
→ Review
→ Restaurant Response
→ Rating Aggregate
→ Notification
```

## Security Tests

Test:

* IDOR
* Cross-restaurant access
* Cross-customer access
* Role bypass
* Admin authorization
* XSS
* Injection
* Rate limits
* Duplicate submission

---

# 52. Golden E2E Review Test

```text
Customer
   ↓
Has Delivered Order
   ↓
GET Review Eligibility
   ↓
Eligible = true
   ↓
POST Review
   ↓
Backend verifies order ownership
   ↓
Backend verifies DELIVERED
   ↓
Review created
   ↓
Outbox event created
   ↓
Notification worker processes event
   ↓
Restaurant sees review
   ↓
Restaurant submits response
   ↓
Customer sees response
   ↓
Rating aggregate updates
   ↓
Audit records exist
```

---

# 53. Negative E2E Tests

The following must fail correctly:

### Pending order

```text
POST review
→ REVIEW_ORDER_NOT_DELIVERED
```

### Another customer's order

```text
POST review
→ REVIEW_ACCESS_DENIED
```

### Cancelled order

```text
POST review
→ REVIEW_NOT_ELIGIBLE
```

### Duplicate review

```text
POST review
→ REVIEW_ALREADY_EXISTS
```

### Invalid rating

```text
rating = 6
→ REVIEW_INVALID_RATING
```

### Unauthorized restaurant response

```text
Restaurant A
→ Review belonging to Restaurant B
→ REVIEW_ACCESS_DENIED
```

### Customer modifying another review

```text
Customer A
→ Review owned by Customer B
→ REVIEW_ACCESS_DENIED
```

---

# 54. Migration Strategy

Database changes must be introduced through version-controlled migrations.

Migration sequence should be approximately:

```text
1. Review constraints
2. Review indexes
3. Review response constraints/indexes
4. Review report constraints/indexes
5. Any required moderation fields
6. Aggregate support if persisted
```

Never manually modify production schema.

---

# 55. Seed Data

Development/staging seed data may include:

* Restaurants
* Customers
* Delivered orders
* Sample reviews
* Sample restaurant responses
* Sample reports
* Moderation states

Production must not receive fake customer reviews through development seed scripts.

---

# 56. Financial Independence

Reviews do not directly modify:

* Payments
* Refunds
* Restaurant earnings
* Rider earnings
* Settlements
* Payouts

A review may generate analytics/risk/notification events but cannot alter financial records without an explicit financial workflow.

---

# 57. Order Integration

The Reviews module should consume an order abstraction such as:

```text
OrderQueryService
```

or equivalent internal application contract.

It needs authoritative information:

```text
orderId
customerId
restaurantId
orderStatus
```

Do not duplicate order lifecycle logic inside Reviews.

---

# 58. Restaurant Integration

The Reviews module may use a restaurant query/service abstraction to retrieve:

* Restaurant status where relevant
* Restaurant display information
* Restaurant membership

The Reviews module must not duplicate restaurant ownership logic.

---

# 59. Admin Integration

Admin UI should communicate exclusively through authorized admin APIs.

It must not:

* Access database directly
* Modify review rows directly
* Modify rating aggregates directly
* Bypass audit logging

---

# 60. Realtime Integration

Review events may be delivered through authenticated WebSocket channels.

Examples:

```text
restaurant:{restaurantId}:reviews
customer:{userId}:reviews
admin:reviews
```

Actual channel names must follow:

```text
docs/notifications/REALTIME_SPEC.md
```

Subscription authorization is mandatory.

A customer must not subscribe to another customer's private review events.

A restaurant must not subscribe to another restaurant's private administrative review channel.

---

# 61. Event Ordering

Realtime consumers must tolerate:

* Duplicate events
* Out-of-order events
* Reconnection
* Offline delivery

Every event should contain sufficient metadata for consumers to reconcile state.

The REST/API state remains authoritative.

---

# 62. API Versioning

All public APIs use:

```text
/api/v1/
```

Future breaking changes require:

* API version change
* Architecture documentation
* Migration plan
* Client compatibility strategy

---

# 63. Implementation Sequence

Claude Code should implement Reviews in this order:

```text
1. Review database migration
2. Domain entities/value objects
3. Review repository
4. Review eligibility service
5. Review validation service
6. Review creation API
7. Review retrieval API
8. Review update/removal API
9. Restaurant response service
10. Restaurant response APIs
11. Review reporting
12. Moderation workflow
13. Rating aggregation
14. Cache integration
15. Outbox events
16. Notification integration
17. Trust & Risk integration
18. Admin APIs
19. Observability
20. Security hardening
21. Unit tests
22. Integration tests
23. E2E tests
24. Concurrency tests
25. Security tests
26. Documentation verification
```

---

# 64. No Premature Complexity

V1 should not introduce:

* Elasticsearch
* Kafka
* Microservices
* AI moderation
* AI sentiment analysis
* Complex reputation algorithms
* Dedicated analytics infrastructure
* Distributed transactions

unless an approved ADR establishes a concrete need.

PostgreSQL + Redis + background workers + outbox are sufficient for the initial architecture.

---

# 65. Definition of Done

The technical implementation is complete only when:

### Database

* Schema exists
* Constraints exist
* Indexes exist
* Migrations are version controlled

### Backend

* Review module exists
* Eligibility service exists
* Validation exists
* CRUD behavior exists
* Response behavior exists
* Reporting exists
* Moderation exists
* Aggregation exists

### Security

* Authentication works
* Authorization works
* Tenant isolation works
* IDOR tests pass
* Rate limiting works
* Content security works

### Events

* Outbox integration works
* Notifications work
* Risk integration works
* Realtime integration works where required

### Operations

* Audit logs work
* Metrics exist
* Structured logs exist
* Failure handling works

### Testing

* Unit tests pass
* Integration tests pass
* API tests pass
* E2E tests pass
* Concurrency tests pass
* Security tests pass

### Documentation

* `REVIEW_RULES.md` matches implementation
* `REVIEW_SPEC.md` matches implementation
* `API_SPEC.md` remains synchronized
* `DATABASE.md` remains synchronized
* `CLAUDE.md` references the new authoritative documents

---

# 66. Architecture Diagram

```text
                         ┌─────────────────────┐
                         │ Customer App        │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Review API          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │ Reviews Module               │
                    │                              │
                    │ Eligibility                  │
                    │ Validation                   │
                    │ Review Management            │
                    │ Responses                    │
                    │ Reports                      │
                    │ Moderation                   │
                    │ Aggregation                  │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
       ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
       │ PostgreSQL  │      │    Redis    │      │   Outbox    │
       │             │      │             │      │             │
       │ Reviews     │      │ Rating      │      │ Events      │
       │ Reports     │      │ Cache       │      │             │
       │ Responses   │      │             │      │             │
       └─────────────┘      └─────────────┘      └──────┬──────┘
                                                        │
                       ┌────────────────────────────────┼───────────────┐
                       │                                │               │
                       ▼                                ▼               ▼
               ┌─────────────┐                  ┌─────────────┐ ┌─────────────┐
               │ Notifications│                 │ Trust & Risk│ │ Realtime    │
               │ Module       │                 │ Engine      │ │ WebSocket   │
               └─────────────┘                  └─────────────┘ └─────────────┘
```

---

# 67. Final Implementation Rule

Claude Code must treat:

```text
docs/reviews/REVIEW_RULES.md
docs/reviews/REVIEW_SPEC.md
```

as authoritative.

Before coding, Claude Code must inspect all referenced architecture, database, API, order, risk, security, notification, and financial specifications.

If an implementation conflict is discovered:

```text
STOP
↓
Identify conflicting specifications
↓
Explain the conflict
↓
Propose the smallest consistent change
↓
Update the authoritative documentation
↓
Obtain explicit approval where required
↓
Implement
```

Claude Code must never silently invent a review rule or modify an existing QuickBite business rule.

---

# 68. Phase 11 Completion

Phase 11 is considered specification-complete when the following chain is documented and consistent:

```text
Delivered Order
      ↓
Review Eligibility
      ↓
Customer Review
      ↓
Validation
      ↓
Moderation / Risk
      ↓
Published Review
      ↓
Restaurant Response
      ↓
Rating Aggregation
      ↓
Notifications
      ↓
Realtime
      ↓
Analytics
      ↓
Audit
```

Implementation must not begin until these specifications are accepted as frozen.
