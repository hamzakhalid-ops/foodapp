# QuickBite V1 — Phase 2: System Architecture & Technical Specification

Phase 2 is where we turn the PRD into a **technical blueprint** that Claude Code can implement without making architectural decisions on its own.

The goal is not to start coding yet. The goal is to decide **how QuickBite will work internally**.

---

# 1. Architecture Decision

For V1, I strongly recommend:

> **Modular Monolith Backend + PostgreSQL + Redis + Background Jobs + WebSockets**

Not microservices.

### Architecture

```text
                         QUICKBITE V1
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
 Customer App          Restaurant App          Rider App
        │                     │                     │
        └─────────────────────┬─────────────────────┘
                              │
                              ▼
                        API / Backend
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
        ▼                     ▼                      ▼
   PostgreSQL              Redis              Job Workers
        │                     │                      │
        │                     │                      │
        └─────────────────────┼──────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
             Payments       Maps        Notifications
                │             │             │
                ▼             ▼             ▼
          Payment Provider Map Provider Push/SMS/Email
```

Admin Panel connects to the same backend through authenticated admin APIs.

---

# 2. Why Modular Monolith?

QuickBite has many domains:

* Orders
* Payments
* Restaurants
* Riders
* Dispatch
* Risk
* Earnings
* Notifications

But V1 does **not** need separate servers for every domain.

A modular monolith gives us:

### Simpler development

One backend codebase.

### Easier database transactions

For example:

```text
Create Order
+
Reserve/validate items
+
Create payment record
+
Create order event
```

can happen reliably inside controlled transactions.

### Easier deployment

Instead of deploying 15 services, we can deploy:

```text
API
Worker
Database
Redis
```

### Future scalability

We still maintain strict module boundaries so that, if QuickBite becomes large, individual modules can later become services.

---

# 3. Four Client Applications

QuickBite has four products:

```text
apps/
│
├── customer/
├── restaurant/
├── rider/
└── admin/
```

Each application has its own UI and user experience.

They share common packages where appropriate.

Example:

```text
packages/
├── ui/
├── types/
├── validation/
├── api-client/
├── config/
└── utils/
```

But we should **not** share business logic blindly between applications.

---

# 4. Backend Architecture

The backend should be divided into clear modules.

```text
backend/
│
├── auth/
├── users/
├── customers/
├── restaurants/
├── restaurant-staff/
├── menu/
├── orders/
├── cancellation/
├── payments/
├── riders/
├── delivery/
├── dispatch/
├── risk/
├── notifications/
├── promotions/
├── reviews/
├── earnings/
├── settlements/
├── support/
├── admin/
├── audit/
└── common/
```

Each module should have clear responsibilities.

---

# 5. Auth Module

Responsible for:

* Registration
* Login
* Logout
* Password management
* Phone verification
* Email verification
* Sessions/tokens
* Refresh tokens
* Account status

Authentication answers:

> "Who is this user?"

Authorization answers:

> "What is this user allowed to do?"

These must remain separate concepts.

---

# 6. User Module

Handles common identity information.

Example:

```text
User
├── id
├── phone
├── email
├── password_hash
├── status
├── created_at
└── updated_at
```

Role-specific information should live in appropriate domain tables.

---

# 7. Restaurant Module

Responsible for:

* Restaurant profile
* Restaurant onboarding
* Restaurant status
* Restaurant ownership
* Restaurant operator
* Operating hours
* Restaurant location
* Delivery configuration
* Documents
* Bank information

Restaurant lifecycle:

```text
DRAFT
↓
SUBMITTED
↓
UNDER_REVIEW
↓
APPROVED
```

with rejection/resubmission paths.

---

# 8. Restaurant Staff Architecture

V1 intentionally uses:

```text
OWNER
OPERATOR
```

Not:

```text
OWNER
MANAGER
ORDER_STAFF
KITCHEN_STAFF
```

The Operator handles normal restaurant operations.

The Owner controls sensitive financial/account operations.

We can later introduce more granular permissions if the business requires them.

---

# 9. Menu Module

Responsible for:

```text
Restaurant
   ↓
Categories
   ↓
Items
   ↓
Variations
   ↓
Add-ons
```

Important rule:

> Client-submitted prices are never trusted.

The backend retrieves the authoritative menu price.

---

# 10. Order Module

The Order module is one of the most important parts of the system.

It manages:

* Order creation
* Order items
* Pricing
* Status
* Restaurant processing
* Customer information
* Delivery information
* Order history

