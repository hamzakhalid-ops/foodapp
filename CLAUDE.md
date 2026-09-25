# QUICKBITE — CLAUDE CODE PROJECT RULES

## 1. PURPOSE

QuickBite is a production-oriented food delivery marketplace.

The repository contains four products:

1. Customer App
2. Restaurant App
3. Rider App
4. Admin Panel

This file contains the permanent implementation rules for Claude Code.

Treat this file together with the documents under `docs/` as the project's engineering source of truth.

Do not restart the architecture.

Do not redesign completed specifications without an explicit approved decision.

Do not silently change frozen business rules.

---

# 2. AUTHORITATIVE DOCUMENT HIERARCHY

When implementing QuickBite, use this hierarchy:

```text
CLAUDE.md
    ↓
Product / Architecture / Database / API specifications
    ↓
Business Rules
    ↓
Security / Authorization Rules
    ↓
Payments / Financial / Maps / Promotions / Reviews / Support / Admin
    ↓
Implementation Plan
    ↓
App-specific README / SCREEN_PLAN
    ↓
Stitch UI design references
    ↓
Implementation
```

For conflicts:

* Security rules override UI assumptions.
* Backend/API/business rules override frontend assumptions.
* Database specification overrides inferred database structure.
* Stitch is the visual reference for UI appearance and interaction presentation.
* Stitch does NOT override backend business rules.
* Do not invent behavior because a design mockup does not show it.

If a requirement conflicts with an existing frozen rule:

```text
Identify conflict
        ↓
Explain affected documents
        ↓
Do not silently change behavior
        ↓
Request/receive approval
        ↓
Update affected specifications
        ↓
Implement
```

---

# 3. CURRENT PROJECT STATUS

Specification phases are complete through:

```text
01 Product Requirements        COMPLETE
02 System Architecture         COMPLETE
03 Database Architecture       COMPLETE
04 API Specification           COMPLETE
05 Business Rules              COMPLETE
06 Security / Authorization    COMPLETE
07 Notifications / Realtime    COMPLETE
08 Payments / Financial        COMPLETE
09 Maps / Location             COMPLETE
10 Promotions                  COMPLETE
11 Reviews / Ratings           COMPLETE
12 Support                     COMPLETE
13 Admin / Operations           COMPLETE
14 Observability               COMPLETE
15 Testing / QA                COMPLETE
16 Infrastructure              COMPLETE
17 CI/CD / DevOps              COMPLETE
18 Architecture Review         COMPLETE
19 Implementation Plan         COMPLETE
```

The project is now in:

```text
PHASE 20 — IMPLEMENTATION
```

The master implementation plan is:

```text
docs/IMPLEMENTATION_PLAN.md
```

---

# 4. V1 ARCHITECTURE

QuickBite V1 is a:

```text
MODULAR MONOLITH
```

Do NOT introduce microservices unless an explicit architecture decision is approved.

Core infrastructure:

```text
PostgreSQL
Redis
Background Workers
Job Queue
WebSockets
Object Storage
Payment Provider
Maps Provider
Notification Providers
```

PostgreSQL is the durable source of truth.

Redis is not the durable source of truth.

---

# 5. FROZEN ROLES

Only these roles exist:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
ADMIN
SUPER_ADMIN
```

Do not create:

```text
RESTAURANT_MANAGER
ORDER_STAFF
KITCHEN_STAFF
DELIVERY_MANAGER
```

or other additional roles without an explicit approved architecture change.

Restaurant Owner and Restaurant Operator are intentionally consolidated for V1.

---

# 6. BACKEND AUTHORITY

The backend is authoritative for:

* Prices
* Menu availability
* Discounts
* Promotion eligibility
* Order totals
* Payment status
* Refund status
* Order status
* Restaurant availability
* Rider assignment
* Rider eligibility
* Cancellation eligibility
* Earnings
* Settlements
* Payouts
* Permissions
* Risk status
* Review eligibility
* Review status
* Rating aggregation

Never trust client-provided authoritative values.

Frontend values are presentation/input values only.

---

# 7. SECURITY MODEL

Authorization follows:

```text
Authentication
      ↓
Identity
      ↓
