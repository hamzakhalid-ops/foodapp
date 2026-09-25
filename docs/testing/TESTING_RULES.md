# QuickBite Testing Rules

**Path:** `docs/testing/TESTING_RULES.md`

**Status:** FROZEN
**Phase:** 15 — Testing & QA
**Authority:** Authoritative testing and quality rules

---

# 1. Purpose

This document defines the mandatory testing rules for QuickBite.

Testing must verify:

* functional correctness
* business-rule correctness
* authorization
* security
* financial correctness
* order lifecycle correctness
* dispatch correctness
* risk behavior
* notification behavior
* realtime behavior
* concurrency safety
* idempotency
* data integrity
* production readiness

Testing is part of implementation, not a final step after implementation.

---

# 2. Core Testing Principle

Every production feature must be tested at the level appropriate to its risk.

Critical financial, authorization, order, dispatch, and risk behavior requires stronger testing than ordinary presentation logic.

---

# 3. Testing Pyramid

QuickBite should use a layered testing strategy:

```text
                 E2E
              Integration
           API / Contract
        Unit / Domain Tests
```

Prefer fast lower-level tests for deterministic logic.

Use E2E tests for critical cross-system workflows.

---

# 4. Required Test Types

QuickBite V1 must support:

* unit tests
* integration tests
* API tests
* contract tests where applicable
* database tests
* authorization/security tests
* concurrency tests
* idempotency tests
* financial tests
* dispatch tests
* risk tests
* notification tests
* realtime tests
* E2E tests
* regression tests
* load/performance tests
* production smoke tests

---

# 5. Unit Tests

Unit tests must cover isolated business logic.

Important targets include:

* order state transitions
* cancellation rules
* promotion calculations
* risk rules
* dispatch ranking
* eligibility logic
* payment state logic
* refund rules
* review eligibility
* financial calculations
* notification routing
* permission checks

Unit tests should be deterministic.

---

# 6. Business Rules Must Be Tested

Every frozen business rule should have corresponding tests.

Examples:

```text
PENDING
→ customer cancellation allowed subject to rules

PREPARING
→ normal customer cancellation restricted

DELIVERED
→ order completion state
```

The exact rules must come from the authoritative business-rule documents.

---

# 7. Backend Authority Tests

Tests must verify that clients cannot override backend-controlled values.

Test attempts to manipulate:

* price
* subtotal
* delivery fee
* discount
* promotion eligibility
* order total
* payment state
* order status
* restaurant availability
* rider assignment
* earnings
* settlement values
* risk state

must be rejected or ignored according to the API specification.

---

# 8. Authentication Tests

Test:

* registration
* login
* logout
* session expiration
* token validation
* refresh behavior
* invalid credentials
* account status restrictions
* MFA where applicable
* step-up authentication where required

---

# 9. Authorization Tests

Authorization must be tested separately from authentication.

Test:

```text
Authentication
→ Identity
→ Role
→ Permission
→ Resource ownership / tenant
→ Business rule
→ Action
```

A valid user must still be denied when they lack the required permission or resource access.

---

# 10. Tenant Isolation

Restaurant users must not access another restaurant's resources.

Tests must verify isolation for:

* orders
* menu
* staff
* promotions
* earnings
* documents
* settings
* reviews
* support records

Cross-tenant access must fail safely.

---

# 11. Role Testing

At minimum test:

* CUSTOMER
* RESTAURANT_OWNER
* RESTAURANT_OPERATOR
* RIDER
* ADMIN
* SUPER_ADMIN

Do not invent additional roles in tests unless the authorization specification defines them.

---

# 12. Database Testing

Database tests must verify:

* foreign keys
* unique constraints
* check constraints
* indexes where behavior depends on them
* nullable/non-nullable fields
* enum/state constraints
* transactional behavior
* cascade behavior
* uniqueness rules

---

# 13. Migration Testing

Every migration must be tested before production.

Test:

* migration from supported previous state
* migration success
* schema correctness
* application compatibility
* rollback strategy where supported
* data preservation

Destructive migrations require additional review.

---

# 14. API Testing

API tests must verify:

* request validation
* authentication
* authorization
* business rules
* response structure
* status codes
* error codes
* pagination
* filtering
* sorting where defined
* idempotency
* rate limiting
* transaction behavior

API tests must use the authoritative API specification.

