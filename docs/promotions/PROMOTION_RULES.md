# QuickBite — Promotion Rules

**File:** `docs/promotions/PROMOTION_RULES.md`
**Phase:** 10 — Promotions Specification
**Status:** Specification
**Authority:** Product + Business Rules + Financial Rules

---

# 1. Purpose

This document defines the business rules governing promotions and discounts in QuickBite.

Promotions may affect:

* customer checkout
* restaurant orders
* order totals
* payment amounts
* refunds
* restaurant earnings
* platform revenue
* reporting
* customer usage limits
* risk controls

Promotion rules must therefore be centralized and backend-authoritative.

---

# 2. Promotion Authority

The backend is authoritative for:

* promotion validity
* promotion eligibility
* promotion status
* promotion start/end time
* usage limits
* customer usage
* minimum order requirements
* discount amount
* maximum discount
* final order discount
* promotion redemption
* promotion usage records
* promotion reversal where applicable

The client must never determine the final discount.

---

# 3. V1 Promotion Model

QuickBite V1 supports restaurant-owned promotions.

A promotion belongs to one restaurant:

```text
Promotion
    ↓
Restaurant
```

The promotion may be used only when ordering from that restaurant.

V1 does not support multi-restaurant carts.

---

# 4. Supported Promotion Types

V1 supports:

```text
PERCENTAGE
FIXED_AMOUNT
```

## PERCENTAGE

Example:

```text
20% off
```

## FIXED_AMOUNT

Example:

```text
Rs. 200 off
```

The exact currency is determined by platform configuration.

---

# 5. Promotion Fields

A promotion should support:

* name
* description
* restaurant
* type
* value
* minimum order amount
* maximum discount
* usage limit
* per-customer usage limit
* start time
* end time
* status
* eligibility conditions
* creation timestamp
* update timestamp

The final database schema must remain consistent with `DATABASE.md`.

---

# 6. Promotion Status

Promotion status should support at least:

```text
DRAFT
ACTIVE
PAUSED
EXPIRED
DISABLED
```

The exact persisted enum may be finalized during implementation.

A promotion is usable only when all required conditions are satisfied.

---

# 7. Active Promotion Requirements

A promotion must satisfy:

```text
status = ACTIVE
AND
current time >= start time
AND
current time < end time
AND
restaurant is eligible
AND
promotion conditions are satisfied
AND
usage limits are not exceeded
```

---

# 8. Expiration

A promotion becomes unusable after its configured end time.

The backend must evaluate the current time.

The client must not decide whether a promotion is expired.

A background job may update the stored status to `EXPIRED`, but business validation must not depend exclusively on that job.

---

# 9. Start Time

A promotion cannot be redeemed before its configured start time.

Backend time is authoritative.

---

# 10. Restaurant Ownership

A restaurant may create and manage promotions belonging to itself.

A restaurant must not be able to:

* create promotions for another restaurant
* modify another restaurant's promotions
* view private promotion data belonging to another restaurant
* redeem another restaurant's promotion against its own orders

Tenant isolation is mandatory.

---

# 11. Restaurant Owner vs Operator

Restaurant Owner and Restaurant Operator permissions must follow:

```text
docs/security/AUTH_AUTHORIZATION.md
```

Promotion management may be granted to the appropriate restaurant role.

Sensitive financial permissions remain separate from promotion-management permissions.

---

# 12. Promotion Code

V1 may use a customer-entered promotion code.

Example:

```text
QUICK200
```

Codes must be normalized consistently.

Recommended normalization:

* trim whitespace
* normalize case
* reject invalid characters according to configured rules

The final code format must be documented before implementation.

---

# 13. Code Uniqueness

Promotion codes must have a uniqueness rule.

At minimum, a code must not ambiguously resolve to multiple active promotions for the same applicable context.

The database should enforce uniqueness where appropriate.

---

# 14. Promotion Eligibility

Eligibility must be calculated by the backend.

Possible conditions include:

* restaurant
* promotion status
* time window
* minimum order
* maximum discount
* usage limit
* customer usage limit
* customer eligibility
* risk restrictions
* other explicitly configured conditions

Do not implement unsupported eligibility conditions merely because the schema could support them.

---

# 15. Minimum Order

A promotion may define:

```text
minimum_order_amount
```

The backend compares the qualifying order amount against this value.

The frontend may display the requirement but cannot override it.

---

# 16. Qualifying Amount

The promotion engine must clearly distinguish:

```text
item subtotal
delivery fee
tax
service fee
discount
total
```

