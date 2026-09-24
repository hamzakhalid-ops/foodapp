# QuickBite — Financial Specification

**File:** `docs/payments/FINANCIAL_SPEC.md`
**Version:** 1.0
**Status:** Specification
**Phase:** 8 — Payments & Financial Specification

---

# 1. Purpose

This document defines QuickBite's financial architecture after payment processing.

It covers:

* Restaurant earnings
* Rider earnings
* Platform commission
* Platform fees
* Taxes/adjustments
* Refund adjustments
* Settlements
* Settlement periods
* Settlement items
* Payouts
* Invoices
* Financial reconciliation
* Financial reporting
* Adjustments
* Financial auditability

The objective is to ensure that every monetary movement can be traced from:

```text
Order
→ Payment
→ Earnings
→ Settlement
→ Payout
```

---

# 2. Financial Architecture

The financial flow is:

```text
Customer Order
      ↓
Order Total
      ↓
Payment / COD
      ↓
Financial Allocation
      ↓
Restaurant Earnings
      +
Rider Earnings
      +
Platform Fees/Commission
      ↓
Settlement
      ↓
Payout
      ↓
Invoice / Financial Record
```

Every stage must be traceable.

---

# 3. Financial Authority

The backend is authoritative for:

* Order totals
* Payment amounts
* Refunds
* Commission
* Fees
* Restaurant earnings
* Rider earnings
* Settlement totals
* Payout totals
* Financial adjustments

Frontend values are never authoritative.

---

# 4. Financial Record Principles

Financial records must be:

* Durable
* Traceable
* Auditable
* Idempotent
* Consistent
* Reproducible
* Protected by authorization

Historical records must not be silently rewritten.

---

# 5. Order Financial Snapshot

At order creation, the backend stores:

```text
subtotal
discount
delivery_fee
tax
service_fee
total
currency
```

This creates the authoritative financial snapshot for that order.

Menu prices may change later without changing the historical order.

---

# 6. Order Item Price Snapshot

Each order item stores:

```text
item_name
unit_price
quantity
subtotal
```

Variations and add-ons also store their historical names and prices.

This ensures historical financial calculations remain reproducible.

---

# 7. Restaurant Earnings

Restaurant earnings are stored in:

```text
restaurant_earnings
```

Recommended fields:

```text
restaurant_id
order_id
gross_amount
commission_amount
fee_amount
refund_amount
net_amount
currency
status
created_at
```

---

# 8. Restaurant Gross Amount

Gross restaurant earnings should be calculated according to the configured financial rules.

A common V1 model:

```text
Eligible Order Revenue
-
Restaurant-funded Adjustments
=
Restaurant Gross Eligible Amount
```

The exact components must be explicitly configured rather than hard-coded inside frontend code.

---

# 9. Platform Commission

Platform commission may be calculated from eligible order revenue.

Example:

```text
Eligible Revenue = 1000
Commission Rate = 20%

Commission = 200
```

The exact commission rate must be configurable.

Do not hard-code:

```text
20%
```

into application business logic.

---

# 10. Commission Configuration

Commission configuration should support future flexibility.

Possible dimensions:

```text
restaurant
restaurant category
promotion
order type
effective date
```

V1 may begin with a simpler platform-level or restaurant-level configuration.

The design must allow expansion later.

---

# 11. Commission Calculation

Commission calculations must use exact decimal arithmetic.

Example:

```text
Eligible revenue:
1000.00

Commission:
200.00

Restaurant net before other adjustments:
800.00
```

All calculation inputs must be recorded or reconstructable.

---

# 12. Platform Fees

Platform fees may include:

* Service fees
* Processing-related fees where applicable
* Other configured platform charges

Each fee must have a clear business definition.

Do not combine unrelated fees into one undocumented number.

---

# 13. Delivery Fee

Delivery fees are part of the order financial model.

The backend calculates:

```text
delivery_fee
```

based on configured business rules.

