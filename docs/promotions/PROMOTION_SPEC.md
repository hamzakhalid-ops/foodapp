# QuickBite — Promotion Technical Specification

**File:** `docs/promotions/PROMOTION_SPEC.md`
**Phase:** 10 — Promotions Specification
**Status:** Specification
**Architecture:** Modular Monolith V1

---

# 1. Purpose

This document defines the technical architecture for QuickBite promotions.

It covers:

* promotion domain model
* promotion lifecycle
* promotion validation
* discount calculation
* promotion usage
* concurrency
* APIs
* authorization
* database behavior
* checkout integration
* financial integration
* refunds
* risk integration
* caching
* background jobs
* analytics
* testing
* observability

---

# 2. Architecture

Promotions should be implemented as a dedicated backend module.

Recommended structure:

```text id="2m3j6t"
backend/
└── modules/
    └── promotions/
        ├── domain/
        ├── application/
        ├── infrastructure/
        ├── controllers/
        ├── services/
        ├── repositories/
        └── tests/
```

The exact folder structure should follow the backend framework conventions.

---

# 3. Promotion Module Responsibilities

The Promotion module owns:

* promotion CRUD
* promotion lifecycle
* eligibility evaluation
* discount calculation
* usage validation
* usage recording
* promotion-related reporting queries

It does not own:

* payment processing
* order lifecycle
* cancellation
* financial settlement
* risk policy

Those modules integrate with Promotions.

---

# 4. Core Entities

V1 uses:

```text id="e1knz9"
promotions
promotion_usages
```

Existing database design:

```text id="p0ukzn"
promotions
    restaurant_id
    name
    description
    type
    value
    minimum_order
    max_discount
    usage_limit
    usage_count
    start_at
    end_at
    status
```

and:

```text id="zckj1v"
promotion_usages
    promotion_id
    customer_id
    order_id
    discount_amount
    used_at
```

The final migration may add fields required by the approved promotion rules.

---

# 5. Promotion Entity

Conceptual model:

```text id="k4b3wy"
Promotion {
    id
    restaurantId
    name
    description
    code
    type
    value
    minimumOrder
    maxDiscount
    usageLimit
    usageCount
    perCustomerUsageLimit
    startAt
    endAt
    status
    createdAt
    updatedAt
}
```

The final fields must match the approved database migration.

---

# 6. Promotion Types

Enum:

```text id="jyx5g0"
PERCENTAGE
FIXED_AMOUNT
```

No other type should be implemented in V1 without specification approval.

---

# 7. Promotion Status

Recommended enum:

```text id="1m88s3"
DRAFT
ACTIVE
PAUSED
EXPIRED
DISABLED
```

A scheduled background task may update expired promotions, but eligibility evaluation must independently verify the time window.

---

# 8. Promotion Code

If codes are supported:

```text id="39n9dg"
code
```

should have:

* normalization
* validation
* uniqueness
* indexed lookup

Recommended normalization:

```text id="s7p2bd"
trim
→ uppercase
→ validate allowed characters
```

The normalized representation is used for lookup.

---

# 9. Promotion Service

Conceptual interface:

```text id="s1uf47"
PromotionService
```

Operations:

```text id="s2ct4q"
createPromotion()
updatePromotion()
activatePromotion()
pausePromotion()
disablePromotion()
getPromotion()
listPromotions()
validatePromotion()
calculateDiscount()
recordUsage()
```

---

# 10. Eligibility Service

Separate eligibility evaluation from discount calculation.

Conceptually:

```text id="9q2f1p"
PromotionEligibilityService
```

Responsibilities:

* promotion status
* time window
* restaurant
* minimum order
* usage limits
* customer usage
* risk restrictions
* supported eligibility conditions

---

# 11. Discount Calculator

Conceptually:

```text id="l2h6x9"
PromotionDiscountCalculator
```

Input:

```text id="w4gk8v"
promotion
qualifyingSubtotal
```

Output:

```text id="c5f7ko"
discountAmount
```

The calculator must not access frontend state.

---

# 12. Percentage Calculation

Conceptual:

```text id="l1r0xa"
discount = subtotal × percentage / 100
```

Then:

```text id="3j8w6x"
discount = min(discount, maxDiscount)
```

if `maxDiscount` exists.

---

# 13. Fixed Calculation

Conceptual:

```text id="2f7q0r"
discount = fixedAmount
```

Then:

```text id="p2h5nq"
discount = min(discount, qualifyingSubtotal)
```

to prevent negative qualifying subtotal.

---

# 14. Money Handling

All financial calculations use:

```text id="3gq8zq"
NUMERIC(12,2)
```

or an equivalent exact-money representation in application code.

Never use:

```text id="h9r7ak"
float
double
```

for monetary values.

---

# 15. Currency

Every financial result must carry the platform currency where required.

Promotion currency must match the order currency.

Cross-currency promotions are not supported in V1.

---

# 16. Checkout Integration

Promotion validation is part of checkout calculation.

Architecture:

```text id="l0v7i2"
Customer Cart
     ↓
Checkout API
     ↓
Load current menu data
     ↓
Calculate subtotal
     ↓
Validate promotion
     ↓
Calculate discount
     ↓
Calculate fees/tax
     ↓
Calculate total
     ↓
Risk checks
     ↓
Payment/COD validation
     ↓
Create Order
```

The exact order of risk/payment checks follows the payment and order specifications.

---

# 17. Never Trust Client Discount

Example malicious request:

```json id="k1zz6f"
{
  "subtotal": 1000,
  "discount": 999,
  "total": 1
}
```

The backend ignores client-provided financial authority.

The backend independently calculates:

```text id="s7u2dk"
subtotal
discount
fees
tax
total
```

---

# 18. Promotion Validation API

Conceptual endpoint:

```http id="b7d7ki"
POST /api/v1/promotions/validate
```

Request:

```json id="smx1yd"
{
  "restaurantId": "restaurant-id",
  "code": "QUICK200",
  "cartItems": [
    {
      "menuItemId": "item-id",
      "quantity": 2
    }
  ]
}
```

The backend should reload authoritative item prices rather than trusting client prices.

---

# 19. Validation Response

Conceptual successful response:

```json id="t8j4w5"
{
  "valid": true,
  "promotionId": "promotion-id",
  "discount": 200,
  "currency": "PKR",
  "message": "Promotion applied"
}
```

Invalid response may contain:

```json id="y9j1o3"
{
  "valid": false,
  "code": "MINIMUM_ORDER_NOT_MET",
  "message": "Minimum order amount has not been reached."
}
```

Exact response envelope follows `API_SPEC.md`.

---

# 20. Revalidation at Order Creation

A promotion validation response must never be treated as a permanent reservation.

At order creation:

```text id="1w5r6n"
validate again
```

This protects against:

* expiration
* usage exhaustion
* promotion changes
* customer usage changes
* concurrent redemption

---

# 21. Usage Concurrency

Promotion redemption is a concurrency-sensitive operation.

Suppose:

```text id="6t2n5w"
usage_limit = 100
usage_count = 99
```

Two customers attempt redemption simultaneously.

Only one should consume the final slot.

---

# 22. Transaction Strategy

A suitable implementation may use:

```text id="e5m8y0"
BEGIN
    lock promotion row
    validate status/time
    validate usage count
    validate customer usage
    calculate discount
    create order
    create promotion usage
    increment usage
COMMIT
```

The exact transaction boundaries must be coordinated with Order creation.

Avoid holding a DB transaction while waiting on external payment providers.

---

# 23. Unique Constraints

If per-customer usage is one, a database constraint may enforce:

```text id="4tw2ae"
unique(promotion_id, customer_id)
```

However, only apply this exact constraint when the business rule is one-time usage.

If the promotion supports multiple uses per customer, use a count-based transaction strategy instead.

---

# 24. Usage Count

The database may store:

```text id="q0zqpy"
usage_count
```

for efficient display.

However, the usage records remain the durable audit source.

The implementation must prevent count drift.

Periodic reconciliation may compare:

```text id="a9p9zj"
promotion.usage_count
vs
COUNT(promotion_usages)
```

---

# 25. Usage Reservation

V1 does not need a separate long-lived promotion reservation system.

A validation call does not reserve usage.

Usage is consumed during successful order creation.

This keeps V1 simpler and reduces abandoned reservation problems.

---

# 26. Promotion Usage Lifecycle

Conceptually:

```text id="y6t0o9"
Validation
    ↓
Order creation
    ↓
Promotion usage created
    ↓
Order lifecycle
```

If order creation fails:

```text id="8qj7af"
No usage
```