Unless explicitly configured otherwise, the minimum-order condition applies to the qualifying food-item subtotal rather than the final amount including unrelated fees.

The exact qualifying base must be consistently implemented.

---

# 17. Percentage Discount

For:

```text
type = PERCENTAGE
```

the preliminary discount is:

```text
subtotal × percentage / 100
```

Then apply any configured maximum discount.

Example:

```text
Subtotal = 1,000
Promotion = 20%
Calculated discount = 200
```

---

# 18. Maximum Discount

A percentage promotion may define:

```text
max_discount
```

Example:

```text
20% off
Maximum discount = Rs. 300
```

For:

```text
Subtotal = Rs. 2,000
```

20% would produce Rs. 400, but the discount becomes:

```text
Rs. 300
```

---

# 19. Fixed Discount

For:

```text
type = FIXED_AMOUNT
```

the discount is the configured fixed amount subject to eligibility and order constraints.

The discount must never exceed the qualifying amount unless the promotion model explicitly allows such behavior.

V1 should prevent a promotion from creating a negative subtotal.

---

# 20. Discount Calculation

The canonical calculation is:

```text
Subtotal
- Promotion Discount
= Discounted Subtotal

Discounted Subtotal
+ Delivery Fee
+ Tax
+ Service Fee
= Order Total
```

The exact tax/fee treatment must remain consistent with:

```text
docs/payments/PAYMENT_RULES.md
docs/payments/FINANCIAL_SPEC.md
```

---

# 21. Backend Recalculation

At checkout:

```text
Client submits cart + promotion code
        ↓
Backend reloads menu data
        ↓
Backend validates items
        ↓
Backend recalculates subtotal
        ↓
Backend validates promotion
        ↓
Backend calculates discount
        ↓
Backend calculates fees/tax
        ↓
Backend calculates final total
```

Client-submitted discount values must be ignored for authority purposes.

---

# 22. Promotion Validation Endpoint

The customer may request promotion validation before checkout.

Example:

```text
POST /api/v1/promotions/validate
```

The response is informational.

A successful validation does not permanently reserve the promotion unless the promotion system explicitly implements reservation.

The promotion must be revalidated during order creation.

---

# 23. Promotion Application

A customer may apply a promotion to the cart.

The cart may store the selected promotion identifier/code for UI purposes.

However, the backend must revalidate it when creating the order.

---

# 24. One Promotion Per Order

V1 supports:

```text
maximum 1 promotion per order
```

Promotion stacking is not supported unless explicitly added in a future specification.

The backend must reject attempts to combine multiple promotions.

---

# 25. Promotion Stacking

V1:

```text
Promotion A + Promotion B
        ↓
NOT ALLOWED
```

This avoids ambiguity around:

* discount ordering
* maximum discounts
* financial attribution
* refunds

Future stacking requires a separate business-rule change.

---

# 26. Usage Limits

A promotion may define:

```text
usage_limit
```

This represents the maximum number of successful redemptions.

Usage must be tracked using:

```text
promotion_usages
```

---

# 27. Customer Usage Limit

A promotion may also define:

```text
per_customer_usage_limit
```

Example:

```text
Maximum total uses = 10,000
Per customer = 1
```

The backend checks both limits.

---

# 28. Usage Counting

A promotion usage should represent a successfully created/eligible redemption according to the promotion lifecycle.

The system must define exactly when usage becomes consumed.

Recommended V1 behavior:

```text
Order successfully created with promotion
        ↓
Promotion usage recorded
```

Failed checkout attempts must not consume usage.

---

# 29. Concurrency

Promotion usage limits must be concurrency-safe.

Example:

```text
Remaining uses = 1

Customer A checks promotion
Customer B checks promotion
Customer A submits
Customer B submits
```

The backend must prevent both orders from consuming the final available usage.

Use appropriate:

* database transactions
* row locking
* atomic counters
* unique constraints

depending on implementation.

---

# 30. Idempotency

Order creation must use the platform's standard idempotency mechanism.

If the same checkout request is retried:

```text
same idempotency key
        ↓
same logical order
        ↓
promotion consumed once
```

A retry must not create multiple promotion usages.

---

# 31. Promotion Usage Record

`promotion_usages` should contain:

```text
promotion_id
customer_id
order_id
discount_amount
used_at
```

The order reference provides traceability.

---

# 32. Cancelled Orders

Promotion treatment after cancellation depends on the cancellation and refund outcome.

The system must distinguish:

```text
promotion redeemed
promotion financially applied
order cancelled
refund issued
promotion restored or consumed
```

V1 should define a consistent policy.

Recommended default:

* promotion usage remains recorded for audit
* cancelled order does not silently create duplicate usage
* a future promotional re-credit mechanism may be introduced explicitly

---

# 33. Refunds

Promotion discounts are not normally refunded as cash because the customer did not pay the discounted amount.

Example:

```text
Subtotal = 1,000
Discount = 200
Customer pays = 800
```

A full refund of the paid amount is:

```text
800
```

not:

```text
1,000
```

unless a specific financial rule explicitly requires otherwise.

---

# 34. Partial Refunds

Partial refunds must use the actual paid amount and financial rules.

Promotion discount must not accidentally become refundable cash.

Refund calculations must remain consistent with:

```text
docs/payments/PAYMENT_RULES.md
docs/payments/FINANCIAL_SPEC.md
```

---

# 35. Restaurant Earnings

Promotion discounts may affect the restaurant's financial outcome depending on promotion funding.

V1 must explicitly distinguish promotion funding.

Recommended V1 model:

```text
Restaurant-funded promotion
```

If QuickBite later subsidizes promotions, platform-funded discounts must be represented separately.

---

# 36. Promotion Funding

Promotion funding should not be inferred from the discount itself.

A future model may support:

```text
RESTAURANT
PLATFORM
SHARED
```

V1 should implement only the approved funding model.

Financial allocation must be documented before platform-funded promotions are introduced.

---

# 37. Platform Revenue

A promotion must not cause incorrect reporting of:

* gross order value
* customer payment
* restaurant earnings
* platform commission
* platform revenue

The financial system must preserve the relevant amounts separately.

---

# 38. Commission Interaction

The commission calculation must explicitly define whether commission applies to:

* gross subtotal
* discounted subtotal
* another configured base

The selected rule must be consistent across all orders.

It must not be guessed by individual developers.

The final implementation should use the financial configuration defined in:

```text
docs/payments/FINANCIAL_SPEC.md
```

---

# 39. Restaurant Promotion Visibility

Customers may see promotions through:

* restaurant page
* menu
* promotion section
* search/discovery
* checkout

Visibility does not mean eligibility.

The backend must validate eligibility when the promotion is applied.

---

# 40. Restaurant Promotion Management

Restaurant users may:

* create promotion
* view promotion
* edit promotion
* pause promotion
* activate promotion
* view usage
* view expired promotions

Permissions are controlled by restaurant role.

---

# 41. Promotion Editing

Editing an active promotion can affect customers currently viewing or preparing to checkout.

Therefore:

* backend always uses current valid configuration
* promotion must be revalidated at checkout
* changes must be auditable

Financially significant changes should be restricted according to permissions.

---

# 42. Promotion Immutability

Historical orders must not change because a promotion was later edited.

The order must preserve:

* promotion reference
* discount amount
* final total
* relevant financial snapshot

Historical financial records must remain auditable.

---

# 43. Promotion Deletion

Promotions should generally not be hard-deleted once they have been used.

Use status changes such as:

```text
DISABLED
EXPIRED
```

Historical usage must remain available.

---

# 44. Restaurant Closure

If a restaurant becomes:

```text
OFFLINE
TEMPORARILY_PAUSED
CLOSED
SUSPENDED
```

its promotions must not make the restaurant orderable.

Promotion eligibility does not override restaurant availability.

---

# 45. Risk Integration

The Trust & Risk Engine may restrict promotion usage where abuse is detected.

Possible signals:

* excessive promotion abuse
* repeated cancellation after promotion use
* suspicious account patterns
* repeated false complaints

Risk actions should remain proportional.

A promotion restriction should not automatically imply account termination.

---

# 46. Customer Eligibility

V1 may support general customer eligibility.

Future versions may support:

* first-order promotions
* new-customer promotions
* targeted customer groups
* referral promotions
* geographic promotions

These require explicit business rules before implementation.

---

# 47. First-Order Promotions

If first-order promotions are introduced, the backend must determine whether the customer has previously completed/placed qualifying orders.

Do not rely on:

```text
order count on frontend
```

or client state.

The exact definition of "first order" must be documented before implementation.

---

# 48. Promotion Abuse Prevention

Potential abuse signals include:

* repeated account creation
* repeated promotion use
* abnormal order cancellation
* repeated refunds
* suspicious payment patterns
* suspicious device/account relationships where supported

These signals feed the Trust & Risk Engine.