Role
      ↓
Permission
      ↓
Resource Ownership / Tenant
      ↓
Business Rule
      ↓
Action
```

All important authorization checks must happen server-side.

Never rely on:

* hidden UI buttons
* disabled frontend controls
* client-side role checks
* route hiding
* client-provided resource ownership

Sensitive admin actions must be protected according to the security specification and audited.

---

# 8. DATABASE RULES

Use PostgreSQL as the durable database.

Money must use:

```text
NUMERIC(12,2)
```

Never use floating point for financial values.

Use:

* foreign keys
* appropriate constraints
* indexes
* transactions
* version-controlled migrations
* timezone-aware timestamps

Do not create duplicate tables when an existing table satisfies the requirement.

Important existing domains include:

```text
Identity
Restaurants
Menu
Orders
Payments
Riders
Delivery
Risk
Promotions
Reviews
Notifications
Financial
Support
Audit
System
```

Use the existing database specification before creating schema.

---

# 9. TRANSACTIONS

Critical state changes must be transactionally safe.

Examples:

* order creation
* order status transitions
* rider assignment
* payment state changes
* refunds
* financial records
* settlement creation
* payout state changes
* review creation where required

Do not perform external provider calls inside critical database transactions.

Use the outbox pattern for critical domain events.

---

# 10. IDEMPOTENCY

Use the existing:

```text
idempotency_keys
```

mechanism.

Important operations requiring idempotency include:

* order creation
* payment
* refund
* settlement
* payout
* review creation where applicable
* promotion redemption where applicable

Do not invent unrelated idempotency systems.

---

# 11. OUTBOX

Critical domain events should follow:

```text
Database Transaction
        ↓
Business Record
        ↓
Outbox Event
        ↓
Background Worker
        ↓
External / Async Effects
```

Examples:

* notifications
* realtime events
* risk processing
* asynchronous provider actions

External providers must not be called directly inside critical database transactions.

---

# 12. ORDER LIFECYCLE

Primary order lifecycle:

```text
PENDING
    ↓
RESTAURANT_ACCEPTED
    ↓
PREPARING
    ↓
READY_FOR_PICKUP
    ↓
RIDER_ASSIGNED
    ↓
PICKED_UP
    ↓
OUT_FOR_DELIVERY
    ↓
DELIVERED
```

Cancellation states:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

The backend controls valid transitions.

Frontend must never directly decide order state.

---

# 13. CANCELLATION

Current V1 behavior:

```text
PENDING
→ Customer cancellation allowed subject to payment/refund rules.

RESTAURANT_ACCEPTED
→ Restricted/configurable.

PREPARING
→ Customer normally cannot cancel.

READY_FOR_PICKUP
→ Customer normally cannot cancel.

RIDER_ASSIGNED
→ Customer normally cannot cancel.

PICKED_UP
→ Customer cannot normally cancel.

OUT_FOR_DELIVERY
→ Customer cannot normally cancel.

DELIVERED
→ Cancellation not applicable.
```

Admin/support intervention must follow business rules and must be audited.

---

# 14. RIDER DISPATCH

Rider orders must NOT be globally broadcast.

When an order becomes:

```text
READY_FOR_PICKUP
```

the Dispatch Engine determines eligible riders.

Eligibility includes:

* proximity
* online status
* availability
* no conflicting active delivery
* vehicle eligibility
* account status
* risk restrictions

Then:

```text
Rank
 ↓
Offer
 ↓
Accept
 ↓
Atomic Assignment
```

V1 normally supports one active delivery per rider.

Configurable dispatch values include:

```text
initial_radius
radius_increment
maximum_radius
offer_timeout_seconds
max_offer_attempts
```

---

# 15. TRUST & RISK

Risk subjects:

```text
CUSTOMER
RESTAURANT
RIDER
```

Risk signals include:

```text
COD_NON_RECEIPT
REPEATED_ORDER_CANCELLATION
REPEATED_PAYMENT_FAILURE
SUSPICIOUS_ORDER_PATTERN
MULTIPLE_FAILED_DELIVERIES
EXCESSIVE_REFUNDS
ABNORMAL_ORDER_FREQUENCY
SUSPICIOUS_ACCOUNT_ACTIVITY
REPEATED_FALSE_COMPLAINT
```

Risk actions:

```text
NORMAL
MONITORED
COD_RESTRICTED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