If order creation succeeds:

```text id="x9m5tc"
Usage recorded
```

---

# 27. Order Snapshot

The order must preserve the applied promotion.

At minimum:

```text id="2fd9kc"
promotion_id
discount
```

The final schema may also store:

```text id="k7f1vz"
promotion_code_snapshot
promotion_name_snapshot
promotion_type_snapshot
promotion_value_snapshot
```

where required for auditability.

Historical orders must not depend on the current promotion configuration.

---

# 28. Promotion Editing After Redemption

Example:

```text id="8j4qvx"
Promotion:
20% off
```

Later changed to:

```text id="4s6xkj"
10% off
```

Existing orders remain:

```text id="8x8z8e"
20% discount
```

Only future orders use the updated configuration.

---

# 29. Promotion Deactivation

If a promotion is disabled:

```text id="j7q5qz"
New redemptions
→ rejected
```

Existing orders remain unchanged.

---

# 30. Promotion Expiration Job

A background worker may periodically identify:

```text id="v2r1n6"
ACTIVE promotions
where endAt <= now
```

and mark them:

```text id="5xj1y2"
EXPIRED
```

This is an optimization.

Eligibility must still check timestamps.

---

# 31. Promotion Activation Job

If scheduled promotions are supported:

```text id="3f3o6d"
DRAFT
+
startAt reached
```

may become:

```text id="5x3l1b"
ACTIVE
```

The final lifecycle must not rely exclusively on a background job for correctness.

---

# 32. Restaurant Authorization

Promotion operations must validate:

```text id="d3b6tv"
authenticated user
→ restaurant role
→ restaurant membership
→ promotion ownership
```

A restaurant user must not access another restaurant's promotions by modifying an ID in the URL.

---

# 33. Customer Authorization

Customers may:

* validate promotions
* apply eligible promotions
* view promotions available to them

Customers cannot:

* modify promotions
* change discount values
* modify usage counts
* modify promotion status

---

# 34. Admin Authorization

Admin actions must use explicit permissions.

Potential permissions:

```text id="x0g2cr"
promotions.read
promotions.manage
promotions.disable
promotions.audit
```

Exact permissions must be consistent with the authorization specification.

---

# 35. Promotion Listing

Restaurant endpoint:

```http id="7w5q5u"
GET /api/v1/restaurants/me/promotions
```

Support:

* pagination
* status filtering
* date filtering
* sorting

The API must enforce restaurant ownership.

---

# 36. Promotion Details

Example:

```http id="p4h5u1"
GET /api/v1/promotions/:promotionId
```

Access depends on role and ownership.

Do not expose internal fields to customers.

---

# 37. Create Promotion

Example:

```http id="k7u1t2"
POST /api/v1/restaurants/me/promotions
```

Request may contain:

```json id="t3u5e7"
{
  "name": "Lunch Discount",
  "code": "LUNCH200",
  "type": "FIXED_AMOUNT",
  "value": 200,
  "minimumOrder": 1000,
  "usageLimit": 500,
  "perCustomerUsageLimit": 1,
  "startAt": "2026-01-01T00:00:00Z",
  "endAt": "2026-01-31T23:59:59Z"
}
```

Backend validates all fields.

---

# 38. Update Promotion

Example:

```http id="7m9r4k"
PATCH /api/v1/promotions/:promotionId
```

Changes must be authorized.

Financially significant changes may require stricter permission.

All changes should be audited.

---

# 39. Activate Promotion

Example:

```http id="4t6q3v"
POST /api/v1/promotions/:promotionId/activate
```

Backend verifies:

* promotion ownership
* valid configuration
* time window
* status transition

---

# 40. Pause Promotion

Example:

```http id="1t5k3e"
POST /api/v1/promotions/:promotionId/pause
```

A paused promotion cannot be redeemed.

---

# 41. Disable Promotion

Example:

```http id="u5v2n8"
POST /api/v1/promotions/:promotionId/disable
```

Disabling must not delete historical usage.

---

# 42. Customer Promotion Discovery

Possible endpoint:

```http id="p8o2h7"
GET /api/v1/restaurants/:restaurantId/promotions
```

Only promotions appropriate for customer discovery should be returned.

Sensitive administrative information must not be exposed.

---

# 43. Promotion Filtering

Customer discovery may filter promotions by:

* active
* currently valid
* restaurant
* customer eligibility where appropriate

