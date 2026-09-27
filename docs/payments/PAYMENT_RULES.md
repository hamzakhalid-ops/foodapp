# QuickBite — Payment Rules Specification

**File:** `docs/payments/PAYMENT_RULES.md`
**Version:** 1.0
**Status:** Specification
**Phase:** 8 — Payments & Financial Specification

---

# 1. Purpose

This document defines the business rules governing payments in QuickBite.

It covers:

* Online payments
* Cash on Delivery
* Payment authorization
* Payment capture
* Payment failures
* Payment verification
* Refunds
* Partial refunds
* Payment webhooks
* Duplicate payment prevention
* Payment idempotency
* Order/payment consistency
* Financial integrity
* Payment security
* Fraud/risk integration

The backend is the authoritative source for payment state.

The frontend must never independently determine that an order has been paid.

---

# 2. Core Financial Principles

## 2.1 Backend Authority

The backend is authoritative for:

* Payment status
* Payment amount
* Payment method
* Payment provider reference
* Refund status
* Refund amount
* Order total
* Financial records
* Restaurant earnings
* Rider earnings
* Settlements
* Payouts

Never trust client-provided:

```text
price
subtotal
discount
delivery fee
tax
service fee
total
payment success
refund status
```

---

# 3. Supported Payment Methods

V1 supports:

```text
ONLINE_PAYMENT
CASH_ON_DELIVERY
```

The payment provider abstraction must allow additional methods later without redesigning the order system.

---

# 4. Payment Lifecycle

Payment state is separate from order state.

Recommended payment states:

```text
PENDING
AUTHORIZED
SUCCEEDED
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

Example:

```text
Order:
PENDING

Payment:
PENDING
```

Later:

```text
Payment:
SUCCEEDED

Order:
PENDING
```

The restaurant may still need to accept the order.

Payment success does not automatically mean restaurant acceptance.

---

# 5. Order Total Calculation

At checkout, the backend recalculates:

```text
Subtotal
- Discount
+ Delivery Fee
+ Tax
+ Service Fee
= Total
```

The client-submitted total is informational only.

The backend must calculate the authoritative total.

---

# 6. Money Representation

All monetary values must use:

```text
NUMERIC(12,2)
```

or an equivalent exact decimal representation.

Never use:

```text
float
double
```

for financial calculations.

Currency must be explicitly stored.

Example:

```text
amount: 1250.00
currency: PKR
```

---

# 7. Currency

V1 should operate with one configured platform currency.

The currency must still be stored on financial records.

Do not assume that currency can be omitted because V1 currently supports one currency.

Future multi-currency support must not require rewriting historical financial records.

---

# 8. Online Payment Flow

Recommended flow:

```text
Customer
   ↓
Checkout
   ↓
Backend recalculates total
   ↓
Risk checks
   ↓
Create order/payment intent
   ↓
Payment provider
   ↓
Customer completes payment
   ↓
Provider callback/webhook
   ↓
Backend verifies payment
   ↓
Payment marked authoritative
   ↓
Order continues
```

The frontend callback alone is not sufficient proof of payment success.

---

# 9. Payment Intent Creation

For online payment:

```text
POST /orders
```

or the documented checkout/payment flow should create the necessary payment record.

The system must prevent creation of duplicate financial records when the customer retries the same request.

Idempotency is mandatory for payment creation.

---

# 10. Payment Idempotency

Payment creation must use an idempotency key.

Example:

```text
Idempotency-Key:
customer_checkout_abc123
```

The backend stores the idempotency result.

A repeated request with the same valid key must not create another payment.

---

# 11. Idempotency Requirements

Idempotency must protect:

* Order creation
* Payment intent creation
* Payment confirmation
* Refund creation
* Payout creation
* Settlement processing

Idempotency records must include enough information to detect conflicting reuse.

---

# 12. Payment Provider Webhooks

Provider webhooks are authoritative inputs but must still be validated.

Webhook processing must verify:

* Signature
* Provider
* Event type
* Event ID
* Amount
* Currency
* Payment reference
* Order/payment relationship

Never trust an unsigned or invalid webhook.

---

# 13. Webhook Idempotency

Provider webhook events may be delivered more than once.

Each webhook event must have a unique provider event identifier.

Example:

```text
provider_event_id
```

Repeated delivery must not:

* Create duplicate payments
* Create duplicate refunds
* Create duplicate earnings
* Trigger duplicate settlement records

---

# 14. Payment Amount Verification

When receiving a provider confirmation:

```text
Provider Amount
        =