The rider earning may or may not equal the customer delivery fee.

These are separate financial concepts.

---

# 14. Rider Earnings

Rider earnings are stored in:

```text
rider_earnings
```

Recommended fields:

```text
rider_id
delivery_id
base_amount
bonus_amount
adjustment_amount
total_amount
currency
status
created_at
```

---

# 15. Rider Earning Calculation

Example:

```text
Base delivery earning
+
Bonus
+
Approved adjustment
=
Rider total earning
```

Do not automatically assume:

```text
Customer delivery fee = Rider earning
```

unless the configured business rule explicitly states this.

---

# 16. Rider Bonuses

Bonuses may be introduced through configurable rules.

Examples:

* Delivery bonus
* Peak-time bonus
* Zone incentive
* Campaign bonus

V1 may keep bonus logic simple.

All bonuses must be traceable.

---

# 17. Financial Adjustments

Adjustments may be required for:

* Manual correction
* Refund allocation
* Customer compensation
* Restaurant compensation
* Rider compensation
* Operational error
* Settlement correction

Adjustments must be explicit records.

Do not silently modify original earnings.

---

# 18. Financial Adjustment Requirements

Each manual adjustment should include:

```text
entity
amount
currency
reason
created_by
created_at
reference
```

Admin-created financial adjustments must be audited.

---

# 19. Restaurant Earnings Lifecycle

Recommended statuses:

```text
PENDING
AVAILABLE
IN_SETTLEMENT
SETTLED
ADJUSTED
```

The exact implementation may use a smaller state model, but transitions must be explicit.

---

# 20. Rider Earnings Lifecycle

Recommended statuses:

```text
PENDING
AVAILABLE
IN_SETTLEMENT
SETTLED
ADJUSTED
```

A rider earning should not become available before the underlying delivery is financially eligible.

---

# 21. Earnings Eligibility

Restaurant earnings generally become eligible after the relevant order is successfully completed.

Example:

```text
Order:
DELIVERED
        ↓
Financial eligibility check
        ↓
Restaurant earning created
```

Refunds/cancellations may modify the eventual settlement.

---

# 22. Rider Earnings Eligibility

Rider earnings become eligible after the delivery reaches the required completed state.

Example:

```text
Delivery:
DELIVERED
        ↓
Rider earning generated
```

Failed or cancelled deliveries follow configured business rules.

---

# 23. Cancellation Financial Effects

Cancellation can affect:

* Customer payment
* Refund
* Restaurant earnings
* Rider earnings
* Platform revenue

The system must not assume cancellation means all financial records become zero.

The financial result depends on:

```text
order state
cancellation actor
reason
payment state
delivery state
applicable cancellation rule
```

---

# 24. Refund Financial Effects

A refund must flow into financial accounting.

Example:

```text
Original payment
      ↓
Refund
      ↓
Customer financial adjustment
      ↓
Restaurant/platform earning adjustment
      ↓
Settlement impact
```

The exact allocation must follow documented financial rules.

---

# 25. Settlement

A settlement groups eligible financial records for a recipient over a defined period.

Existing table:

```text
settlements
```

Recipient types:

```text
RESTAURANT
RIDER
```

---

# 26. Settlement Period

A settlement contains:

```text
period_start
period_end
```

The period must use a clearly defined timezone/business calendar.

Internally stored timestamps remain UTC.

---

# 27. Settlement Status

Recommended:

```text
PENDING
PROCESSING
COMPLETED
FAILED
CANCELLED
```

A settlement must not be marked completed before the underlying settlement process succeeds.

---

# 28. Settlement Calculation

Settlement:

```text
Gross
-
Fees
+
Adjustments
-
Refund Adjustments
=
Net
```

The exact financial components must be represented explicitly.

Do not rely on one opaque balance number.

---

# 29. Settlement Items

Every settlement must have traceable items.

Existing:

```text
settlement_items
```

Each item should reference the source:

```text
order
earning
adjustment
refund
other documented financial source
```

This enables settlement reconciliation.

---

# 30. Settlement Immutability

Once a settlement is finalized:

* Do not silently change historical amounts.
* Do not delete settlement items.
* Do not overwrite completed settlement history.

Corrections should use adjustment mechanisms.

---

# 31. Settlement Generation

Settlement generation may run as a background job.

Flow:

```text
Eligible Earnings
        ↓
Settlement Period
        ↓
Collect Eligible Records
        ↓
Calculate
        ↓
Validate
        ↓
Create Settlement
        ↓
Create Settlement Items
        ↓
Audit
```

---

# 32. Settlement Idempotency

Running settlement generation twice must not duplicate financial records.

The system must prevent:

```text
Same earning
→ Settlement A
+
Settlement B
```

unless the business rules explicitly permit it.

A source financial record should have a clear settlement relationship.

---

# 33. Settlement Reconciliation

Before completing settlement:

```text
Sum(Settlement Items)
=
Settlement Gross/Net Calculation
```

must be verified.

Any mismatch should prevent automatic completion and create an operational alert.

---

# 34. Payout

A payout transfers settlement funds to the recipient.

Existing:

```text
payouts
```

stores:

```text
settlement_id
recipient_type
recipient_id
provider
provider_reference
amount
status
initiated_at
completed_at
```

---

# 35. Payout Status

Recommended:

```text
PENDING
PROCESSING
COMPLETED
FAILED
CANCELLED
```

---

# 36. Payout Flow

```text
Settlement
    ↓
Eligible for payout
    ↓
Payout created
    ↓
Provider
    ↓
Provider confirmation
    ↓
Payout completed
```

Provider confirmation must be verified.

---

# 37. Payout Idempotency

A payout request must be idempotent.

Repeated requests must not transfer funds twice.

Use:

```text
idempotency key
settlement ID
provider reference
```

where appropriate.

---

# 38. Payout Failure

If payout fails:

```text
Settlement
    ↓
Payout FAILED
```

The settlement must not be silently deleted.

The system may retry or create a new payout attempt according to configured business rules.

Financial history must remain traceable.

---

# 39. Payout Provider

Payout provider integration must use an abstraction.

Example:

```text
PayoutService
      ↓
PayoutProvider
      ↓
Provider implementation
```

Provider-specific details must not leak into core financial business logic.

---

# 40. Bank/Payment Account Data

Restaurant and rider payout destinations must be protected.

Store provider references where possible rather than raw sensitive credentials.

Sensitive payment-account changes require:

* Authentication
* Authorization
* Validation
* Audit logging
* Potential step-up authentication

---

# 41. Restaurant Financial Access

Restaurant Owner:

* Financial overview
* Earnings
* Transactions
* Settlements
* Payout history
* Invoices

Restaurant Operator:

* Financial access only if explicitly granted by permission.

The frontend may hide financial screens, but backend authorization is mandatory.

---

# 42. Rider Financial Access

Riders may access:

* Own earnings
* Own transactions
* Own settlements
* Own payout history

They must not access another rider's financial records.

---

# 43. Admin Financial Access

Admin access is permission-based.

Examples:

```text
financial.read
financial.refund
financial.adjust
settlement.read
settlement.process
payout.read
payout.process
```

Exact permission naming belongs to the authorization specification.

---

# 44. Invoice Generation

Existing:

```text
invoices
```

may represent financial documents associated with settlements.

Invoice fields include:

```text
recipient
settlement
invoice_number
file_url
amount
status
issued_at
created_at
```

---

# 45. Invoice Numbering

Invoice numbers must be:

* Unique
* Deterministic
* Auditable
* Generated by the backend

Do not allow clients to provide invoice numbers.

---

# 46. Invoice Immutability

Issued invoices should not be silently edited.

Corrections should use:

* Credit/adjustment mechanisms
* Replacement documents where legally required
* Audit history

