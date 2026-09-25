# QuickBite — Claude Code Development Rules

## 1. Purpose

QuickBite is a production-oriented food delivery marketplace consisting of:

* Customer App
* Restaurant App
* Rider App
* Admin Panel

The project is implemented as a **modular monolith** for V1.

The architecture, product requirements, database design, API specifications, business rules, security model, notifications, payments, financial model, maps/location model, promotions, reviews, support, admin operations, observability, testing, infrastructure, CI/CD, and implementation plan are frozen unless an explicit architectural decision changes them.

Claude Code must implement the approved specifications rather than redesigning the product during implementation.

---

# 2. Authoritative Documentation

Before implementing a feature, read the relevant authoritative documentation.

Core documents:

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
docs/IMPLEMENTATION_PLAN.md
```

ADR directory:

```text
docs/decisions/ADR/
```

If a feature conflicts with an authoritative document, do not silently choose one interpretation.

Stop and identify the conflict.

---

# 3. Frozen Architecture

V1 uses a **modular monolith**.

Core infrastructure:

* PostgreSQL
* Redis
* Background workers/job queue
* WebSockets
* Object storage
* Payment provider abstraction
* Maps provider abstraction
* Notification providers

PostgreSQL is the durable source of truth.

Redis must not become the source of truth for durable business state.

Use Redis for appropriate temporary or high-speed workloads such as:

* caching
* rate limiting
* temporary state
* presence
* geo/dispatch assistance
* realtime presence
* short-lived coordination

Critical durable events must use the outbox pattern where specified.

External providers must not be called from critical database transactions.

---

# 4. Roles

The only approved V1 roles are:

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
```

Restaurant operational responsibilities are intentionally consolidated into:

```text
RESTAURANT_OPERATOR
```

Do not introduce additional roles without an approved architectural decision.

---

# 5. Backend Authority

The backend is authoritative for all business-critical values.

Never trust the client for:

* prices
* menu availability
* discounts
* promotion eligibility
* order totals
* payment state
* refund state
* order status
* restaurant availability
* rider eligibility
* rider assignment
* cancellation eligibility
* earnings
* settlements
* permissions
* risk status
* review eligibility
* rating aggregation

Client-provided values must be treated as requests, not authoritative facts.

The backend must recalculate and validate authoritative values.

---

# 6. Security Rule

Every protected action follows this conceptual chain:

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

Authorization must be enforced server-side.

Do not rely on:

* hidden UI elements
* route visibility
* client-side role checks
* frontend validation
* obscured identifiers

for security.

Sensitive administrative operations require the appropriate authentication, authorization, audit, and step-up/MFA controls defined by the security specifications.

---

# 7. Vertical Slice Development

Implement features as **vertical slices**, not isolated technical layers.

A slice should be considered incomplete until all applicable layers work together.

Typical slice components:

```text
Database
↓
Domain/business logic
↓
Authorization
↓
API
↓
Background jobs
↓
Notifications/realtime
↓
Frontend
↓
Logging/audit
↓
Tests
```

Do not build the entire database first, then the entire backend, then the entire frontend.

Complete the relevant functionality end-to-end.

---

# 8. Current Implementation Order

The approved implementation order is:

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

Do not reorder slices without a documented reason.

---

# 9. Authentication Is Slice 1

Authentication is the first functional vertical slice.

Before implementing authentication:

1. Read the architecture documentation.
2. Read the database documentation.
3. Read the API specification.
4. Read the security/authorization documentation.
5. Read the testing specification.
6. Read the observability specification.
7. Read the implementation plan.
8. Inspect the existing repository.
9. Determine the actual selected framework/package structure from the repository.
10. Do not invent a conflicting stack.

Authentication implementation must establish the foundation required by the rest of the application.

---

# 10. Authentication Requirements

Authentication must support the approved QuickBite identity model.

Implementation must respect:

* secure credential handling
* password hashing where passwords are used
* authentication sessions/tokens
* authentication expiry
* refresh/revocation behavior where specified
* account status
* role assignment
* authorization integration
* rate limiting
* brute-force protection
* audit logging
* security events
* validation
* error handling
* test coverage

Do not expose sensitive authentication information in API responses or logs.

Do not log:

* passwords
* password hashes
* access tokens
* refresh tokens
* authentication secrets
* payment secrets
* provider credentials

---

# 11. User and Role Model

Authentication establishes identity.

Authorization determines what the authenticated identity may do.

Do not combine authentication and authorization into frontend logic.

Roles must come from the approved role model.

Do not allow users to self-assign privileged roles.