The backend owns the order state machine.

---

# 11. Order State Machine

```text
PENDING
   │
   ▼
RESTAURANT_ACCEPTED
   │
   ▼
PREPARING
   │
   ▼
READY_FOR_PICKUP
   │
   ▼
RIDER_ASSIGNED
   │
   ▼
PICKED_UP
   │
   ▼
OUT_FOR_DELIVERY
   │
   ▼
DELIVERED
```

Cancellation is handled separately.

---

# 12. State Transition Protection

Clients cannot simply send:

```text
status = DELIVERED
```

and expect the backend to accept it.

Every transition must be validated.

For example:

```text
PREPARING → READY_FOR_PICKUP
```

is allowed for the restaurant.

But:

```text
PREPARING → DELIVERED
```

is invalid.

The backend rejects it.

---

# 13. Order History

We should maintain immutable order-status history.

Example:

```text
Order #QB10042

10:31 PENDING
10:32 RESTAURANT_ACCEPTED
10:40 PREPARING
10:57 READY_FOR_PICKUP
11:03 RIDER_ASSIGNED
11:11 PICKED_UP
11:30 OUT_FOR_DELIVERY
11:42 DELIVERED
```

This is essential for:

* Support
* Disputes
* Analytics
* Fraud detection
* Debugging
* Auditability

---

# 14. Cancellation Rules Engine

Cancellation becomes its own module.

```text
CancellationService
        │
        ▼
Cancellation Policy
        │
        ├── Order State
        ├── Actor
        ├── Time
        ├── Reason
        ├── Payment State
        └── Business Rules
```

It returns something like:

```text
allowed: true/false
reason
refund_policy
```

The frontend should display the result but never determine it.

---

# 15. Cancellation Example

Customer requests cancellation:

```text
POST /orders/{id}/cancel
```

Backend:

```text
Authenticate customer
        ↓
Verify order ownership
        ↓
Load order
        ↓
Cancellation Engine
        ↓
Check state
        ↓
Check payment
        ↓
Check cancellation rules
        ↓
Allow / Reject
```

If order is already preparing:

```text
allowed = false
```

---

# 16. Dispatch Engine

This deserves special architectural treatment.

```text
Order Service
     │
     │ OrderReady event
     ▼
Dispatch Engine
     │
     ▼
Find eligible riders
     │
     ▼
Geospatial filtering
     │
     ▼
Eligibility filtering
     │
     ▼
Ranking
     │
     ▼
Delivery Offer
     │
     ▼
Rider accepts
     │
     ▼
Assignment Lock
     │
     ▼
Rider Assigned
```

---

# 17. Rider Location System

Riders periodically send location information while online.

Example:

```text
Rider
   ↓
GPS
   ↓
Rider App
   ↓
Location API
   ↓
Redis / Geospatial Index
```

The latest location can be kept in Redis for fast dispatch searches.

Long-term historical location should be handled carefully and only retained where actually needed.

---

# 18. Redis Geospatial Dispatch

Redis can maintain nearby riders.

Conceptually:

```text
Restaurant Location
       ↓
Redis GEO search
       ↓
Nearby riders
       ↓
Eligibility filters
```

This avoids querying the primary database for every dispatch search.

PostgreSQL remains the source of truth for persistent rider/account data.

---

# 19. Dispatch Radius Expansion

Example:

```text
Search radius
     ↓
5 km
     ↓
No suitable rider?
     ↓
8 km
     ↓
No suitable rider?
     ↓
12 km
```

These numbers are examples only.

The actual values should live in configuration.

---

# 20. Dispatch Offer Lifecycle

```text
CREATED
   ↓
OFFERED
   ↓
ACCEPTED
```

or:

```text
OFFERED
   ↓
EXPIRED
```

or:

```text
OFFERED
   ↓
REJECTED
```

or:

```text
OFFERED
   ↓
CANCELLED
```

---

# 21. Preventing Double Assignment

This is critical.

Suppose:

```text
Rider A accepts
Rider B accepts
```

almost simultaneously.

The backend must guarantee only one succeeds.

Use a database transaction/locking strategy or an atomic assignment mechanism.

Conceptually:

```text
BEGIN
   Verify order unassigned
   Lock assignment
   Create assignment
COMMIT
```

The second request receives:

```text
ORDER_ALREADY_ASSIGNED
```

---

# 22. Trust & Risk Engine

The risk engine should process events.

