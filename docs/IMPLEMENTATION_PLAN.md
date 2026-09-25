# QuickBite Master Implementation Plan

**File:** `docs/IMPLEMENTATION_PLAN.md`
**Status:** FROZEN V1
**Phase:** 19 — Master Implementation Plan
**Purpose:** Define the exact incremental implementation sequence for QuickBite after completion of the architecture and specification phases.

---

# 1. Purpose

This document converts the frozen QuickBite specifications into an implementation sequence.

The project must **not** be implemented as one giant feature.

Implementation proceeds through small, coherent vertical slices.

Each slice should connect the required layers:

```text
Database
    ↓
Backend Domain Logic
    ↓
API
    ↓
Authorization
    ↓
Business Rules
    ↓
Frontend
    ↓
Notifications / Realtime where required
    ↓
Logging / Audit
    ↓
Tests
```

A slice is considered complete only when its required layers work together.

---

# 2. Authoritative Specifications

Before implementation, Claude Code must treat the existing specifications as authoritative.

Core documents include:

```text
docs/product/PRD.md

docs/architecture/ARCHITECTURE.md

docs/database/DATABASE.md

docs/api/API_SPEC.md

docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/DISPATCH_RULES.md
docs/business-rules/RISK_RULES.md

docs/flows/GOLDEN_E2E_FLOW.md

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

docs/infrastructure/INFRASTRUCTURE_RULES.md
docs/infrastructure/DEPLOYMENT_SPEC.md

docs/devops/CI_CD_RULES.md
docs/devops/DEVOPS_SPEC.md

docs/ARCHITECTURE_CONSISTENCY_REVIEW.md
```

`CLAUDE.md` remains the implementation guidance document.

---

# 3. Core Implementation Principle

The implementation unit is a **vertical slice**, not a technical layer.

Do not do this:

```text
Build entire database
    ↓
Build entire backend
    ↓
Build entire frontend
    ↓
Build notifications
    ↓
Build tests
```

Instead:

```text
Feature
    ↓
DB
    ↓
Backend
    ↓
API
    ↓
Authorization
    ↓
Frontend
    ↓
Events
    ↓
Tests
```

Then move to the next feature.

---

# 4. Implementation Sequence

The frozen V1 sequence is:

```text
1. Authentication
2. Customer Profile
3. Restaurant Onboarding
4. Menu
5. Customer Discovery
6. Cart
7. Checkout
8. Payments
9. Restaurant Orders
10. Dispatch
11. Rider Delivery
12. Completion
13. Earnings
14. Settlements
15. Promotions
16. Reviews
17. Support
18. Admin Operations
```

This sequence is the primary implementation roadmap.

---

# 5. Slice Completion Standard

Every implementation slice must answer:

### Database

* Which tables are created/changed?
* Which indexes are required?
* Which constraints are required?
* Which migrations are required?

### Backend

* Which domain/module changes?
* Which services/business engines are required?
* Which transactions are required?
* Which idempotency requirements exist?

### API

* Which endpoints are added/changed?
* Which request/response contracts are required?
* Which errors are possible?

### Authorization

* Which roles can perform the action?
* Which resource ownership/tenant rules apply?
* Are additional permissions required?

### Business Rules

* Which frozen rules apply?
* Which state transitions are involved?
* Which validations are required?

### Frontend

* Which screens/components are required?
* Which loading/error/empty states exist?
* Which client state is required?

### Notifications / Realtime

* Which events must be emitted?
* Which actors receive notifications?
* Is realtime required?

### Audit / Observability

* What must be logged?
* What must be audited?
* Which metrics/traces/errors matter?

### Tests

* Unit
* Integration
* API
* E2E
* Security
* Concurrency/idempotency where relevant

---

# 6. Slice 1 — Authentication

## Objective

Establish the identity and authentication foundation for all QuickBite applications.

## Scope

Implement:

* user registration
* login
* logout/session handling
* authentication state
* password handling where applicable
* account verification where specified
* authentication errors
* session/token handling
* authentication middleware