Examples:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
ADMIN
SUPER_ADMIN
```

Privileged role assignment must follow the approved backend/admin workflow.

---

# 12. Database Rules

Database changes must use migrations.

Never manually modify production database structure.

Every schema change must have:

* migration
* appropriate indexes
* constraints
* foreign keys where applicable
* uniqueness rules where applicable
* appropriate nullability
* audit implications
* tests

Use PostgreSQL as the durable source of truth.

Money must use:

```text
NUMERIC(12,2)
```

Never use floating-point numbers for financial values.

---

# 13. Transactions

Use database transactions when multiple durable state changes must succeed or fail together.

Do not place external provider calls inside critical database transactions.

Preferred pattern:

```text
Validate
↓
Begin transaction
↓
Write durable state
↓
Write outbox event
↓
Commit
↓
Worker processes external side effect
```

Do not create race conditions around:

* order state
* payment state
* rider assignment
* inventory/menu availability where applicable
* promotion redemption
* refunds
* earnings
* settlements
* payouts
* review creation

Use appropriate database constraints, locking, idempotency, and transactional logic.

---

# 14. Idempotency

Use idempotency wherever required by the specifications.

Important examples include:

* order creation
* payment operations
* refunds
* settlements
* payouts
* promotion redemption where applicable
* review creation where applicable
* externally triggered callbacks/webhooks

A retried request must not accidentally create duplicate durable business effects.

---

# 15. Order Lifecycle

The approved order lifecycle is:

```text
PENDING
→ RESTAURANT_ACCEPTED
→ PREPARING
→ READY_FOR_PICKUP
→ RIDER_ASSIGNED
→ PICKED_UP
→ OUT_FOR_DELIVERY
→ DELIVERED
```

Cancellation states:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

Backend code must enforce valid transitions.

Never allow clients to arbitrarily set an order status.

---

# 16. Dispatch

Rider dispatch is proximity-based.

When an order reaches:

```text
READY_FOR_PICKUP
```

the system evaluates eligible riders.

Eligibility can include:

* proximity
* online status
* availability
* active delivery constraints
* vehicle eligibility
* account status
* risk restrictions

Dispatch must not globally broadcast every order to every rider.

The dispatch engine must use the configured rules for:

* initial radius
* radius increment
* maximum radius
* offer timeout
* maximum offer attempts
* ranking

Assignment must be concurrency-safe.

---

# 17. Risk and Abuse Controls

Risk controls apply to:

```text
CUSTOMER
RESTAURANT
RIDER
```

Examples of risk signals include:

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

Possible actions include:

```text
NORMAL
MONITORED
COD_RESTRICTED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

Do not hard-code permanent bans.

Thresholds and restrictions must follow the configured business rules.

---

# 18. Notifications

Notifications must follow the notification specification.

Supported channels may include:

* push
* in-app
* SMS
* email
* realtime/WebSocket

Important durable events should use the outbox pattern.

Notification delivery must account for:

* retries
* failures
* duplicate prevention
* idempotency
* preferences
* authorization
* appropriate recipients

Do not send sensitive information to unauthorized users.

---

# 19. Financial Rules

The financial chain is:

```text
Order
→ Payment
→ Restaurant Earnings
→ Rider Earnings
→ Settlement
→ Payout
→ Invoice
→ Reconciliation
→ Audit
```

Do not calculate financial state independently in multiple modules.

Use the authoritative financial rules.

Never use floating-point arithmetic for money.

---

# 20. Logging and Observability

Production code must use structured logging.

Where applicable, preserve:

* request/correlation ID
* actor/user ID
* resource ID
* operation
* result
* duration
* error category

Do not log secrets or sensitive credentials.

Business-critical operations must be observable.

Security-sensitive and administrative actions must be auditable.

---

# 21. Error Handling

Errors must be:

* predictable
* structured
* safe for clients
* useful for developers
* observable internally

Do not expose:

* stack traces
* SQL errors
* secrets
* internal infrastructure details
* authentication secrets
* provider credentials

to normal clients.

Do not silently swallow errors.

---

# 22. Testing

Every implemented feature must include appropriate tests.

Depending on the feature:

```text
Unit tests
Integration tests
API tests
Database tests
Authorization tests
Security tests
Concurrency tests
Idempotency tests
End-to-end tests
```

At minimum, test:

* happy path
* validation failures
* authorization failures
* ownership failures
* duplicate requests
* invalid state transitions
* concurrency-sensitive behavior
* important edge cases

Do not mark a feature complete because the code merely compiles.

---

# 23. Frontend Rules

Frontend applications are clients of the backend.

Never duplicate authoritative business logic in the frontend.

Frontend may provide:

* validation for UX
* presentation
* optimistic UI where safe
* local state
* navigation
* user interaction

Backend remains authoritative.

Never rely on frontend checks for:

* authorization
* prices
* payment state
* order state
* promotion eligibility
* cancellation eligibility
* rider eligibility
* financial calculations

---

# 24. API Rules

APIs must follow the approved API specification.

Before adding an endpoint:

1. Check whether an equivalent endpoint already exists.
2. Check request/response conventions.
3. Check authentication requirements.
4. Check authorization.
5. Check validation.
6. Check idempotency.
7. Check error behavior.
8. Check audit requirements.
9. Check notifications/realtime effects.
10. Check tests.