```text
Customer Action
      ↓
Risk Event
      ↓
Risk Evaluation
      ↓
Rules
      ↓
Risk Flag
      ↓
Restriction
```

Examples:

```text
COD_NON_RECEIPT
ORDER_CANCELLED
PAYMENT_FAILED
REFUND_REQUESTED
FALSE_DELIVERY_CLAIM
```

---

# 23. Risk Architecture

Core concepts:

```text
RiskEvent
RiskRule
RiskFlag
RiskScore
RiskRestriction
```

A rule could contain:

```text
event_type
threshold
time_window
action
enabled
```

Example:

```text
COD_NON_RECEIPT
threshold = 3
window = 90 days
action = COD_RESTRICTED
```

---

# 24. Risk Decision

Before COD order creation:

```text
Customer
   ↓
Risk Service
   ↓
Check active restrictions
   ↓
COD permitted?
```

If:

```text
COD_RESTRICTED
```

then the API rejects COD while allowing eligible alternative payment methods.

---

# 25. Risk Must Not Be Only Customer-Based

The same architecture must support:

```text
Customer Risk
Restaurant Risk
Rider Risk
```

This prevents us from designing a fraud system that only works for customers.

---

# 26. Payment Architecture

Payment module:

```text
Payment Request
      ↓
Payment Provider
      ↓
Webhook / Confirmation
      ↓
Payment Service
      ↓
Payment State
```

Possible states:

```text
PENDING
AUTHORIZED
SUCCEEDED
FAILED
REFUNDED
PARTIALLY_REFUNDED
CANCELLED
```

The exact states depend on the chosen provider.

---

# 27. Payment Security

Never trust:

```text
frontend:
payment_success = true
```

Instead:

```text
Payment Provider
       ↓
Server Verification
       ↓
Payment Status
       ↓
Order Payment Status
```

Webhooks must be authenticated/verified.

Payment operations should be idempotent.

---

# 28. Cash on Delivery

COD should be treated as a payment method, not an informal exception.

Before order creation:

```text
Risk check
↓
COD eligibility
↓
Restaurant eligibility
↓
Delivery eligibility
↓
Order creation
```

At delivery:

```text
COD order
↓
Rider collects cash
↓
Delivery completed
↓
Financial record
```

COD reconciliation will be part of the financial architecture.

---

# 29. Financial Architecture

We should separate:

### Order money

What the customer pays.

### Restaurant earnings

What belongs to the restaurant.

### Rider earnings

What belongs to the rider.

### QuickBite revenue

Platform fees/commission.

These should not be represented by one ambiguous `amount` field.

---

# 30. Example Financial Breakdown

```text
Food subtotal        1,000
Delivery fee           150
Discount               -100
---------------------------
Customer total       1,050
```

Then backend calculates restaurant/rider/platform portions according to configured rules.

---

# 31. Earnings & Settlement

Financial lifecycle:

```text
Order Completed
      ↓
Financial Calculation
      ↓
Restaurant Earnings
      ↓
Rider Earnings
      ↓
Settlement
      ↓
Payout
```

Financial records should be auditable and preferably append-only.

---

# 32. Notification Architecture

Use a notification service.

```text
Business Event
      ↓
Notification Service
      ↓
Determine recipients
      ↓
Determine channels
      ↓
Queue
      ↓
Provider
```

Channels can include:

* Push
* SMS
* Email
* In-app

V1 should prioritize push + in-app where appropriate.

---

# 33. Background Jobs

Some work should not block API requests.

Use a job queue for:

* Notifications
* Emails
* SMS
* Payment reconciliation
* Settlement processing
* Dispatch retries
* Expired offers
* Risk calculations
* Analytics aggregation
* Cleanup jobs

Architecture:

```text
API
 ↓
Queue
 ↓
Worker
 ↓
Job
```

---

# 34. WebSockets / Real-Time

Use real-time communication for things that need immediate updates.

Examples:

### Restaurant

```text
New Order
```

### Customer

```text
Order status
Rider assigned
Rider location
```

### Rider

```text
Delivery offer
```

The backend remains authoritative even when WebSockets are used.

---

# 35. WebSocket Failure Handling

Never assume WebSocket connectivity is perfect.

If connection fails:

```text
WebSocket
   ↓
Disconnected
   ↓
Reconnect
   ↓
Fetch latest state
```

The application must recover using API state.

---

# 36. PostgreSQL

PostgreSQL should be the primary transactional database.

It stores:

* Users
* Restaurants
* Menus
* Orders
* Payments
* Riders
* Deliveries
* Risk
* Earnings
* Reviews
* Support
* Audit logs

The exact schema will be defined in Phase 3.

---

# 37. Redis

Redis is used for fast temporary/stateful workloads such as:

* Cache
* Rider geospatial index
* Sessions if needed
* Rate limiting
* Short-lived dispatch offers
* Job queues
* Temporary locks
* Real-time presence

Redis should **not** become the primary source of truth for financial/order records.

---

# 38. Object Storage

Restaurant/rider documents and images should not be stored directly inside PostgreSQL.

Use object storage for:

* Restaurant logo
* Restaurant cover
* Menu images
* Rider documents
* Restaurant documents
* Invoices/files

Database stores metadata and object references.

---

# 39. API Gateway / API Layer

For V1 we don't need a complicated enterprise gateway.

Backend API should provide:

```text
/api/v1/
```

Example:

```text
/api/v1/auth
/api/v1/customers
/api/v1/restaurants
/api/v1/orders
/api/v1/riders
/api/v1/deliveries
/api/v1/payments
/api/v1/admin
```

---

# 40. API Response Standard

Successful response:

```json
{
  "success": true,
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_CANNOT_BE_CANCELLED",
    "message": "This order can no longer be cancelled."
  }
}
```

Error codes should be stable and machine-readable.

---

# 41. Idempotency

Critical APIs should support idempotency.

Especially:

```text
Create Order
Payment
Refund
Payout
Settlement
```

Example:

```text
Idempotency-Key:
abc123
```

If the client accidentally sends the same request twice, the server should not create two orders.

---

# 42. Authorization Architecture

Every protected endpoint should go through:

```text
Authentication
      ↓
Identity
      ↓
Role
      ↓
Permission
      ↓
Resource ownership
      ↓
Business rule
```

Example:

A restaurant operator requests:

```text
GET /restaurants/ABC/earnings
```

The backend must verify:

```text
Is authenticated?
↓
Is restaurant operator?
↓
Does user belong to restaurant ABC?
↓
Does role have permission?
```

Only then return data.

---

# 43. Multi-Tenant Data Isolation

Restaurants are tenants from an authorization perspective.

Never allow:

```text
Restaurant A Operator
```

to access:

```text
Restaurant B Orders
```

even if they manipulate the API manually.

Every restaurant-scoped query must enforce tenant ownership.

---

# 44. Admin Security

Admin APIs require stronger controls.

Potential requirements:

* Separate admin authentication
* Strong password policy
* MFA
* Session controls
* Audit logs
* Permission checks
* Rate limiting
* Sensitive-action confirmation

Super Admin actions should be especially auditable.

---

# 45. API Security

V1 must include:

* Rate limiting
* Request validation
* Authentication
* Authorization
* Secure headers
* CORS configuration
* File validation
* Payload limits
* Abuse protection
* SQL injection protection through proper ORM/query practices
* Secure secret management

---

# 46. Observability

Every production system needs to tell us:

> "What happened?"

We need:

### Logs

Application events/errors.

### Metrics

Examples:

```text
Orders/minute
Payment failures
Dispatch success rate
Average assignment time
API latency
Error rate
```

### Tracing

Request correlation across:

```text
API
→ Order
→ Payment
→ Notification
```

---

# 47. Correlation ID

Every request should have a request/correlation ID.

Example:

```text
request_id:
qb_01JXYZ...
```

That allows us to investigate:

```text
Customer says:
"My order failed."
```

and trace the backend activity.

---

# 48. Error Handling

Errors should be classified.

Example:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
BUSINESS_RULE_VIOLATION
PAYMENT_FAILED
INTERNAL_ERROR
```

Never expose internal stack traces to customers.

---

# 49. Caching Strategy

Cache carefully.

Good candidates:

* Restaurant discovery
* Menu reads
* Configuration
* Public/low-volatility data

Do **not** blindly cache:

* Payment state
* Financial balances
* Critical order state
* Risk restrictions

Those require authoritative reads or carefully controlled invalidation.

---

# 50. Search Architecture

V1 can initially use PostgreSQL search capabilities.

Search:

```text
Restaurant
Item
Cuisine
Category
```

Later, if scale requires it, we can introduce a dedicated search engine.

Do not add Elasticsearch/OpenSearch unnecessarily in V1.

---

# 51. Maps Architecture

Maps provider is abstracted behind our own service interface.

Conceptually:

```text
QuickBite
   ↓