---

# 15. API Error Testing

Tests must verify expected errors for:

* invalid input
* unauthenticated requests
* unauthorized requests
* forbidden resources
* missing resources
* invalid state transitions
* duplicate operations
* expired operations
* rate limits
* provider failures

Error responses must remain consistent with the API specification.

---

# 16. Idempotency Testing

Idempotency must be explicitly tested for applicable operations.

Examples:

* create order
* payment
* refund
* settlement
* payout where applicable
* review creation where applicable
* promotion redemption where applicable

Repeated identical requests must not create duplicate business effects.

---

# 17. Concurrency Testing

Concurrency testing is mandatory for race-sensitive operations.

Examples:

* two riders accepting the same dispatch offer
* two admins cancelling the same order
* duplicate payment callbacks
* duplicate refund requests
* concurrent promotion redemption
* concurrent settlement processing
* simultaneous order state transitions

Exactly one valid state-changing operation must succeed where the business rule requires exclusivity.

---

# 18. Transaction Testing

Critical multi-record operations must be tested for atomicity.

Examples:

```text
Order creation
Payment recording
Refund
Restaurant earnings
Rider earnings
Settlement
Payout
Dispatch assignment
```

If a critical transaction fails, partial invalid state must not remain.

---

# 19. Order Lifecycle Testing

Test the complete valid lifecycle:

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

Also test valid cancellation states:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

Invalid transitions must be rejected.

---

# 20. Cancellation Testing

Test:

* customer cancellation
* restaurant cancellation
* admin cancellation
* cancellation timing
* payment effects
* refund effects
* notifications
* audit logging
* risk effects where applicable

Admin cancellations must always produce the required audit record.

---

# 21. Dispatch Testing

Dispatch tests must cover:

* READY_FOR_PICKUP trigger
* rider eligibility
* proximity filtering
* online state
* availability
* conflicting delivery
* vehicle eligibility
* account status
* risk restrictions
* ranking
* offer creation
* offer timeout
* offer rejection
* assignment
* concurrent acceptance
* failed assignment
* radius expansion
* maximum attempts

The dispatch engine must not broadcast orders globally.

---

# 22. Risk Testing

Test:

* risk event creation
* rule evaluation
* flags
* restrictions
* COD restriction
* additional verification
* order restriction
* account restriction
* threshold configuration
* repeated suspicious behavior
* restriction removal where supported

Risk decisions must be deterministic for a given input/configuration.

---

# 23. Payment Testing

Payment tests must include:

* successful payment
* failed payment
* cancelled payment
* duplicate callback
* delayed callback
* invalid callback
* provider timeout
* provider failure
* webhook retry
* reconciliation
* refund
* partial refund where supported

External payment providers must be mocked/stubbed in deterministic automated tests.

---

# 24. Financial Testing

Financial tests must verify:

* money precision
* earnings calculation
* settlement calculation
* payout calculation
* refunds
* reconciliation
* duplicate prevention
* transaction atomicity
* auditability

Never use floating-point assertions for monetary correctness.

---

# 25. Money Assertions

Money must be tested using exact decimal semantics.

Example:

```text
Expected: 100.25
Actual:   100.25
```

Avoid assertions based on binary floating-point arithmetic.

---

# 26. Promotion Testing

Test:

* percentage discount
* fixed discount
* minimum order
* maximum discount
* validity period
* usage limit
* per-customer limit
* code validation
* restaurant ownership
* paused promotion
* expired promotion
* disabled promotion
* duplicate redemption
* risk integration
* backend recalculation

---

# 27. Review Testing

Test:

* review only after DELIVERED
* one restaurant review per eligible order
* 1–5 rating
* review status
* moderation
* report
* owner/operator response
* aggregate calculation
* unauthorized response
* duplicate review prevention

Rider ratings must not be introduced through tests unless the architecture is explicitly changed.

---

# 28. Notification Testing

Test:

* notification creation
* routing
* templates
* preferences
* retries
* provider failure
* duplicate prevention
* outbox processing
* delivery status
* critical order notifications
* payment notifications
* support notifications
* security notifications

---

# 29. Realtime Testing

Test:

* WebSocket authentication
* channel authorization
* connection
* reconnection
* subscription
* event delivery
* event ordering where required
* duplicate events
* offline behavior
* reconnect synchronization