Do not create duplicate APIs for the same business operation.

---

# 25. Configuration

Business thresholds that are defined as configurable must remain configurable.

Do not bury configurable values inside source code.

Examples include:

* dispatch radius
* dispatch timeout
* dispatch attempt limits
* risk thresholds
* cancellation configuration
* promotion constraints
* rate limits
* operational limits

Use the approved configuration mechanism.

---

# 26. External Providers

External systems must be accessed through the approved abstraction boundaries.

Examples:

```text
PaymentService
MapsService
NotificationService
StorageService
```

Do not scatter provider-specific implementation throughout business logic.

Business logic should depend on the internal abstraction rather than directly on a provider SDK wherever the architecture specifies an abstraction.

---

# 27. No Silent Architecture Changes

Claude Code must not silently:

* add microservices
* introduce new roles
* change database ownership
* replace PostgreSQL
* replace Redis
* change the order lifecycle
* change financial states
* add unsupported V1 features
* remove security controls
* bypass authorization
* remove audit requirements
* change dispatch behavior
* add rider ratings
* add promotion stacking
* add referral systems
* add cashback
* add AI systems
* introduce unnecessary infrastructure

If a change is genuinely required, document it as an ADR before treating it as part of the architecture.

---

# 28. Ambiguity Rule

If the specifications do not define behavior clearly:

**Do not guess.**

First determine whether the behavior is already defined elsewhere in the documentation.

If still unresolved:

1. Identify the ambiguity.
2. Identify the affected modules.
3. Explain the possible implementation consequences.
4. Ask for a decision when required.
5. Create an ADR if the decision changes architecture or a significant business rule.

Never silently choose behavior that can affect money, security, permissions, order state, dispatch, risk, or data integrity.

---

# 29. Definition of Done

A feature is not complete until:

* implementation exists
* database migrations exist where required
* API behavior is implemented
* authorization is enforced
* business rules are enforced
* validation exists
* errors are handled
* idempotency exists where required
* transactions are correct
* events/outbox are implemented where required
* notifications/realtime are implemented where required
* audit/logging is implemented where required
* tests exist
* relevant documentation is updated
* lint/typecheck/build/tests pass
* no frozen architecture rule was violated

---

# 30. Implementation Workflow

Before coding:

```text
Read CLAUDE.md
↓
Read authoritative feature specifications
↓
Inspect existing implementation
↓
Identify dependencies
↓
Identify database impact
↓
Identify API impact
↓
Identify authorization requirements
↓
Identify business rules
↓
Identify notification/realtime impact
↓
Identify financial/risk impact
↓
Identify tests
↓
Identify ambiguity
```

Then:

```text
Implement
↓
Run tests
↓
Run typecheck
↓
Run lint
↓
Run build
↓
Review security
↓
Review authorization
↓
Review business rules
↓
Review database migrations
↓
Review observability
↓
Review documentation
```

---

# 31. Repository Discipline

Keep responsibilities separated according to the approved modular architecture.

Avoid:

* giant controllers
* business logic inside route handlers
* database logic scattered through unrelated modules
* duplicated business rules
* duplicated financial calculations
* duplicated authorization
* provider-specific code inside domain logic

Prefer clear module boundaries and reusable domain/business services.

Do not create abstractions merely for theoretical future requirements.

---

# 32. V1 Scope Protection

The following remain outside V1 unless explicitly approved:

```text
AI recommendations
AI voice ordering
Loyalty
Subscriptions
Corporate accounts
Multi-restaurant cart
Advanced advertising marketplace
Advanced AI fraud detection
Complex predictive analytics
Grocery
Pharmacy
Multi-country
Multi-currency
Cryptocurrency
Rider ratings
AI review sentiment
Review rewards
Review photos/videos
Promotion stacking
Referral systems
Cashback
Complex promotional segmentation
```

Do not implement excluded functionality as “preparation” unless the current slice genuinely requires it.

---

# 33. Git Discipline

Keep commits focused.

Prefer commits that represent coherent implementation units.

Examples:

```text
feat(auth): add authentication foundation
feat(auth): add session management
feat(auth): add role authorization
test(auth): add authentication integration tests
fix(auth): prevent duplicate session creation
```

Do not mix unrelated features in one implementation change.

Never commit secrets.

Never commit:

* `.env` files containing secrets
* API keys
* private credentials
* production passwords
* payment secrets
* provider tokens

---

# 34. Final Rule

QuickBite is being built as a production system.

Correctness takes priority over speed.

Security takes priority over convenience.

Backend authority takes priority over client assumptions.

Data integrity takes priority over shortcuts.

Explicit specifications take priority over guesses.

When the specification is clear, implement it.

When the specification is ambiguous, stop and resolve it.

When a proposed change affects architecture or a frozen business rule, document the decision before implementation.

**Do not silently invent behavior.**