The backend remains authoritative.

---

# 44. Caching

Promotion data may be cached for read-heavy discovery.

Do not rely on stale cache for checkout validation.

Correct pattern:

```text id="q6x8pm"
Discovery
→ cache allowed

Checkout
→ authoritative database validation
```

---

# 45. Cache Invalidation

When promotion status/configuration changes:

```text id="b2y8mm"
update database
    ↓
invalidate relevant cache
```

A cache failure must not prevent the authoritative database update.

---

# 46. Promotion Search

V1 does not require a dedicated search engine.

PostgreSQL can support:

* code lookup
* restaurant promotion lookup
* status filtering
* date filtering

Do not introduce Elasticsearch/OpenSearch solely for promotions.

---

# 47. Financial Integration

Promotion results feed into Order calculation.

Example:

```text id="c8m1y2"
Menu Prices
   ↓
Subtotal
   ↓
Promotion
   ↓
Discount
   ↓
Tax / Fees
   ↓
Total
   ↓
Payment
```

The Promotion module does not create payment records.

---

# 48. Earnings Integration

Restaurant earnings must use the final order financial snapshot.

Promotion logic should not directly mutate:

```text id="h5r2aa"
restaurant_earnings
```

Instead:

```text id="e4y7v2"
Order financial result
        ↓
Financial module
        ↓
Restaurant earnings
```

---

# 49. Refund Integration

Refund logic reads the authoritative order/payment financial state.

Promotion data helps explain the original discount but must not cause a refund greater than the amount actually paid.

---

# 50. Cancellation Integration

Cancellation Engine determines whether an order may be cancelled.

Promotion logic does not override cancellation.

Example:

```text id="m7r3j8"
Promotion applied
+
customer cancellation request
        ↓
Cancellation Rules Engine
```

---

# 51. Risk Integration

Promotion abuse signals should be emitted through the Trust & Risk Engine.

Possible event:

```text id="n8x3f2"
PROMOTION_ABUSE_SIGNAL
```

However, V1 should prefer existing risk signals where they already represent the behavior.

Avoid creating duplicate risk systems.

---

# 52. Notifications

Promotion events may emit internal events:

```text id="g4c7y2"
promotion.created
promotion.activated
promotion.paused
promotion.expired
promotion.disabled
```

Notification workers may consume relevant events.

Not every internal promotion event requires a customer notification.

---

# 53. Internal Events

Potential events:

```text id="h4u8x3"
promotion.created
promotion.updated
promotion.activated
promotion.paused
promotion.expired
promotion.disabled
promotion.redeemed
promotion.usage_reversed
```

`promotion.usage_reversed` should only exist if a future approved business rule supports restoring usage.

---

# 54. Outbox Pattern

Promotion events should use the architecture's outbox mechanism where reliable event delivery is required.

Example:

```text id="e2q9t7"
Promotion transaction
       ↓
DB transaction
       ├── promotion update
       └── outbox event
                ↓
             Worker
                ↓
        notification/analytics
```

---

# 55. Background Workers

Potential jobs:

```text id="c8j2d4"
expire promotions
refresh analytics
reconcile usage counts
cleanup temporary cache
process promotion events
```

Jobs must be:

* idempotent
* retryable
* observable

---

# 56. Promotion Reconciliation

A periodic job may verify:

```text id="d6h4y8"
usage_count
vs
promotion_usages
```

Discrepancies should be logged and handled safely.

Reconciliation must not silently rewrite historical financial records.

---

# 57. Observability

Metrics should include:

```text id="p8f3n5"
promotion.validation.success
promotion.validation.failure
promotion.redemption.success
promotion.redemption.failure
promotion.usage_limit_reached
promotion.customer_limit_reached
promotion.discount.total
promotion.provider? 
```

Do not include irrelevant provider metrics.

---

# 58. Logging

Promotion logs should include:

* request/correlation ID
* promotion ID
* restaurant ID
* customer ID where appropriate
* order ID where applicable
* action
* result
* failure code

Avoid logging unnecessary personal information.

---

# 59. Audit Logs

Audit entries should capture:

```text id="g1n4k2"
actor
action
promotion
restaurant
old state
new state
timestamp
request context
```

Use the existing `audit_logs` architecture.

---

# 60. Security Testing

Test:

* cross-restaurant promotion access
* customer modification attempts
* discount manipulation
* usage-count manipulation
* promotion ID enumeration
* unauthorized activation
* unauthorized disabling
* race conditions
* duplicate redemption
* expired promotion redemption
* future promotion redemption
* code normalization attacks
* rate-limit abuse

---

# 61. Unit Tests

Required:

* percentage calculation
* fixed discount calculation
* maximum discount
* minimum order
* expiration
* start time
* status validation
* currency validation
* rounding
* customer usage
* total usage
* code normalization

---

# 62. Integration Tests

Required:

* create promotion
* update promotion
* activate promotion
* pause promotion
* disable promotion
* validate promotion
* redeem promotion
* record usage
* restaurant authorization
* customer authorization
* database constraints

---

# 63. Concurrency Tests

Required scenario:

```text id="p1r8w4"
One remaining promotion usage
        ↓
Many simultaneous checkout attempts
        ↓
Exactly one successful redemption
```

Also test:

```text id="e9v2q1"
perCustomerUsageLimit = 1
        ↓
many simultaneous attempts by same customer
        ↓
one successful redemption
```

---

# 64. E2E Test

Golden promotion flow:

```text id="q7m3k8"
Restaurant creates promotion
        ↓
Promotion becomes active
        ↓
Customer discovers promotion
        ↓
Customer adds qualifying items
        ↓
Customer applies promotion
        ↓
Backend validates
        ↓
Checkout recalculates
        ↓
Order created
        ↓
Promotion usage recorded
        ↓
Payment succeeds
        ↓
Order delivered
        ↓
Financial records preserve discounted order
```

---

# 65. Failure E2E

Test:

```text id="r4y8m2"
Customer validates promotion
        ↓
Promotion reaches usage limit
        ↓
Customer attempts checkout
        ↓
Backend revalidates
        ↓
Order rejected from using promotion
        ↓
No promotion usage created
```

---

# 66. Historical Integrity Test

Test:

```text id="z8x2q5"
Order created with 20% promotion
        ↓
Restaurant changes promotion to 10%
        ↓
Historical order
        ↓
Still contains original 20% discount
```

---

# 67. API Error Model

Promotion errors should use the global API error format.

Potential codes:

```text id="m7d1s5"
PROMOTION_NOT_FOUND
PROMOTION_INACTIVE
PROMOTION_NOT_STARTED
PROMOTION_EXPIRED
PROMOTION_NOT_ELIGIBLE
MINIMUM_ORDER_NOT_MET
MAX_DISCOUNT_EXCEEDED
PROMOTION_USAGE_LIMIT_REACHED
CUSTOMER_USAGE_LIMIT_REACHED
PROMOTION_ALREADY_APPLIED
PROMOTION_RESTRICTED
PROMOTION_RESTAURANT_MISMATCH
INVALID_PROMOTION_CODE
```

The final code catalog belongs in `API_SPEC.md`.

---

# 68. Performance

Promotion validation should be fast enough for checkout.

Optimize:

* indexed promotion code
* restaurant ID
* status
* time window
* usage lookup
* customer usage lookup

Avoid expensive queries during every cart update.

---

# 69. Checkout Performance

Do not call external services merely to validate a normal restaurant-owned promotion unless required.

Promotion validation should normally depend on:

* PostgreSQL
* local business rules
* Trust & Risk data already available

This reduces checkout latency.

---

# 70. Transaction Safety

Promotion usage creation must be tied to successful order creation.

Avoid:

```text id="p3w7v1"
create promotion usage
    ↓
attempt order creation
    ↓
order fails
```

unless the usage is safely rolled back.

Preferred:

```text id="s2v6m8"
validate
    ↓
transaction
    ├── order
    ├── promotion usage
    └── usage count
commit
```

---

# 71. Idempotent Checkout

If order creation is retried with the same idempotency key:

```text id="v4q9m1"
existing result returned
```

No second promotion usage should be created.

---

# 72. Data Retention

Promotion records should generally be retained as long as needed for:

* order history
* financial audit
* analytics
* dispute resolution

Used promotions should not be hard-deleted.

---

# 73. V1 Scope

Included:

* restaurant-owned promotions
* percentage discount
* fixed discount
* promotion codes
* minimum order
* maximum discount
* total usage limit
* per-customer usage limit
* start/end time
* active/paused/expired/disabled lifecycle
* one promotion per order
* checkout validation
* usage recording
* financial integration
* audit
* risk integration