Do not hard-code permanent bans.

Thresholds must remain configurable.

---

# 16. PAYMENTS AND FINANCIALS

V1 payment methods:

```text
ONLINE_PAYMENT
CASH_ON_DELIVERY
```

Payment states:

```text
PENDING
AUTHORIZED
SUCCEEDED
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

Financial chain:

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
Invoice
 ↓
Reconciliation
 ↓
Audit
```

Never calculate authoritative financial values in the frontend.

---

# 17. PROMOTIONS

V1 promotion types:

```text
PERCENTAGE
FIXED_AMOUNT
```

Promotion statuses:

```text
DRAFT
ACTIVE
PAUSED
EXPIRED
DISABLED
```

V1 supports:

```text
One promotion per order
```

No promotion stacking.

Do not introduce:

* referral
* cashback
* complex segmentation
* loyalty
* subscription

unless explicitly approved.

---

# 18. REVIEWS

V1 review relationship:

```text
CUSTOMER → RESTAURANT
```

Rating:

```text
1–5
```

Eligibility:

```text
DELIVERED
```

One eligible review per order.

Review statuses:

```text
PUBLISHED
PENDING_MODERATION
HIDDEN
REMOVED
```

Restaurant Owner and authorized Restaurant Operator may respond.

Do not introduce rider ratings unless the architecture is explicitly changed.

---

# 19. NOTIFICATIONS / REALTIME

Use the notification and realtime specifications.

Supported notification channels may include:

* push
* in-app
* SMS
* email

Use outbox/background processing where required.

Realtime must handle:

* authentication
* authorization
* reconnection
* ordering
* duplicate events
* offline behavior

---

# 20. EXTERNAL PROVIDERS

Use provider abstractions.

Do not scatter provider-specific SDK calls throughout business logic.

Examples:

```text
PaymentService
MapsService
NotificationService
StorageService
```

Business logic should depend on application-level interfaces rather than directly on provider implementations.

---

# 21. FRONTEND APPLICATION STRUCTURE

QuickBite has four separate application areas:

```text
apps/customer
apps/restaurant
apps/rider
apps/admin
```

Each app must have its own:

```text
README.md
SCREEN_PLAN.md
design/
src/
```

Recommended structure:

```text
apps/
├── customer/
│   ├── README.md
│   ├── SCREEN_PLAN.md
│   ├── design/
│   │   └── stitch/
│   └── src/
│
├── restaurant/
│   ├── README.md
│   ├── SCREEN_PLAN.md
│   ├── design/
│   │   └── stitch/
│   └── src/
│
├── rider/
│   ├── README.md
│   ├── SCREEN_PLAN.md
│   ├── design/
│   │   └── stitch/
│   └── src/
│
└── admin/
    ├── README.md
    ├── SCREEN_PLAN.md
    ├── design/
    │   └── stitch/
    └── src/
```

Do not mix screen implementations between applications.

Shared components should live in the appropriate shared package rather than being copied between apps.

---

# 22. STITCH DESIGN WORKFLOW

The user creates UI designs using Google Stitch.

Stitch designs are the primary visual reference for frontend implementation.

Claude Code must reproduce the approved design faithfully.

Match where applicable:

* layout
* spacing
* typography
* colors
* component hierarchy
* card styles
* borders
* shadows
* icons
* buttons
* navigation
* form layout
* states
* empty states
* loading states
* error states
* responsive behavior

Do not redesign the UI simply because Claude prefers another style.

However:

```text
Stitch controls appearance.
Product/API/business/security specifications control behavior.
```

If Stitch conflicts with an authoritative business rule, implement the business rule and preserve the design as closely as possible.

---

# 23. SCREEN-BATCH RULE

NEVER build an entire app in one task.

Build:

```text
ONE APP
    ↓
ONE SCREEN BATCH
    ↓
IMPLEMENT
    ↓
TEST
    ↓
REVIEW
    ↓
STOP
    ↓
USER APPROVAL
    ↓
NEXT BATCH
```