Roles must support:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
ADMIN
SUPER_ADMIN
```

Do not introduce additional roles.

## Database

Implement required identity tables:

```text
users
user_roles
```

Add required indexes and uniqueness constraints.

## Backend

Implement:

* authentication service
* credential validation
* session/token handling
* authentication middleware
* identity resolution

## API

Implement required authentication endpoints from `API_SPEC.md`.

## Authorization

Authentication establishes identity.

Authorization remains a separate layer.

## Security

Implement:

* password hashing where applicable
* rate limiting
* secure session/token handling
* brute-force protection
* sensitive logging protection

## Tests

Required:

* registration
* login
* invalid credentials
* duplicate account
* logout
* authentication middleware
* role resolution
* rate limiting
* security-sensitive failures

## Completion

All applications can reliably establish authenticated identity.

---

# 7. Slice 2 — Customer Profile

## Objective

Implement the customer identity/profile foundation.

## Scope

Implement:

* customer profile
* customer information
* saved addresses
* default address where specified
* profile updates

## Database

Implement:

```text
customer_profiles
addresses
```

## Authorization

Customer can access only their own customer data.

Admin access follows administrative permissions.

## Business Rules

Validate:

* ownership
* address requirements
* valid location data
* allowed profile changes

## API

Implement profile and address endpoints.

## Frontend

Customer application:

* profile
* address list
* add address
* edit address
* delete address
* default address

## Tests

Include:

* ownership isolation
* validation
* CRUD
* authorization
* API behavior

## Completion

Customer can maintain the data required for ordering.

---

# 8. Slice 3 — Restaurant Onboarding

## Objective

Allow restaurants to enter the platform and progress through the required approval lifecycle.

## Scope

Implement:

* restaurant application
* restaurant profile
* ownership
* operator access
* documents
* operating hours
* delivery settings
* payment account information
* admin review

## Database

Implement/use:

```text
restaurants
restaurant_applications
restaurant_staff
restaurant_documents
restaurant_operating_hours
restaurant_delivery_settings
restaurant_payment_accounts
```

## Roles

Restaurant access must use:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

## Authorization

Operators may perform only actions granted by the restaurant authorization model.

Restaurant resources must be tenant-isolated.

## Admin

Admin must be able to:

* review application
* approve
* reject
* request required information where specified

Sensitive actions are audited.

## Notifications

Relevant restaurant/admin notifications must be generated.

## Tests

Test:

* onboarding
* ownership
* operator access
* document handling
* approval
* rejection
* tenant isolation
* audit events

## Completion

An approved restaurant can proceed to menu configuration.

---

# 9. Slice 4 — Menu

## Objective

Allow approved restaurants to create and manage their menus.

## Scope

Implement:

* menu categories
* menu items
* variations
* add-ons
* pricing
* availability
* item ordering/display state

## Database

Implement/use:

```text
menu_categories
menu_items
item_variations
item_add_ons
```

## Authorization

Only authorized restaurant users can modify their restaurant menu.

Customers have read-only access to published/available menu data.

## Backend

Backend validates:

* price
* availability
* ownership
* menu relationships
* item configuration

## Frontend

Restaurant application:

* category management
* item management
* variation management
* add-on management
* availability controls

Customer application:

* category browsing
* item details
* pricing
* availability

## Tests

Test:

* restaurant ownership
* menu CRUD
* pricing
* availability
* invalid references
* authorization

## Completion

Customers can reliably browse an approved restaurant's available menu.

---

# 10. Slice 5 — Customer Discovery

## Objective

Allow customers to discover eligible restaurants.

## Scope

Implement:

* restaurant listing
* search
* filtering
* restaurant details
* menu retrieval
* availability
* location-aware discovery where specified

## Maps

Use the `MapsService` abstraction.

Do not place provider-specific map logic throughout the application.

## Backend

Backend determines:

* restaurant availability
* visibility
* menu availability
* applicable discovery rules

## Frontend

Implement:

* restaurant list
* search
* filters
* restaurant details
* menu browsing

## Tests

Test:

* visibility
* availability
* location behavior
* search/filter behavior
* unauthorized access to private restaurant data

## Completion

Customer can find an eligible restaurant and browse its menu.

---

# 11. Slice 6 — Cart

## Objective

Allow a customer to build an order before checkout.

## Scope

Implement:

* add item
* remove item
* update quantity
* variations
* add-ons
* restaurant association
* cart validation

## Important Rule

The cart is not the final financial authority.

The backend recalculates authoritative values during checkout.

## Backend

Validate:

* item exists
* item available
* restaurant relationship
* variation validity
* add-on validity
* quantity
* cart consistency

## Frontend

Implement:

* cart
* quantity changes
* item configuration
* subtotal display
* validation errors

## Tests

Include:

* invalid item
* unavailable item
* invalid variation
* invalid add-on
* quantity rules
* restaurant consistency

## Completion

Customer can construct a valid order candidate.

---

# 12. Slice 7 — Checkout

## Objective

Convert a valid cart into an authoritative order request.

## Scope

Implement:

* address selection
* delivery information
* price calculation
* applicable fees
* promotion validation where applicable
* payment method selection
* risk validation
* order creation preparation

## Critical Rule

The backend recalculates authoritative totals.

Never trust:

* client subtotal
* client discount
* client delivery fee
* client tax/fee values
* client grand total

## Backend

Checkout must validate:

```text
Customer
Restaurant
Items
Availability
Prices
Variations
Add-ons
Address
Promotion
Payment Method
Risk
Totals
```

## Idempotency

Order creation must support idempotency.

## Transactions

Order creation must be transactional.

## Events

Where required, emit an outbox event after successful order creation.

## Tests

Test:

* total calculation
* invalid cart
* unavailable item
* promotion eligibility
* address validation
* risk restriction
* duplicate request
* concurrent checkout

## Completion

A valid customer checkout can produce a durable order.

---

# 13. Slice 8 — Payments

## Objective

Implement payment processing for:

```text
ONLINE_PAYMENT
CASH_ON_DELIVERY
```

## Scope

Implement:

* payment record
* payment initiation
* provider abstraction
* payment callback/webhook handling
* COD validation
* payment state transitions
* refunds where required by the current order flow

## States

```text
PENDING
AUTHORIZED
SUCCEEDED
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