Promotions should not create an independent hard-coded fraud system.

---

# 49. Customer Experience

The client should clearly communicate:

* promotion code
* discount
* eligibility state
* minimum order
* maximum discount
* expiration where applicable
* why a promotion is invalid

Do not expose sensitive risk-engine details.

---

# 50. Invalid Promotion Reasons

Useful user-facing categories:

```text
PROMOTION_NOT_FOUND
PROMOTION_EXPIRED
PROMOTION_NOT_STARTED
PROMOTION_INACTIVE
PROMOTION_NOT_ELIGIBLE
MINIMUM_ORDER_NOT_MET
PROMOTION_USAGE_LIMIT_REACHED
CUSTOMER_USAGE_LIMIT_REACHED
PROMOTION_NOT_APPLICABLE_TO_RESTAURANT
PROMOTION_RESTRICTED
```

The exact API error code mapping belongs in `API_SPEC.md`.

---

# 51. Time Zones

Promotion timestamps must use timezone-aware values.

The backend stores timestamps consistently according to the platform's UTC storage standard.

Promotion display may be converted to the customer's or restaurant's applicable timezone.

Do not use device-local time for eligibility.

---

# 52. Currency

Promotion monetary values must use the platform's configured currency.

Money must use:

```text
NUMERIC(12,2)
```

Never use floating-point types for financial values.

---

# 53. Rounding

Discount calculations must use the platform's defined monetary rounding rules.

Rounding must occur consistently.

Do not allow different apps to calculate slightly different discounts.

---

# 54. Audit

Promotion actions that should be auditable include:

* create
* activate
* pause
* edit
* disable
* administrative override
* promotion configuration changes

Audit records should identify:

* actor
* restaurant
* promotion
* action
* previous state
* new state
* timestamp

---

# 55. Administrative Override

Admins may have controlled ability to:

* disable promotion
* correct configuration
* investigate usage
* resolve operational issues

Admin overrides must:

* require permission
* be audited
* preserve historical records
* not silently rewrite financial history

---

# 56. Notifications

Promotion-related notifications may include:

* promotion activated
* promotion ending soon
* promotion disabled
* restaurant promotion updates

V1 should avoid excessive promotional messaging.

Customer notification preferences apply where relevant.

---

# 57. Analytics

Promotion analytics may include:

* redemptions
* discount amount
* eligible orders
* average order value
* promotion cost
* usage rate
* cancellation rate
* restaurant-level performance

Analytics must distinguish descriptive metrics from financial truth.

Financial reporting remains authoritative in the financial module.

---

# 58. Security

Promotion endpoints must enforce:

* authentication
* authorization
* tenant isolation
* input validation
* rate limiting
* idempotency where applicable
* audit logging
* backend recalculation

Never trust:

* client discount amount
* client promotion status
* client usage count
* client eligibility

---

# 59. Definition of Done

Promotion functionality is complete only when:

* [ ] Promotion types are implemented
* [ ] Promotion lifecycle is implemented
* [ ] Restaurant ownership is enforced
* [ ] Eligibility is backend-authoritative
* [ ] Minimum order is validated
* [ ] Maximum discount is enforced
* [ ] Usage limits are concurrency-safe
* [ ] Customer usage limits are enforced
* [ ] One promotion per order is enforced
* [ ] Promotion usage is recorded
* [ ] Checkout recalculates discount
* [ ] Order snapshot preserves discount
* [ ] Refund behavior is correct
* [ ] Financial effects are traceable
* [ ] Risk integration exists
* [ ] Audit logging exists
* [ ] Permissions are enforced
* [ ] Tests cover concurrency and failure cases

---

# 60. Claude Code Rules

Before implementing promotions:

1. Read `PRD.md`.
2. Read `DATABASE.md`.
3. Read `API_SPEC.md`.
4. Read `ORDER_RULES.md`.
5. Read `CANCELLATION_RULES.md`.
6. Read `RISK_RULES.md`.
7. Read `PAYMENT_RULES.md`.
8. Read `FINANCIAL_SPEC.md`.
9. Read `AUTH_AUTHORIZATION.md`.
10. Read `PROMOTION_RULES.md`.
11. Read `PROMOTION_SPEC.md`.
12. Do not invent funding, stacking, eligibility, or commission behavior.
13. Do not trust client discount values.
14. Do not modify historical financial records when a promotion changes.
15. Add unit, integration, concurrency, and E2E tests.
16. Stop and report conflicts instead of silently changing the specification.