MapsService
   ↓
Provider
```

This prevents the entire codebase from becoming dependent on one provider's SDK.

Capabilities:

* Geocoding
* Reverse geocoding
* Distance
* Directions
* Location validation

---

# 52. File Upload Architecture

Never allow arbitrary files directly into application storage.

Flow:

```text
Client
 ↓
Upload API
 ↓
Validate type/size
 ↓
Object Storage
 ↓
Database metadata
```

For sensitive documents:

* Access-controlled URLs
* No public exposure
* Authorization before download

---

# 53. Data Consistency

Critical operations should use database transactions.

Example:

```text
Accept Order
↓
Update order state
↓
Create order event
↓
Create audit record
```

These should not partially succeed.

---

# 54. Event Architecture

We should have internal domain events.

Example:

```text
OrderCreated
```

can trigger:

```text
Notification
Analytics
Restaurant realtime update
Risk tracking
```

The Order module shouldn't directly contain every unrelated side effect.

---

# 55. Event Reliability

For important events, we should use a reliable mechanism such as an **outbox pattern**.

Conceptually:

```text
Database Transaction
       │
       ├── Order updated
       │
       └── Outbox event created
                 ↓
              Worker
                 ↓
        Event processing
```

This prevents a situation where the order succeeds but the event disappears because the server crashed immediately afterward.

---

# 56. Database Transaction Boundary

For example, creating an order:

```text
BEGIN TRANSACTION

Validate customer
Validate restaurant
Validate menu items
Calculate prices
Validate promotion
Validate payment method
Validate risk
Create order
Create order items
Create payment record
Create order history
Create outbox events

COMMIT
```

The exact sequence will be refined in the database/API design.

---

# 57. Concurrency Protection

QuickBite has many concurrent operations.

Examples:

```text
Two customers buy final available item
Two riders accept same order
Restaurant changes item availability
Customer retries payment
Admin changes restaurant status
```

The backend must use:

* Transactions
* Constraints
* Locks where necessary
* Idempotency
* Atomic updates

---

# 58. Inventory / Item Availability

V1 does not need complex warehouse inventory.

But menu item availability must be authoritative.

Example:

```text
Item Available
Item Unavailable
```

Restaurant can temporarily disable an item.

Order creation must verify availability again.

---

# 59. Restaurant Availability Check

Order creation:

```text
Restaurant exists
↓
Approved
↓
Online
↓
Accepting orders
↓
Within operating hours
↓
Not suspended
```

If not eligible:

```text
ORDER_NOT_AVAILABLE
```

---

# 60. Deployment Architecture

Initial production architecture can be:

```text
                    Internet
                       │
                       ▼
                Reverse Proxy/CDN
                       │
              ┌────────┴────────┐
              ▼                 ▼
           Web/API           WebSocket
              │                 │
              └────────┬────────┘
                       ▼
                  Backend API
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
        PostgreSQL   Redis     Workers
```

Frontend applications can be deployed separately.

---

# 61. Environments

We should have at least:

```text
Development
Staging
Production
```

### Development

Local developer environment.

### Staging

Production-like environment for testing.

### Production

Real users and real financial operations.

Never test experimental payment logic directly in production.

---

# 62. Configuration

Use environment variables/secrets for:

```text
Database
Redis
Payment credentials
Maps credentials
Push credentials
Storage credentials
JWT/session secrets
Email credentials
SMS credentials
```

Never commit secrets to Git.

---

# 63. CI/CD

Pipeline:

```text
Git Push
   ↓
Lint
   ↓
Type Check
   ↓
Unit Tests
   ↓
Integration Tests
   ↓
Build
   ↓
Security Checks
   ↓
Deploy Staging
   ↓
Smoke Tests
   ↓