The exact tax/legal behavior must follow the applicable jurisdiction and business requirements.

---

# 47. Financial Reporting

The platform should support reporting for:

### Platform

* Gross order value
* Platform revenue
* Commission
* Fees
* Refunds
* Adjustments
* Settlement totals
* Payout totals

### Restaurant

* Sales
* Commission
* Fees
* Refunds
* Net earnings
* Settlements
* Payouts

### Rider

* Deliveries
* Base earnings
* Bonuses
* Adjustments
* Net earnings
* Settlements
* Payouts

---

# 48. Gross Order Value

The platform should distinguish:

```text
Order Total
```

from:

```text
Platform Revenue
```

They are not necessarily the same.

---

# 49. Financial Terminology

Use precise terminology.

Examples:

```text
Order Total
Payment Amount
Refund Amount
Gross Earnings
Commission
Platform Fee
Adjustment
Net Earnings
Settlement
Payout
```

Do not use a generic term such as:

```text
balance
```

when the actual financial meaning is ambiguous.

---

# 50. Reconciliation Layers

QuickBite should support reconciliation across:

```text
Order
   ↓
Payment
   ↓
Earnings
   ↓
Settlement
   ↓
Payout
```

Each layer should be independently verifiable.

---

# 51. Financial Reconciliation Checks

Examples:

```text
Payment amount = order payment amount
```

```text
Refund total ≤ successful payment
```

```text
Settlement item total = settlement calculation
```

```text
Payout amount = payout settlement amount
```

```text
Payout provider reference matches payout record
```

---

# 52. Financial Invariants

The system must enforce invariants.

Examples:

### Refund

```text
Total refunds ≤ successful payment amount
```

### Settlement

```text
Settlement net =
calculated financial components
```

### Payout

```text
Payout amount =
approved settlement amount
```

### Earnings

```text
Earnings must reference valid source transactions.
```

---

# 53. Negative Balances

The system must explicitly define whether negative balances are permitted.

If adjustments can exceed current earnings, the financial ledger/balance model must handle this deliberately.

Do not allow negative values accidentally because of arithmetic bugs.

---

# 54. Financial Ledger Consideration

V1 may use the existing:

```text
restaurant_earnings
rider_earnings
settlements
settlement_items
payouts
refunds
```

model.

If implementation complexity grows, a dedicated double-entry ledger may be introduced through an ADR.

Do not introduce a complex accounting ledger without a documented need.

---

# 55. Financial Event Model

Recommended events:

```text
EARNING_CREATED
EARNING_ADJUSTED

SETTLEMENT_CREATED
SETTLEMENT_PROCESSING
SETTLEMENT_COMPLETED
SETTLEMENT_FAILED

PAYOUT_CREATED
PAYOUT_COMPLETED
PAYOUT_FAILED

INVOICE_CREATED
```

These events may trigger:

* Notifications
* Reports
* Audit records
* Reconciliation

---

# 56. Background Financial Jobs

Background workers may perform:

* Settlement generation
* Settlement reconciliation
* Payout processing
* Provider reconciliation
* Invoice generation
* Financial report generation
* Failed payout retry
* Unresolved payment reconciliation

Workers must be idempotent.

---

# 57. Financial Job Safety

A background job may execute more than once.

Therefore every financial worker must be safe under:

```text
retry
duplicate execution
worker crash
process restart
network timeout
provider timeout
```

---

# 58. Financial Audit

Financial audit logs should capture:

```text
actor
action
entity
entity_id
old_values
new_values
reason
timestamp
request/correlation ID
```

Especially important for:

* Refunds
* Manual adjustments
* Settlement changes
* Payout intervention
* Financial configuration changes

---

# 59. Financial Configuration

Financial business rules must be configurable.

Examples:

```text
commission rate
platform fee
settlement frequency
payout schedule
minimum payout threshold
```

Do not hard-code business rates in frontend or scattered backend code.

---