QuickBite Expected Amount
```

must be checked.

Also verify:

```text
Provider Currency
        =
Expected Currency
```

Mismatch must cause the payment to enter an appropriate failure/review state.

---

# 15. Payment Reference Verification

The provider payment reference must map to the correct QuickBite payment.

Never accept a provider event merely because it reports successful payment.

The backend must verify:

```text
provider_payment_id
→ QuickBite payment
→ QuickBite order
→ correct customer
→ correct amount
→ correct currency
```

---

# 16. Successful Payment

A payment may transition to:

```text
SUCCEEDED
```

only after authoritative backend verification.

On success:

* Payment record is updated.
* `paid_at` is recorded.
* Order payment status is updated.
* Relevant outbox events are created.
* Notifications may be generated.
* Financial processing may proceed.

---

# 17. Payment Failure

A failed payment must not be treated as successful.

Possible reasons:

* Provider declined
* Insufficient funds
* Expired payment method
* Authentication failure
* Provider unavailable
* Invalid payment details
* Timeout
* Risk rejection

The failure reason should be stored in an appropriate safe form.

Do not expose provider secrets or internal fraud details to the customer.

---

# 18. Payment Timeout

If a payment remains unresolved:

```text
PENDING
```

for longer than the configured timeout, background processing may mark it appropriately according to provider behavior.

Do not mark a payment failed merely because the frontend timed out.

The provider must be checked where possible.

---

# 19. Cash on Delivery

For COD:

```text
payment_method = CASH_ON_DELIVERY
```

The system must not create a fake online payment success.

COD order payment remains unpaid until the delivery/payment workflow confirms collection according to the platform's financial process.

---

# 20. COD Risk

COD is integrated with the Trust & Risk Engine.

Risk signals include:

```text
COD_NON_RECEIPT
MULTIPLE_FAILED_DELIVERIES
REPEATED_ORDER_CANCELLATION
EXCESSIVE_REFUNDS
SUSPICIOUS_ORDER_PATTERN
```

Risk actions may include:

```text
NORMAL
MONITORED
COD_RESTRICTED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

Thresholds are configurable through risk rules.

---

# 21. COD Delivery Completion

The system must define an authoritative event for COD collection.

Example:

```text
Rider confirms delivery/payment collection
        ↓
Backend validates delivery
        ↓
COD payment marked appropriately
        ↓
Financial records generated
```

The rider client must not directly alter financial records.

---

# 22. Payment and Order State Separation

Payment state and order state must remain separate.

Example:

```text
Payment:
SUCCEEDED

Order:
PENDING
```

is valid.

Also:

```text
Order:
CANCELLED

Payment:
SUCCEEDED
```

may be valid temporarily until refund processing completes.

This separation is necessary for financial correctness.

---

# 23. Cancellation and Payment

Cancellation must use:

```text
docs/business-rules/CANCELLATION_RULES.md
```

and payment/refund rules defined here.

A cancellation does not automatically imply:

```text
FULL_REFUND
```

The refund outcome depends on:

* Order state
* Cancellation actor
* Reason
* Payment state
* Applicable business rules

---

# 24. Refund Outcomes

Refund outcomes:

```text
FULL_REFUND
PARTIAL_REFUND
NO_REFUND
```

The backend determines the applicable result.

---

# 25. Full Refund

A full refund means the eligible payment amount is refunded.

Example:

```text
Original payment:
1000 PKR

Refund:
1000 PKR
```

The original payment record remains unchanged.

A separate refund record is created.

---

# 26. Partial Refund

A partial refund refunds only an approved amount.

Example:

```text
Original payment:
1000 PKR

Refund:
250 PKR

Remaining paid amount:
750 PKR
```

The payment record remains the historical record of the original transaction.

---

# 27. Refund Record

Every refund must create a durable record.

Existing table:

```text
refunds
```

must store:

* Payment ID
* Order ID
* Provider refund ID
* Amount
* Reason
* Status
* Initiated by
* Timestamps

Never overwrite the original payment to represent a refund.