Production Deployment
```

Production deployment should require appropriate approval controls.

---

# 64. Testing Architecture

We need several layers.

### Unit tests

Business logic.

Examples:

```text
Cancellation Rules
Risk Rules
Pricing
Dispatch ranking
```

### Integration tests

Database/API interactions.

### E2E tests

Full user journeys.

---

# 65. Critical E2E Test

The following must eventually be automated:

```text
Customer
↓
Register
↓
Restaurant discovery
↓
Cart
↓
Checkout
↓
Order
↓
Restaurant accepts
↓
Preparing
↓
Ready
↓
Dispatch
↓
Rider accepts
↓
Pickup
↓
Delivery
↓
Completed
↓
Restaurant earnings
↓
Rider earnings
```

This is the **Golden E2E Test**.

---

# 66. Failure Testing

We should also test failures.

Examples:

```text
Payment fails
Rider rejects
No rider available
Restaurant rejects
Restaurant goes offline
Customer loses connection
Rider loses connection
WebSocket disconnects
Payment webhook delayed
Duplicate order request
Duplicate payment request
Concurrent rider acceptance
```

---

# 67. Disaster / Recovery

We need:

* Database backups
* Backup verification
* Restore procedure
* Migration safety
* Rollback strategy
* Error monitoring

A backup that has never been restored is not enough.

---

# 68. Architecture Decision Records

Whenever we make an important technical decision, document it.

Example:

```text
docs/decisions/ADR/
```

Possible ADRs:

```text
ADR-001 Modular Monolith
ADR-002 PostgreSQL
ADR-003 Redis
ADR-004 WebSocket Strategy
ADR-005 Dispatch Architecture
ADR-006 Risk Engine
ADR-007 Payment Architecture
```

This prevents Claude Code from repeatedly reconsidering settled decisions.

---

# 69. Phase 2 Repository Documentation

After Phase 2, the documentation structure should become:

```text
docs/
│
├── product/
│   └── PRD.md
│
├── architecture/
│   └── ARCHITECTURE.md
│
├── database/
│   └── DATABASE.md
│
├── api/
│   └── API_SPEC.md
│
├── business-rules/
│   ├── ORDER_RULES.md
│   ├── CANCELLATION_RULES.md
│   ├── DISPATCH_RULES.md
│   └── RISK_RULES.md
│
├── flows/
│   └── GOLDEN_E2E_FLOW.md
│
└── decisions/
    └── ADR/
```

---

# 70. How Claude Code Should Work

This is the key part.

Claude Code should **not** immediately start building after reading the PRD.

The workflow should be:

```text
PRD
 ↓
Architecture
 ↓
Database
 ↓
API
 ↓
Business Rules
 ↓
Implementation Plan
 ↓
Code
 ↓
Tests
```

Claude should treat these documents as the source of truth.

---

# 71. Claude Code Instruction

Your root `CLAUDE.md` should eventually contain something like:

```text
# QuickBite Engineering Instructions

QuickBite is a food delivery marketplace.

Products:

1. Customer App
2. Restaurant App
3. Rider App
4. Admin Panel

Read these documents before implementing features:

docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md
docs/business-rules/
docs/flows/GOLDEN_E2E_FLOW.md

## Important Rules

Do not invent product requirements.

Do not change frozen business rules without explicit approval.

Backend is authoritative.

Never trust client-provided:

- prices
- totals
- permissions
- order status
- payment success
- restaurant availability
- rider assignment
- risk status

Restaurant roles:

- OWNER
- OPERATOR

Manager, Order Staff and Kitchen Staff are combined into OPERATOR.

Order cancellation must be enforced by the Cancellation Rules Engine.

Rider assignment must be handled by the Dispatch Engine.

Fraud and abuse controls must be handled by the Trust & Risk Engine.

Business thresholds must be configurable.

Use modular architecture.

Prefer simple V1 solutions over unnecessary complexity.

Every feature must include appropriate:

- validation
- authorization
- error handling
- logging
- tests

Before changing architecture:

1. Inspect existing documentation.
2. Identify affected modules.
3. Check for conflicts.
4. Explain the proposed change.
5. Implement only after the architecture is consistent.

Never silently change established architecture.
```

---

# 72. Phase 2 Final Architecture

So the complete V1 architecture is:

```text
                    QUICKBITE
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
   Customer        Restaurant         Rider
      App             App              App
       │               │                │
       └───────────────┼────────────────┘
                       │
                       ▼
                  Backend API
                       │
     ┌─────────────────┼───────────────────┐
     │                 │                   │
     ▼                 ▼                   ▼
 PostgreSQL          Redis              Workers
     │                 │                   │
     │                 │                   │
     └─────────────────┼───────────────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
    Payments         Maps          Notifications
       │               │                │
       └───────────────┼────────────────┘
                       │
                       ▼
                  Admin Panel
```

And inside the backend:

```text
Auth
Users
Customers
Restaurants
Restaurant Staff
Menu
Orders
Cancellation Engine
Payments
Riders
Delivery
Dispatch Engine
Trust & Risk Engine
Notifications
Promotions
Reviews
Earnings
Settlements
Support
Admin
Audit
```