---

# 74. Explicit V1 Exclusions

Do not implement without a future specification:

* promotion stacking
* referral campaigns
* loyalty points
* cashback
* platform-funded promotions
* shared platform/restaurant funding
* targeted AI promotions
* personalized promotion ranking
* subscription-only promotions
* complex customer segmentation
* coupon marketplace
* influencer coupon attribution
* multi-restaurant promotion bundles
* gamified promotions

---

# 75. Implementation Order

Recommended sequence:

```text id="v8q3l6"
1. Database migration
        ↓
2. Promotion domain model
        ↓
3. Promotion CRUD
        ↓
4. Authorization
        ↓
5. Eligibility engine
        ↓
6. Discount calculator
        ↓
7. Usage/concurrency
        ↓
8. Checkout integration
        ↓
9. Financial integration
        ↓
10. Risk integration
        ↓
11. Events/outbox
        ↓
12. Notifications
        ↓
13. Analytics
        ↓
14. Testing
```

---

# 76. Architecture Consistency

Promotion implementation must remain consistent with:

```text id="1y8j7v"
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md
docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/RISK_RULES.md
docs/security/AUTH_AUTHORIZATION.md
docs/notifications/NOTIFICATION_RULES.md
docs/notifications/REALTIME_SPEC.md
docs/payments/PAYMENT_RULES.md
docs/payments/FINANCIAL_SPEC.md
docs/maps/MAPS_LOCATION_RULES.md
docs/maps/MAPS_LOCATION_SPEC.md
docs/promotions/PROMOTION_RULES.md
```

---

# 77. Claude Code Implementation Rules

Claude Code must:

* inspect all authoritative documents before implementation
* never invent promotion funding
* never invent promotion stacking
* never trust client discounts
* never trust client usage counts
* enforce restaurant tenant isolation
* enforce role permissions
* make usage concurrency-safe
* preserve historical financial values
* use exact money arithmetic
* use backend time
* use idempotency
* test race conditions
* use outbox events where required
* add observability
* avoid unnecessary infrastructure
* stop and report specification conflicts

---

# 78. Definition of Done

Promotion architecture is implementation-ready when:

* [ ] Domain model defined
* [ ] Database model defined
* [ ] Promotion lifecycle defined
* [ ] Eligibility engine defined
* [ ] Discount calculator defined
* [ ] Usage model defined
* [ ] Concurrency model defined
* [ ] APIs defined
* [ ] Authorization defined
* [ ] Checkout integration defined
* [ ] Financial integration defined
* [ ] Refund behavior defined
* [ ] Cancellation integration defined
* [ ] Risk integration defined
* [ ] Events defined
* [ ] Outbox integration defined
* [ ] Cache strategy defined
* [ ] Background jobs defined
* [ ] Observability defined
* [ ] Testing defined
* [ ] V1 exclusions documented
* [ ] Claude Code implementation rules defined

---

# 79. Final Architecture

```text id="a7c4z2"
                    ┌───────────────────┐
                    │ Customer App      │
                    └─────────┬─────────┘
                              │
                         Promotion API
                              │
                    ┌─────────▼─────────┐
                    │ Promotion Module  │
                    │                   │
                    │ Eligibility       │
                    │ Discount          │
                    │ Usage             │
                    │ Lifecycle         │
                    └──────┬─────┬──────┘
                           │     │
                  ┌────────▼─┐ ┌─▼──────────────┐
                  │PostgreSQL│ │ Redis / Cache  │
                  └──────────┘ └────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Order Module │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Payments      Risk        Financial
              │            │            │
              └────────────┼────────────┘
                           ▼
                    ┌──────────────┐
                    │ Outbox/Event │
                    └──────┬───────┘
                           │
                    ┌──────▼─────────┐
                    │ Notifications  │
                    │ Analytics      │
                    └────────────────┘
```

---

# 80. Final Principle

**A promotion is a discount rule, not a client-side price adjustment.**

The authoritative flow is:

```text
Promotion Configuration
        ↓
Eligibility
        ↓
Discount Calculation
        ↓
Order Creation
        ↓
Promotion Usage
        ↓
Payment
        ↓
Financial Records
        ↓
Settlement / Reporting
```

Every stage must preserve the original financial and promotional facts required for auditability.