## Security

Never trust client claims of successful payment.

Provider confirmation is required.

## Idempotency

Payment operations must be idempotent.

Webhook processing must tolerate duplicates.

## Transactions

Payment state updates must be transactionally safe.

## Tests

Test:

* success
* failure
* duplicate webhook
* retry
* timeout
* COD restrictions
* authorization
* refund behavior

## Completion

Orders have a reliable payment state.

---

# 14. Slice 9 — Restaurant Orders

## Objective

Allow restaurant staff to process incoming orders.

## Scope

Implement:

* incoming order queue
* accept
* reject/cancel where allowed
* prepare
* ready for pickup
* order details
* order history

## Role Model

Restaurant operations use:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

Do not create separate kitchen/order roles.

## Order States

Restaurant operations participate in:

```text
PENDING
RESTAURANT_ACCEPTED
PREPARING
READY_FOR_PICKUP
```

## Notifications

Relevant restaurant and customer notifications must be generated.

## Realtime

Restaurant order updates should use realtime where required.

## Audit

Important order actions must be auditable.

## Tests

Test:

* state transitions
* authorization
* invalid transitions
* duplicate actions
* restaurant isolation
* notification events
* realtime events

## Completion

Restaurant can process an order through `READY_FOR_PICKUP`.

---

# 15. Slice 10 — Dispatch

## Objective

Assign an eligible rider to an order using the proximity-based dispatch system.

## Trigger

Dispatch begins when:

```text
READY_FOR_PICKUP
```

## Eligibility

Rider must satisfy relevant:

* online status
* availability
* proximity
* account status
* vehicle eligibility
* risk restrictions
* active delivery constraints

## Dispatch Configuration

```text
initial_radius
radius_increment
maximum_radius
offer_timeout_seconds
max_offer_attempts
```

## Process

```text
Ready Order
    ↓
Find Eligible Riders
    ↓
Rank
    ↓
Offer
    ↓
Rider Accepts
    ↓
Atomic Assignment
```

## Important Rule

Do not globally broadcast delivery requests to every rider.

## Concurrency

Two riders must not successfully acquire the same delivery.

## Redis