Default Stitch batch size:

```text
4 screens
```

Do not automatically increase the batch size.

If a batch contains fewer than four screens because the feature boundary requires it, keep the smaller batch.

---

# 24. APP ORDER

Unless the user explicitly changes the order:

```text
1. Customer App
2. Restaurant App
3. Rider App
4. Admin Panel
```

Complete the current app before starting the next app.

Do not work on multiple apps simultaneously unless explicitly instructed.

---

# 25. SCREEN PLAN STATUS

Every screen in `SCREEN_PLAN.md` must have a status:

```text
TODO
IN_PROGRESS
REVIEW
APPROVED
BLOCKED
```

Rules:

```text
TODO
→ Claude may start it when its batch is active.

IN_PROGRESS
→ Claude is actively implementing it.

REVIEW
→ Implementation is complete and waiting for user review.

APPROVED
→ User has accepted it.

BLOCKED
→ Implementation cannot continue because a dependency or decision is missing.
```

Claude must not mark a screen `APPROVED`.

Only the user/reviewer approves a screen.

---

# 26. ACTIVE BATCH RULE

Claude may only implement screens explicitly listed in the current active batch.

Example:

```text
BATCH 01

1. Splash
2. Welcome
3. Login
4. Create Account
```

Claude must NOT implement:

* Phone Verification
* Forgot Password
* Home
* Dashboard
* Menu
* other future screens

even if those screens are easy to implement.

---

# 27. STOP RULE

At the end of an active screen batch:

```text
STOP.
```

Do not continue to the next batch automatically.

Claude should report:

```text
Batch completed.
Screens implemented:
- ...
- ...
- ...
- ...

Validation:
- lint
- typecheck
- tests
- build

Known issues:
- ...

Next batch:
BATCH XX

Waiting for approval.
```

Do not implement the next batch until the user explicitly asks to continue.

---

# 28. SCREEN COMPLETION DEFINITION

A screen is complete only when:

* UI matches the Stitch reference
* required navigation works
* required interactions work
* API integration is implemented where applicable
* loading state exists where applicable
* error state exists where applicable
* empty state exists where applicable
* authentication/authorization behavior is correct
* accessibility basics are respected
* responsive behavior is reasonable for the target
* lint passes
* typecheck passes
* relevant tests pass
* build passes where applicable
* no unrelated screens are changed

Do not claim a screen is complete if it is only visually mocked.

---

# 29. DO NOT USE FAKE BACKEND LOGIC

Do not hide unfinished backend behavior behind fake success responses.

Do not implement:

```text
fake payment success
fake order creation
fake rider assignment
fake financial records
fake authorization
```

unless a development mock is explicitly requested and clearly isolated.

When backend functionality is not yet available:

* use the approved API contract
* create the correct integration boundary
* clearly identify the missing dependency
* do not silently invent production behavior

---

# 30. API RULES

Use:

```text
/api/v1
```

Follow the API specification.

Do not invent endpoint names when the API specification already defines the endpoint.

Do not change request/response contracts without updating the API specification.

Validate input server-side.

Return structured errors according to the API specification.

---

# 31. ERROR HANDLING

Errors must be:

* explicit
* structured
* actionable
* safe
* consistent

Do not expose:

* secrets
* internal stack traces
* database internals
* provider credentials
* sensitive implementation details

Frontend should display appropriate user-facing messages while preserving structured backend errors internally.

---

# 32. OBSERVABILITY

Use the observability specification.

Important operations should provide appropriate:

* structured logs
* correlation/request IDs
* metrics
* traces where applicable
* audit records

Never log:

* passwords
* authentication secrets
* payment secrets
* sensitive tokens
* unnecessary personal data

---

# 33. TESTING

Implementation must follow the testing specification.

Use appropriate:

```text
Unit Tests
Integration Tests
API Tests
Authorization Tests
Business Rule Tests
Database Tests
End-to-End Tests
```

Important business engines require meaningful test coverage.

At minimum, protect:

* authentication
* authorization
* order lifecycle
* cancellation
* dispatch
* risk
* payment state transitions
* financial calculations
* promotion eligibility
* review eligibility

---