---

# 28. Refund Status

Recommended refund states:

```text
PENDING
PROCESSING
SUCCEEDED
FAILED
CANCELLED
```

The final implementation must keep refund state separate from payment state.

---

# 29. Refund Idempotency

Refund requests must be idempotent.

A repeated refund request must not refund the customer twice.

Before creating a refund:

```text
Existing refund
        ↓
Check amount
        ↓
Check remaining refundable amount
        ↓
Check idempotency
        ↓
Create refund
```

---

# 30. Refund Amount Validation

The system must ensure:

```text
Total Successful Refunds
+
New Refund
≤
Original Captured/Collected Amount
```

Any request exceeding the refundable amount must be rejected.

---

# 31. Multiple Refunds

Multiple partial refunds may be allowed where business rules require them.

Example:

```text
Payment = 1000

Refund #1 = 200
Refund #2 = 300

Total refunded = 500
Remaining refundable = 500
```

The backend must calculate the remaining refundable amount.

---

# 32. Refund Provider Verification

When using online payments, provider refund status must be verified.

Do not mark a refund successful solely because the internal refund request was created.

---

# 33. Payment Reconciliation

The platform must support reconciliation between:

```text
QuickBite payment records
        ↕
Payment provider records
```

Reconciliation should identify:

* Missing provider payments
* Missing QuickBite payments
* Amount mismatches
* Currency mismatches
* Duplicate transactions
* Unresolved payments
* Unresolved refunds

---

# 34. Reconciliation Jobs

Background jobs may periodically compare:

```text
Provider transactions
        ↓
QuickBite transactions
```

Discrepancies must create operational records/alerts rather than silently changing financial history.

---

# 35. Financial Immutability

Historical financial records must not be silently overwritten.

Corrections should use:

* Adjustment records
* Refund records
* Settlement adjustments
* Audit logs

Never rewrite history simply to make balances match.

---

# 36. Payment Security

Payment processing must follow secure provider integration.

QuickBite should avoid storing raw:

* Card numbers
* CVV
* Payment credentials
* Provider secrets

Use provider tokens/references where supported.

---

# 37. Sensitive Payment Information

Do not expose sensitive payment information in:

* Logs
* Push notifications
* URLs
* Analytics events
* Client storage
* Error messages

Mask sensitive references where necessary.

---

# 38. Payment Authorization

Only authorized users may access payment records.

Customer:

* Own payments/orders only.

Restaurant:

* Payments/financial data associated with authorized restaurant records.

Rider:

* Only relevant rider earnings/payment information.

Admin:

* Authorized operational/financial access.

Super Admin:

* Broader access according to permissions.

---

# 39. Payment Admin Actions

Sensitive admin payment actions must require:

* Authentication
* Authorization
* Appropriate permission
* Audit logging
* Idempotency
* Business-rule validation

Examples:

* Refund
* Manual adjustment
* Settlement adjustment
* Payout intervention

---

# 40. Manual Refunds

Admin/support may issue a manual refund only through an authorized backend workflow.

Required:

```text
order
payment
amount
reason
actor
timestamp
```

The action must be audited.

---

# 41. Payment Failure and Order Creation

The exact order behavior after payment failure must depend on payment method and configured business rules.

For online payment:

```text
Payment failed
```

must not be treated as:

```text
Payment succeeded
```

The order must not become fulfillable if business rules require successful payment before fulfillment.

---

# 42. Duplicate Orders

Repeated checkout requests must not accidentally create multiple paid orders.

Protection includes:

* Idempotency key
* Request hash
* Duplicate detection
* Payment provider reference checks
* Backend transaction locking

---

# 43. Concurrency

Payment processing must be safe under concurrent requests.

Examples:

```text
Customer taps Pay twice
```

or:

```text
Provider webhook arrives
+
Customer callback arrives
```

The backend must resolve both safely.

---

# 44. Webhook vs Client Callback

The client callback may inform the UI that payment processing returned.

It must not directly set:

```text
payment = SUCCEEDED
```

Only the trusted backend payment workflow may do so.

---

# 45. Payment Events

Recommended internal events:

```text
PAYMENT_CREATED
PAYMENT_AUTHORIZED
PAYMENT_SUCCEEDED
PAYMENT_FAILED
PAYMENT_CANCELLED
REFUND_CREATED
REFUND_SUCCEEDED
REFUND_FAILED
```