Redis may support temporary geo/presence/dispatch state.

Durable assignment remains in PostgreSQL.

## Tests

Required:

* proximity
* eligibility
* ranking
* offer timeout
* retry
* radius expansion
* rider rejection
* concurrent acceptance
* risk restrictions
* duplicate assignment prevention

## Completion

An order can move from:

```text
READY_FOR_PICKUP
→
RIDER_ASSIGNED
```

---

# 16. Slice 11 — Rider Delivery

## Objective

Allow riders to execute the assigned delivery.

## Scope

Implement:

* delivery details
* navigation/location integration
* reach restaurant
* pickup
* out-for-delivery
* delivery progress
* delivery completion preparation

## Database

Use:

```text
deliveries
delivery_assignments
rider_location_events
```

## Maps

Use the provider abstraction.

## State Flow

```text
RIDER_ASSIGNED
    ↓
PICKED_UP
    ↓
OUT_FOR_DELIVERY
```

## Authorization

Only the assigned rider can perform rider-specific delivery actions.

Admin/support intervention follows administrative rules.

## Realtime

Customer should receive appropriate delivery progress updates.

Restaurant should receive relevant operational updates.

## Tests

Test:

* assignment ownership
* pickup authorization
* invalid state transitions
* location handling
* realtime events
* concurrent actions

## Completion

Rider can safely execute an assigned delivery.

---

# 17. Slice 12 — Completion

## Objective

Complete the delivery and trigger downstream business effects.

## Scope

Implement:

* delivery completion
* order transition to `DELIVERED`
* customer completion state
* restaurant earning calculation
* rider earning calculation
* review eligibility
* relevant notifications

## Critical Requirement

Completion must not create duplicate financial effects.

Use:

* transactions
* idempotency
* durable records
* appropriate events

## Golden Flow

Completion connects:

```text
Delivery
 ↓
Order
 ↓
Earnings
 ↓
Review Eligibility
 ↓
Notifications
```

## Tests

Test:

* successful completion
* duplicate completion request
* invalid completion
* unauthorized completion
* financial effect creation
* review eligibility
* notification event

## Completion

A successfully delivered order reaches the complete downstream business state.

---

# 18. Slice 13 — Earnings

## Objective

Implement authoritative restaurant and rider earnings.

## Scope

Implement:

```text
restaurant_earnings
rider_earnings
```

## Rules

Financial calculations must be backend-authoritative.

Use:

```text
NUMERIC(12,2)
```

Do not use floating-point authoritative money calculations.

## Restaurant Earnings

Calculate according to the frozen financial rules.

## Rider Earnings

Calculate according to the frozen financial rules.

## Audit

Financial changes must be traceable.

## Tests

Test:

* earnings calculation
* rounding
* duplicate completion
* adjustments
* refunds/financial effects
* reconciliation consistency

## Completion

Completed orders produce correct durable earning records.

---

# 19. Slice 14 — Settlements

## Objective

Move completed earnings through settlement and payout workflows.

## Scope

Implement:

```text
settlements
settlement_items
payouts
invoices
```

## Financial Chain

```text
Earnings
 ↓
Settlement
 ↓
Payout
 ↓
Invoice
 ↓
Reconciliation
```

## Idempotency

Settlement and payout operations must be idempotent.

## Authorization

Sensitive financial operations require appropriate permissions and audit.

## Reconciliation

System must support detection of discrepancies between:

* orders
* payments
* earnings
* settlements
* payouts

## Tests

Test:

* settlement creation
* duplicate settlement
* payout failure
* retry
* reconciliation
* authorization
* audit

## Completion

The financial lifecycle is operationally complete.

---

# 20. Slice 15 — Promotions

## Objective

Implement V1 promotion functionality.

## Supported Types

```text
PERCENTAGE
FIXED_AMOUNT
```

## States

```text
DRAFT
ACTIVE
PAUSED
EXPIRED
DISABLED
```

## V1 Rule

One promotion per order.

No stacking.

## Scope

Implement:

* promotion creation/configuration
* eligibility
* validation
* redemption
* usage tracking
* discount calculation
* admin controls

## Backend

Promotion calculations remain authoritative.