# 34. GIT DISCIPLINE

Keep commits focused.

Examples:

```text
feat(auth): implement authentication
feat(customer): implement customer profile
feat(restaurant): implement onboarding
feat(menu): implement menu management
feat(dispatch): implement rider dispatch
```

Avoid:

```text
feat: build entire QuickBite platform
```

Do not mix unrelated features into one commit.

---

# 35. NO UNRELATED CHANGES

During a task:

DO:

* implement the requested slice
* modify required shared code
* modify required backend/API code
* add required tests
* update required documentation

DO NOT:

* refactor unrelated modules
* redesign unrelated screens
* change architecture
* rename unrelated files
* add unnecessary dependencies
* implement future features
* modify another app without necessity

---

# 36. DEPENDENCY RULE

If implementation requires a missing dependency:

1. Identify it.
2. Check the existing specifications.
3. Check whether the dependency is already planned.
4. Implement the smallest coherent solution.
5. Do not introduce a large new technology without approval.

Avoid unnecessary:

* microservices
* message brokers
* search infrastructure
* distributed systems
* AI services
* infrastructure complexity

---

# 37. V1 EXCLUSIONS

Do not implement the following unless explicitly approved:

* AI recommendations
* AI voice ordering
* loyalty
* subscriptions
* corporate accounts
* multi-restaurant cart
* advanced advertising marketplace
* advanced AI fraud detection
* complex predictive analytics
* grocery
* pharmacy
* multi-country
* multi-currency
* cryptocurrency
* rider ratings
* AI review sentiment
* review rewards
* review photos/videos
* promotion stacking
* referrals
* cashback
* complex promotion segmentation

---

# 38. AMBIGUITY RULE

If an implementation detail is missing:

DO NOT silently invent important business behavior.

Instead:

```text
Identify ambiguity
↓
Check existing specifications
↓
Check related business rules
↓
If still unresolved:
Report the ambiguity
↓
Request a decision when necessary
```

For small implementation details that do not change architecture, security, business rules, API contracts, or data behavior, use the simplest conventional implementation.

---

# 39. DEFINITION OF DONE

A vertical implementation slice is complete when:

```text
Database
    ↓
Backend
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
    ↓
Lint
    ↓
Typecheck
    ↓
Build
    ↓
Review
```

are complete for the scope of that slice.

---

# 40. MASTER IMPLEMENTATION SLICES

Follow:

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

Do not skip ahead without a reason.

---

# 41. FRONTEND IMPLEMENTATION ORDER

Within each application:

```text
Foundation
    ↓
Authentication
    ↓
Core navigation
    ↓
Primary feature screens
    ↓
Secondary feature screens
    ↓
Settings / supporting screens
    ↓
Edge states
```

Implement in screen batches according to the application's `SCREEN_PLAN.md`.

---

# 42. CLAUDE TASK FORMAT

When beginning an implementation task, Claude should first read:

```text
CLAUDE.md
```

Then read the relevant:

```text
docs/
apps/<current-app>/README.md
apps/<current-app>/SCREEN_PLAN.md
apps/<current-app>/design/stitch/
```

For backend work, read the relevant specification documents before coding.

For frontend work, read both the relevant specifications and Stitch references.

---

# 43. REQUIRED BATCH PROMPT BEHAVIOR

A typical frontend instruction will look like:

```text
Implement the current active screen batch for the Customer App.

Read:
- CLAUDE.md
- apps/customer/README.md
- apps/customer/SCREEN_PLAN.md
- relevant docs
- Stitch references under apps/customer/design/stitch/

Implement ONLY the currently active batch.

Do not implement future screens.

Match the Stitch designs closely.

Follow all existing backend, API, authorization, and business rules.

Run the required validation.

When the batch is complete, STOP and report the result.

Do not start the next batch until explicitly instructed.
```

---

# 44. FINAL RULE

The goal is:

```text
Simple enough to build
+
Strong enough for production
+
Explicit enough for Claude Code
+
Secure enough for real users
+
Auditable enough for financial operations
+
Faithful enough to the approved Stitch designs
```

Never sacrifice correctness for speed.

Never sacrifice the architecture for convenience.

Never expand the scope silently.