Realtime failure must not corrupt backend state.

---

# 30. Support Testing

Test:

* ticket creation
* assignment
* status changes
* priority
* escalation
* messages
* attachments
* internal notes
* authorization
* notifications
* realtime conversation updates
* audit requirements

---

# 31. Admin Testing

Test admin operations including:

* customer management
* restaurant approval
* restaurant suspension
* rider restriction
* order operations
* refunds
* settlements
* promotions
* review moderation
* support
* risk operations
* system configuration
* permissions
* audit logs

Sensitive admin actions must test step-up/MFA requirements where applicable.

---

# 32. Security Testing

Security testing must cover:

* authentication
* authorization
* tenant isolation
* privilege escalation
* insecure direct object references
* input validation
* rate limiting
* session security
* MFA
* step-up authentication
* file upload security
* sensitive data exposure
* API abuse
* audit logging

---

# 33. File Upload Testing

Where file uploads exist, test:

* allowed file types
* size limits
* malicious files
* invalid MIME types
* unauthorized access
* object storage permissions
* signed URL expiry where used
* filename handling
* content validation

---

# 34. Notification Security

Tests must ensure users cannot subscribe to another user's private realtime channels or receive unauthorized notifications.

---

# 35. Performance Testing

Performance testing should cover:

* API throughput
* API latency
* database behavior
* Redis behavior
* queue throughput
* worker throughput
* WebSocket connections
* dispatch load
* concurrent order creation

Performance targets should be documented before treating a test as pass/fail.

---

# 36. Load Testing

Load tests should simulate realistic workflows.

Example:

```text
Customers
→ Browse
→ Cart
→ Checkout
→ Orders
→ Restaurant processing
→ Dispatch
→ Rider delivery
```

Avoid testing only isolated HTTP endpoints when evaluating overall system behavior.

---

# 37. Regression Testing

Every production bug should result in a regression test when practical.

Regression tests should remain permanently available unless the underlying feature is intentionally removed.

---

# 38. Test Data

Test data must be:

* deterministic where possible
* isolated
* reproducible
* safe
* non-production

Do not use real customer payment credentials or unnecessary production personal data.

---

# 39. Test Users

Automated tests should use dedicated test identities.

Required representative roles:

```text
customer
restaurant owner
restaurant operator
rider
admin
super admin
```

---

# 40. Test Restaurants

Test fixtures should support:

* active restaurant
* inactive restaurant
* closed restaurant
* restaurant with menu
* restaurant with promotions
* restaurant with staff
* restaurant with earnings
* restaurant with pending application

---

# 41. Test Riders

Test fixtures should support:

* online rider
* offline rider
* available rider
* unavailable rider
* eligible rider
* ineligible rider
* restricted rider
* rider with conflicting delivery

---

# 42. Test Payment States

Test fixtures should support:

* PENDING
* AUTHORIZED
* SUCCEEDED
* FAILED
* CANCELLED
* REFUNDED
* PARTIALLY_REFUNDED

---

# 43. Test Order States

Fixtures should support every valid order state.

Tests must also include invalid and forbidden state transitions.

---

# 44. External Provider Testing

External providers must not make core automated tests unreliable.

Use:

* mocks
* stubs
* deterministic test providers
* sandbox environments

where appropriate.

Production provider credentials must never be used in ordinary automated tests.

---

# 45. Outbox Testing

Test:

* event creation in same transaction
* event processing
* retry
* duplicate delivery
* consumer idempotency
* failed delivery
* eventual processing

The system must not produce a successful business transaction while silently losing a required durable event.

---

# 46. Background Job Testing

Every critical job should test:

```text
success
failure
retry
duplicate execution
permanent failure
recovery
```

---

# 47. Database Cleanup

Tests must not leave unpredictable shared state.

Use appropriate:

* transactions
* fixtures
* isolated databases
* cleanup mechanisms

depending on test type.

---

# 48. Test Isolation

A test should not depend on the execution order of unrelated tests.

Parallel tests must be safe where the test framework supports parallel execution.

---

# 49. Flaky Tests

Flaky tests must be investigated and fixed.

Do not hide flaky tests by permanently disabling them.

Retries may be used only where the underlying operation is known to be transient and retry-safe.

---

# 50. CI Testing

CI must run appropriate checks before merge.

Minimum expected categories:

```text
lint
typecheck
unit tests
integration tests
API tests
build
security checks
migration validation
```

The exact pipeline is defined in Phase 17.

---

# 51. Pull Request Testing

A pull request affecting business logic should include tests for the changed behavior.

Critical bug fixes should include regression tests.

---

# 52. Staging Testing

Staging should provide a production-like environment sufficient to validate:

* database migrations
* workers
* queues
* realtime
* payment sandbox
* notifications
* object storage
* deployment
* critical E2E flows

---

# 53. Production Smoke Tests

After production deployment, smoke tests should verify critical functionality.

Examples:

* health endpoint
* authentication
* basic API request
* database access
* worker health
* queue health
* critical order path where safe
* monitoring

Production smoke tests must not create real financial transactions unless explicitly designed and controlled for that purpose.

---

# 54. E2E Golden Flow

The golden end-to-end test should represent:

```text
Customer
→ Restaurant Discovery
→ Cart
→ Checkout
→ Payment/COD
→ Order
→ Restaurant Accept
→ Prepare
→ Ready
→ Dispatch
→ Rider Assignment
→ Pickup
→ Delivery
→ DELIVERED
→ Review
→ Earnings
→ Settlement
```

This must remain consistent with:

`docs/flows/GOLDEN_E2E_FLOW.md`

---

# 55. Test Environment Safety

Production tests must never accidentally:

* issue real refunds
* create uncontrolled payouts
* modify production configuration
* expose customer data
* trigger large notification volumes
* create uncontrolled orders

---

# 56. Observability Testing

Tests should verify that important operations emit the expected:

* logs
* metrics
* errors
* audit records
* correlation identifiers

---

# 57. Test Coverage

Coverage metrics are useful but must not become the sole quality measurement.

High coverage with weak assertions does not constitute sufficient testing.

Critical business behavior requires meaningful tests.

---

# 58. Test Naming

Test names should describe behavior.

Prefer:

```text
customer_cannot_cancel_order_after_preparation_started
```

over:

```text
test_order_123
```

---

# 59. Test Determinism

Tests should avoid:

* real-time dependencies where unnecessary
* uncontrolled random data
* external network dependencies
* nondeterministic ordering
* shared mutable state

Time-sensitive behavior should use controllable clocks where practical.

---

# 60. Time Testing

Test:

* promotion start/end
* cancellation windows
* dispatch offer timeout
* notification expiry
* session expiry
* settlement timing
* SLA timing

Timezone behavior must be explicitly tested.

---

# 61. Security Regression

Security vulnerabilities discovered during development must become regression tests where practical.

---

# 62. Financial Regression

Any financial bug involving:

* totals
* refunds
* earnings
* settlement
* payout
* reconciliation

must receive a regression test before the fix is considered complete.

---

# 63. Dispatch Regression

Dispatch bugs should result in tests covering the specific failure scenario.

Examples:

* wrong rider selected
* duplicate assignment
* offer accepted after expiry
* restricted rider receiving offer
* rider receiving conflicting delivery

---

# 64. Risk Regression

Risk-rule bugs should produce tests covering:

* triggering condition
* non-triggering condition
* threshold boundaries
* restriction behavior
* configuration changes

---

# 65. No Test Bypass

Do not weaken production authorization, financial rules, risk rules, or business logic merely to make tests pass.

Tests must adapt to the intended architecture.

---

# 66. Claude Code Implementation Rules

Before implementing a feature:

1. Read `CLAUDE.md`.
2. Identify authoritative specifications.
3. Identify business rules.
4. Identify affected database tables.
5. Identify APIs.
6. Identify authorization requirements.
7. Identify financial/risk implications.
8. Identify notifications/realtime.
9. Write or update tests.
10. Implement.
11. Run relevant tests.
12. Run broader regression tests.
13. Review failures.
14. Update documentation if behavior changes.

---

# 67. V1 Testing Exclusions

V1 does not require:

* advanced chaos engineering
* massive distributed-system testing
* AI-generated tests as a required mechanism
* complex mutation-testing infrastructure
* multi-region disaster simulation unless infrastructure requires it
* unrealistic benchmark suites

Testing should remain proportional to the modular-monolith architecture.

---

# 68. Final Principle

**If a behavior matters in production, it must have a corresponding verification strategy.**

Critical business behavior must never rely solely on manual testing.