These events may trigger:

* Notifications
* Earnings processing
* Risk processing
* Reconciliation
* Audit records

---

# 46. Payment Notifications

Payment notifications must use:

```text
docs/notifications/NOTIFICATION_RULES.md
```

Examples:

```text
PAYMENT_SUCCEEDED
PAYMENT_FAILED
PAYMENT_REFUNDED
```

Notification amounts must come from authoritative payment records.

---

# 47. Risk Integration

Payment processing must integrate with:

```text
docs/business-rules/RISK_RULES.md
```

Risk checks may occur:

* Before checkout
* Before COD availability
* Before payment
* During payment anomaly detection
* During refund review

Risk controls must not be implemented as undocumented hard-coded bans.

---

# 48. Financial Audit

Important financial actions must create audit records.

Examples:

* Payment status change
* Refund
* Manual adjustment
* Settlement creation
* Settlement correction
* Payout
* Admin financial override

---

# 49. Error Codes

Payment APIs should use consistent error codes.

Examples:

```text
PAYMENT_METHOD_NOT_SUPPORTED
PAYMENT_NOT_FOUND
PAYMENT_ALREADY_PROCESSED
PAYMENT_FAILED
PAYMENT_AMOUNT_MISMATCH
PAYMENT_CURRENCY_MISMATCH
PAYMENT_PROVIDER_ERROR
PAYMENT_VERIFICATION_FAILED
REFUND_NOT_ALLOWED
REFUND_AMOUNT_INVALID
REFUND_ALREADY_PROCESSED
REFUND_LIMIT_EXCEEDED
```

Exact API contracts belong in:

```text
docs/api/API_SPEC.md
```

---

# 50. Testing Requirements

Tests must cover:

## Unit

* Total calculation
* Payment state transitions
* Refund calculation
* Refund limits
* Idempotency
* Currency validation

## Integration

* Payment provider
* Webhooks
* Refund provider
* Database transaction
* Outbox events

## E2E

```text
Customer
→ Checkout
→ Online payment
→ Payment succeeds
→ Order created/continued
→ Restaurant receives order
```

COD:

```text
Customer
→ COD checkout
→ Restaurant accepts
→ Rider delivers
→ COD collection
→ Financial records
```

Refund:

```text
Payment
→ Cancellation
→ Refund
→ Provider confirmation
→ Refund record updated
```

---

# 51. Definition of Done

Payment functionality is complete only when:

* Payment states are implemented.
* Backend calculates authoritative totals.
* Online payment is provider-backed.
* COD is separately handled.
* Webhooks are verified.
* Webhooks are idempotent.
* Payment creation is idempotent.
* Refunds are separate records.
* Refunds are idempotent.
* Refund limits are enforced.
* Currency/amount validation exists.
* Financial actions are audited.
* Risk integration exists.
* Reconciliation exists.
* Security controls exist.
* Tests exist.
* Failure handling exists.
* API documentation is updated.

---

# 52. Claude Code Implementation Rules

Claude Code must:

1. Read this document before implementing payment functionality.
2. Read `docs/database/DATABASE.md`.
3. Read `docs/api/API_SPEC.md`.
4. Read `docs/business-rules/ORDER_RULES.md`.
5. Read `docs/business-rules/CANCELLATION_RULES.md`.
6. Read `docs/business-rules/RISK_RULES.md`.
7. Read `docs/security/AUTH_AUTHORIZATION.md`.
8. Never trust frontend payment success.
9. Never trust frontend totals.
10. Verify payment provider webhooks.
11. Use idempotency for financial operations.
12. Never overwrite historical financial records.
13. Never store raw sensitive payment credentials unnecessarily.
14. Audit financial admin actions.
15. Use exact decimal arithmetic.
16. Add tests for every financial transition.
17. Ask for clarification if financial requirements conflict.
18. Never silently change financial rules.

---

# 53. Phase 8 Payment Rules Completion

The payment specification is complete when:

```text
Checkout
+
Payment
+
COD
+
Webhook
+
Refund
+
Risk
+
Security
+
Idempotency
+
Reconciliation
+
Audit
+
Testing
```

are explicitly defined.