# 60. Effective Dates

Financial configurations should support effective dates when required.

Example:

```text
Commission:
10%
effective:
2026-01-01

Commission:
12%
effective:
2026-07-01
```

Historical orders must continue using the financial rules applicable to their transaction period.

---

# 61. Financial Configuration Security

Only authorized administrators may modify financial configuration.

Sensitive configuration changes require:

* Authorization
* Audit log
* Actor identification
* Previous value
* New value
* Reason where appropriate

---

# 62. Tax Handling

Tax must remain a distinct financial component.

The platform must not assume a universal tax rule.

Tax calculation should be configurable based on the operating jurisdiction.

Historical tax values must be stored on the order/financial records.

---

# 63. Currency Handling

Every financial record should contain currency.

Do not perform arithmetic across different currencies without an explicit conversion model.

V1 should avoid multi-currency complexity unless specifically required.

---

# 64. Rounding

Rounding rules must be consistent.

The system should define:

* Decimal precision
* Rounding mode
* When rounding occurs

Avoid repeatedly rounding intermediate calculations when exact arithmetic can be maintained until the final required precision.

---

# 65. Financial Precision Testing

Tests must include:

```text
0.01
0.10
0.99
999.99
large values
percentage calculations
discount calculations
commission calculations
refund calculations
```

to detect floating-point or rounding errors.

---

# 66. Financial API Requirements

The API should support resources such as:

```text
GET /api/v1/restaurants/me/earnings
GET /api/v1/restaurants/me/transactions
GET /api/v1/restaurants/me/settlements
GET /api/v1/restaurants/me/payouts
GET /api/v1/restaurants/me/invoices

GET /api/v1/riders/me/earnings
GET /api/v1/riders/me/transactions
GET /api/v1/riders/me/settlements
GET /api/v1/riders/me/payouts
```

Admin financial endpoints must be permission protected.

Exact endpoint contracts belong in:

```text
docs/api/API_SPEC.md
```

---

# 67. Financial Pagination

Financial lists must support pagination.

Recommended:

```text
cursor
limit
```

Filters may include:

```text
date range
status
order number
transaction type
settlement ID
payout ID
```

Maximum page sizes must be enforced.

---

# 68. Financial Data Export

Where supported, authorized users may export:

* Transactions
* Earnings
* Settlements
* Payouts
* Invoices

Exports must respect:

* Authorization
* Tenant isolation
* Date limits
* Rate limits
* Audit requirements

---

# 69. Financial Security

Protect:

* Bank information
* Payment references
* Payout data
* Financial reports
* Settlement information

Do not expose financial records through unauthorized endpoints.

---

# 70. Financial Observability

Monitor:

```text
payments_succeeded
payments_failed
refunds_created
refunds_failed
settlements_created
settlements_failed
payouts_created
payouts_failed
reconciliation_mismatches
financial_adjustments
```

Important mismatches should generate operational alerts.

---

# 71. Financial Failure Handling

Financial failures must be recoverable.

Examples:

```text
Provider timeout
Worker crash
Database transaction rollback
Webhook duplication
Payout provider unavailable
Settlement worker interruption
```

Never resolve financial uncertainty by guessing.

Use reconciliation and provider verification.

---

# 72. Financial Data Retention

Financial records must be retained according to applicable legal/business requirements.

Do not apply aggressive deletion policies to:

* Payments
* Refunds
* Earnings
* Settlements
* Payouts
* Invoices
* Financial audit logs

Exact retention periods should be configured after legal/accounting requirements are established.

---

# 73. Testing Strategy

## Unit

Test:

* Commission
* Fees
* Earnings
* Refund adjustments
* Settlement calculations
* Payout amounts
* Rounding

## Integration

Test:

```text
Order
→ Payment
→ Earnings
→ Settlement
→ Payout
```

## Failure Tests

Test:

* Duplicate payment
* Duplicate refund
* Duplicate settlement
* Duplicate payout
* Provider timeout
* Worker crash
* Webhook duplication
* Amount mismatch
* Currency mismatch
* Settlement mismatch

---

# 74. Golden Financial Flow

The complete financial flow is:

```text
Customer
    ↓
Create Order
    ↓
Backend Calculates Total
    ↓
Payment / COD
    ↓
Payment Confirmed
    ↓
Restaurant Accepts
    ↓
Order Delivered
    ↓
Restaurant Earnings Created
    ↓
Rider Earnings Created
    ↓
Commission / Fees Applied
    ↓
Settlement Generated
    ↓
Settlement Reconciled
    ↓
Payout Created
    ↓
Payout Provider
    ↓
Payout Completed
    ↓
Invoice / Financial Record
```

---

# 75. Financial Failure Flow

```text
Financial Operation
        ↓
Failure
        ↓
Record Failure
        ↓
Do Not Delete History
        ↓
Retry if Safe
        ↓
Reconcile
        ↓
Manual Intervention if Required
        ↓
Audit
```

---

# 76. Definition of Done

Financial functionality is complete only when:

* Order financial snapshot exists.
* Payment records are authoritative.
* Restaurant earnings exist.
* Rider earnings exist.
* Commission is configurable.
* Fees are explicit.
* Refunds are represented separately.
* Settlement records exist.
* Settlement items exist.
* Payout records exist.
* Invoice records exist where required.
* Financial adjustments are traceable.
* Reconciliation exists.
* Idempotency exists.
* Audit logging exists.
* Authorization exists.
* Financial configuration is protected.
* Exact decimal arithmetic is used.
* Rounding is defined.
* Failure recovery exists.
* Tests exist.
* API contracts are documented.

---

# 77. Claude Code Implementation Rules

Before implementing financial functionality, Claude Code must read:

```text
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md
docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/RISK_RULES.md
docs/security/AUTH_AUTHORIZATION.md
docs/notifications/NOTIFICATION_RULES.md
docs/payments/PAYMENT_RULES.md
```

Claude Code must:

1. Treat financial records as authoritative backend data.
2. Never trust frontend calculations.
3. Never use floating point for money.
4. Never silently overwrite historical financial records.
5. Make financial operations idempotent.
6. Verify payment/refund/payout providers.
7. Use transactions where financial consistency requires them.
8. Use background jobs for asynchronous processing.
9. Implement reconciliation.
10. Audit financial administrative actions.
11. Enforce tenant isolation.
12. Protect sensitive financial information.
13. Add financial tests with every implementation.
14. Never hard-code business rates without approved configuration.
15. Never invent financial rules.
16. Ask for clarification when requirements conflict.

---

# 78. Phase 8 Completion Criteria

Phase 8 is complete when the following chain is fully specified:

```text
Checkout
    ↓
Payment
    ↓
Refund
    ↓
Restaurant Earnings
    ↓
Rider Earnings
    ↓
Commission / Fees
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

Every stage must have:

```text
Authority
Validation
Authorization
Idempotency
Failure handling
Auditability
Testing
```

---

# 79. Final Financial Architecture

```text
                     QUICKBITE
                         │
                    ORDER TOTAL
                         │
               ┌─────────┴─────────┐
               │                   │
          ONLINE PAYMENT          COD
               │                   │
               └─────────┬─────────┘
                         │
                    PAYMENT RECORD
                         │
                    ORDER DELIVERED
                         │
             ┌───────────┴───────────┐
             │                       │
      RESTAURANT EARNINGS      RIDER EARNINGS
             │                       │
             └───────────┬───────────┘
                         │
                    SETTLEMENT
                         │
                      PAYOUT
                         │
                    INVOICE
                         │
                   RECONCILIATION
                         │
                       AUDIT
```

PostgreSQL remains the durable financial source of truth.

External payment/payout providers are integrated through provider abstractions.

Redis and background workers support processing but do not replace durable financial records.