## Concurrency

Promotion redemption must prevent invalid double usage where limits apply.

## Tests

Test:

* active/inactive
* expiration
* eligibility
* minimum order requirements where specified
* usage limits
* concurrent redemption
* discount calculation
* one-promotion rule

## Completion

Customers can use valid promotions during checkout.

---

# 21. Slice 16 — Reviews

## Objective

Implement customer-to-restaurant reviews.

## Scope

Implement:

* review creation
* rating 1–5
* review status
* restaurant response
* user reports
* admin moderation
* aggregate rating

## Eligibility

Review is available after:

```text
DELIVERED
```

One review per eligible order.

## Roles

Restaurant owner/operator may respond according to authorization rules.

Admin may moderate.

## Exclusions

Do not implement:

* rider ratings
* review photos/videos
* review rewards
* AI sentiment analysis

## Tests

Test:

* eligibility
* duplicate review
* rating validation
* response authorization
* reporting
* moderation
* aggregation

## Completion

Review lifecycle is operational.

---

# 22. Slice 17 — Support

## Objective

Implement customer, restaurant, rider, and admin support workflows.

## Scope

Implement:

```text
support_tickets
support_messages
```

Support includes:

* ticket creation
* categories
* priority
* status
* assignment
* SLA handling
* attachments where specified
* escalation
* internal notes
* customer communication
* operational intervention

## Critical Rule

Support must not bypass core business engines.

For example:

```text
Support
   ↓
Refund Request
   ↓
Refund Business Logic
   ↓
Payment/Financial System
```

not:

```text
Support
   ↓
Direct Balance Modification
```

## Notifications

Ticket and support updates should generate appropriate notifications.

## Realtime

Realtime may be used for active support conversations where specified.

## Tests

Test:

* ticket ownership
* access control
* status changes
* assignment
* escalation
* sensitive information
* audit
* business-state intervention

## Completion

Support can operate across the platform without breaking domain integrity.

---

# 23. Slice 18 — Admin Operations

## Objective

Complete platform-wide administrative operations.

## Scope

Implement/administer:

* users
* customers
* restaurants
* riders
* restaurant approvals
* orders
* payments
* refunds
* settlements
* promotions
* reviews
* support
* risk
* configuration
* audit
* operational reporting

## Security

Admin operations must enforce:

```text
Authentication
 ↓
Admin Role
 ↓
Permission
 ↓
Resource Scope
 ↓
Business Rule
 ↓
Audit
```

Sensitive actions require step-up/MFA where specified.

## Risk

Admin must be able to manage risk restrictions according to the risk specification.

## Configuration

Operational settings must be validated and audited.

## Bulk Actions

Bulk operations must:

* validate authorization
* validate each target
* handle partial failures explicitly
* remain auditable

## Tests

Test:

* permission boundaries
* resource access
* sensitive actions
* bulk actions
* audit
* financial operations
* risk actions
* configuration changes

## Completion

Core administrative operations are available.

---

# 24. Cross-Slice Infrastructure

The following should not be postponed until the very end if a slice requires them.

## Authentication

Required by all protected slices.

## Authorization

Required from the first protected feature.

## Database Migrations

Every schema change must include a migration.

## Logging

Structured logging must be present from early implementation.

## Audit

Audit support must be added when sensitive actions are introduced.

## Outbox

Outbox infrastructure should be established before the first critical event-driven workflow.

## Idempotency

Idempotency infrastructure should be established before the first critical retry-sensitive operation.

## Error Handling

A consistent error model should exist before substantial API implementation.

---

# 25. Recommended Foundational Work Before Slice 1

Before implementing Authentication, establish the minimal technical foundation:

```text
Repository
 ↓
Application scaffolding
 ↓
Database connection
 ↓
Migration framework
 ↓
Configuration system
 ↓
Logging
 ↓
Error handling
 ↓
Testing framework
 ↓
CI baseline
```

Do not build unrelated business features during foundation setup.

---

# 26. Slice Dependencies

The implementation dependency chain is:

```text
Authentication
      ↓
Customer Profile
      ↓
Restaurant Onboarding
      ↓
Menu
      ↓
Customer Discovery
```
