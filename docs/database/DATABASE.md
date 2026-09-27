Absolutely. **Phase 3 is the database blueprint.** This is one of the most important phases because almost every QuickBite feature eventually depends on the database.

The objective is to produce a **developer-grade `DATABASE.md`** that Claude Code can implement without inventing tables, relationships, or business rules.

# QuickBite V1 — Phase 3: Database Architecture & Complete Schema

**Document:** `docs/database/DATABASE.md`

---

# 1. Database Technology

For V1:

> **PostgreSQL is the primary database.**

PostgreSQL is responsible for persistent, authoritative data.

Redis is **not** the primary database.

### PostgreSQL

Stores:

* Users
* Restaurants
* Restaurant staff
* Menus
* Orders
* Payments
* Riders
* Deliveries
* Risk
* Earnings
* Settlements
* Reviews
* Promotions
* Support
* Audit logs

### Redis

Used for:

* Cache
* Rider geolocation
* Temporary dispatch state
* Rate limiting
* Short-lived locks
* Job queues
* Real-time presence

---

# 2. Database Principles

These rules should be considered mandatory.

### Rule 1 — PostgreSQL is authoritative

Critical business data must have a persistent PostgreSQL record.

### Rule 2 — Backend owns business logic

The database stores data; business rules are enforced by the backend.

### Rule 3 — Never trust client data

The backend recalculates:

* Prices
* Discounts
* Fees
* Totals
* Earnings

### Rule 4 — Financial history should not be overwritten

Financial records should be append-only wherever practical.

### Rule 5 — Important state changes require history

Orders, payments, risk restrictions, etc. need historical records where appropriate.

### Rule 6 — Foreign keys must protect relationships

Do not rely exclusively on application code for relational integrity.

### Rule 7 — Use transactions for critical operations

Especially:

* Order creation
* Payment state changes
* Order state transitions
* Rider assignment
* Refunds
* Settlements

---

# 3. High-Level Entity Map

```text
USER
 │
 ├── CUSTOMER PROFILE
 │       │
 │       └── ADDRESSES
 │
 ├── RESTAURANT MEMBERSHIP
 │       │
 │       └── RESTAURANT
 │               │
 │               ├── MENU
 │               ├── OPERATING HOURS
 │               ├── DOCUMENTS
 │               ├── PROMOTIONS
 │               └── BANK ACCOUNT
 │
 └── RIDER PROFILE
         │
         └── RIDER DOCUMENTS


CUSTOMER
   │
   ▼
ORDER
   │
   ├── ORDER ITEMS
   ├── PAYMENT
   ├── ORDER STATUS HISTORY
   ├── DELIVERY
   ├── CANCELLATION
   ├── REVIEW
   └── FINANCIAL RECORDS
              │
              ├── RESTAURANT EARNINGS
              └── RIDER EARNINGS
```

---

# 4. Core Identity Tables

## 4.1 `users`

The central identity table.

```text
users
-----
id
email
phone
password_hash
status
email_verified_at
phone_verified_at
last_login_at
created_at
updated_at
```

### `status`

Possible values:

```text
ACTIVE
SUSPENDED
RESTRICTED
DEACTIVATED
PENDING_VERIFICATION
```

Do not delete users simply because they become inactive.

---

# 5. `user_roles`

Although V1 has simple roles, role assignment should still be represented cleanly.

```text
user_roles
----------
id
user_id
role
created_at
```

Possible roles:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
ADMIN
SUPER_ADMIN
```

A user may eventually have more than one role.

A user holds each role at most once:

```text
UNIQUE (user_id, role)
```

---

## 5.1 Authentication Storage

Added in Phase 20 (Slice 1 — Authentication), approved by the project owner.

These tables implement the server-side session model, refresh-token rotation, one-time verification codes and password-reset tokens required by `docs/security/AUTH_AUTHORIZATION.md` §14–33. They are owned by the **Auth** module.

Secrets are **never stored in plaintext**:

```text
refresh tokens, email-verification tokens, password-reset tokens
    → high-entropy random values, stored as SHA-256 hashes

phone OTP codes (low entropy)
    → stored as HMAC-SHA-256 with a server-side secret (never a plain hash)
```

### `user_sessions`

One row per login. The session is the authoritative revocation unit (AUTH_AUTHORIZATION §20, §26–27) and the refresh-token family.

```text
user_sessions
-------------
id
user_id
created_at
last_used_at
expires_at
revoked_at
revoked_reason
ip_address
user_agent
```

Rules:

* `expires_at` is the absolute maximum session lifetime; a session cannot be extended beyond it (AUTH_AUTHORIZATION §67).
* A session with `revoked_at` set, or past `expires_at`, cannot be refreshed or used.
* `revoked_reason` values:

```text
LOGOUT
PASSWORD_RESET
PASSWORD_CHANGED
REFRESH_TOKEN_REUSE
ACCOUNT_SUSPENDED
ADMIN_ACTION
```

Indexes:

```text
user_sessions.user_id
```

### `refresh_tokens`

Every issued refresh token of a session. Rotation marks the presented token as used and issues a new one.

```text
refresh_tokens
--------------
id
session_id
token_hash
expires_at
used_at
created_at
```

Rules:

* `token_hash` is unique.
* A token can be used exactly once (`used_at`).
* Presenting a token whose `used_at` is already set is **refresh-token reuse**: the whole session is revoked with `REFRESH_TOKEN_REUSE` (AUTH_AUTHORIZATION §25).

Constraints / indexes:

```text
UNIQUE refresh_tokens.token_hash
refresh_tokens.session_id
refresh_tokens.session_id → user_sessions.id (cascade on session delete)
```

### `verification_challenges`

One-time challenges for phone verification, email verification and password reset.

```text
verification_challenges
-----------------------
id
user_id
type
target
secret_hash
attempts
max_attempts
expires_at
consumed_at
invalidated_at
created_at
```

`type` values:

```text
PHONE_VERIFICATION      6-digit OTP sent by SMS
EMAIL_VERIFICATION      random token sent by email
PASSWORD_RESET          random token sent to the account's email or phone
```

Rules:

* `target` is the normalized phone number or email address the challenge was sent to. If the user's contact detail changes, the challenge no longer applies.
* A challenge is valid only while `consumed_at` and `invalidated_at` are null, `expires_at` is in the future and `attempts < max_attempts`.
* Creating a new challenge of the same type for a user invalidates the previous active one.
* Successful use sets `consumed_at` (single use).
* Lifetimes and attempt limits are configuration (AUTH_AUTHORIZATION §16).

Constraints / indexes:

```text
verification_challenges.user_id → users.id
UNIQUE verification_challenges.secret_hash   (token-based types are looked up by hash)
verification_challenges (user_id, type)
```

## 5.2 Identity Column Types

```text
ids                         UUID
users.email                 text, unique, nullable (stored normalized: trimmed, lower-case)
users.phone                 text, unique, nullable (stored normalized: E.164, e.g. +923001234567)
users.status                enum (§4.1)
user_roles.role             enum (§5)
timestamps                  timestamptz (UTC)
```

`email` and `phone` are nullable at the database level so that non-customer accounts (e.g. administrators created by a Super Admin) are not forced to have both. Customer registration requires both (`API_SPEC.md` §16).

## 5.3 Account Activation

Customer accounts are created with status `PENDING_VERIFICATION`.

Successful **phone verification** sets `phone_verified_at` and moves the account to `ACTIVE`. Email verification sets `email_verified_at` and does not change `status`.

## 5.4 Phase 20 Gap Fills

Columns/tables added during implementation where the specifications required data but defined no
storage. They carry data only; no new business behavior.

```text
restaurant_owner_profiles(id, user_id UNIQUE, first_name, last_name, created_at, updated_at)
    owner name captured at restaurant registration (API_SPEC §44)

restaurant_applications.business_information   JSONB {legalName, registrationNumber?, taxNumber?}
    business information for admin review (PRD §9, API_SPEC §45 "Update Business Information")

restaurants.paused_until, restaurants.status_reason
    end of a temporary pause (API_SPEC §49 durationMinutes) and reason for pause/suspension
```

Constraints added: one ACTIVE `restaurant_staff` membership per user (V1: a user belongs to one
restaurant); one default payment account per restaurant; one default address per user.

`restaurants.minimum_order_amount` (§8) is not implemented; the single source is
`restaurant_delivery_settings.minimum_order_amount` (§14) to avoid two conflicting values.

---

# 6. `customer_profiles`

```text
customer_profiles
-----------------
id
user_id
first_name
last_name
profile_image_url
date_of_birth
created_at
updated_at
```

Keep customer-specific information separate from authentication data.

---

# 7. `addresses`

Addresses belong to users.

```text
addresses
---------
id
user_id
label
recipient_name
phone
address_line_1
address_line_2
area
city
postal_code
latitude
longitude
delivery_instructions
is_default
created_at
updated_at
```

Examples of labels:

```text
HOME
WORK
OTHER
```

---

# 8. Restaurant Tables

## `restaurants`

```text
restaurants
-----------
id
owner_user_id
name
slug
description
phone
email
logo_url
cover_image_url
status
approval_status
latitude
longitude
address_line_1
address_line_2
area
city
postal_code
cuisine_description
minimum_order_amount
created_at
updated_at
```

---

# 9. Restaurant Status

Possible values:

```text
OFFLINE
ONLINE
TEMPORARILY_PAUSED
CLOSED
SUSPENDED
```

Approval status is separate.

Example:

```text
approval_status = APPROVED
status = ONLINE
```

A restaurant can be approved but temporarily offline.

---

# 10. Restaurant Onboarding

## `restaurant_applications`

```text
restaurant_applications
-----------------------
id
restaurant_id
status
submitted_at
reviewed_at
reviewed_by
rejection_reason
resubmission_notes
created_at
updated_at
```

Status:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
RESUBMISSION_REQUIRED
```

---

# 11. Restaurant Staff

## `restaurant_staff`

```text
restaurant_staff
----------------
id
restaurant_id
user_id
role
status
created_at
updated_at
```

V1 roles:

```text
OWNER
OPERATOR
```

Remember:

**Manager, Order Staff and Kitchen Staff are not separate V1 roles.**

---

# 12. Restaurant Documents

## `restaurant_documents`

```text
restaurant_documents
--------------------
id
restaurant_id
document_type
file_url
status
uploaded_by
reviewed_by
reviewed_at
rejection_reason
created_at
updated_at
```

Possible status:

```text
PENDING
APPROVED
REJECTED
```

---

# 13. Restaurant Operating Hours

## `restaurant_operating_hours`

```text
restaurant_operating_hours
--------------------------
id
restaurant_id
day_of_week
opens_at
closes_at
is_closed
created_at
updated_at
```

There should be support for multiple operating periods if required later.

---

# 14. Restaurant Delivery Configuration

## `restaurant_delivery_settings`

```text
restaurant_delivery_settings
----------------------------
id
restaurant_id
delivery_enabled
minimum_order_amount
estimated_preparation_minutes
delivery_radius
created_at
updated_at
```

Actual delivery pricing may be controlled by platform-wide rules rather than solely by restaurant.

---

# 15. Restaurant Bank Information

## `restaurant_payment_accounts`

```text
restaurant_payment_accounts
---------------------------
id
restaurant_id
provider
account_reference
account_holder_name
status
is_default
created_at
updated_at
```

Do **not** store raw sensitive payment credentials unnecessarily.

Prefer provider tokens/references.

---

# 16. Menu Architecture

```text
restaurant
    │
    ▼
categories
    │
    ▼
menu_items
    │
    ├── item_variations
    │
    └── item_add_ons
```

---

# 17. `menu_categories`

```text
menu_categories
---------------
id
restaurant_id
name
description
sort_order
is_active
created_at
updated_at
```

---

# 18. `menu_items`

```text
menu_items
----------
id
restaurant_id
category_id
name
description
image_url
base_price
is_available
sort_order
created_at
updated_at
```

`base_price` should use PostgreSQL `numeric`, not floating-point types.

For example:

```text
NUMERIC(12,2)
```

---

# 19. `item_variations`

```text
item_variations
---------------
id
menu_item_id
name
price_adjustment
is_active
sort_order
created_at
updated_at
```

Example:

```text
Small   +0
Medium  +100
Large   +200
```

---

# 20. `item_add_ons`

```text
item_add_ons
------------
id
menu_item_id
name
price
is_active
sort_order
created_at
updated_at
```

---

# 21. Orders

## `orders`

This is one of the most important tables.

```text
orders
------
id
order_number
customer_id
restaurant_id
delivery_address_id
status
payment_method
payment_status
subtotal
discount_amount
delivery_fee
tax_amount
service_fee
total_amount
currency
promotion_id
special_instructions
estimated_preparation_minutes
placed_at
accepted_at
preparing_at
ready_at
picked_up_at
delivered_at
cancelled_at
created_at
updated_at
```

---

# 22. Order IDs

Use an internal immutable ID:

```text
id
```

and a human-readable order number:

```text
order_number
```

Example:

```text
Internal ID:
UUID

Customer-facing:
QB-100042
```

Never use the human-readable order number as the primary key.

---

# 23. `order_items`

Never depend on current menu data to reconstruct an old order.

Store a **snapshot**.

```text
order_items
-----------
id
order_id
menu_item_id
item_name
unit_price
quantity
subtotal
created_at
```

The `item_name` and `unit_price` are snapshots.

If the restaurant later changes:

```text
Burger = Rs. 500
```

to:

```text
Burger = Rs. 650
```

an old order still shows Rs. 500.

---

# 24. Order Item Options

## `order_item_variations`

```text
order_item_variations
---------------------
id
order_item_id
variation_id
name
price_adjustment
quantity
created_at
```

Again, store the snapshot values needed to preserve historical accuracy.

---

# 25. `order_item_add_ons`

```text
order_item_add_ons
------------------
id
order_item_id
add_on_id
name
price
quantity
created_at
```

---

# 26. Order Status History

## `order_status_history`

```text
order_status_history
--------------------
id
order_id
from_status
to_status
changed_by_user_id
reason
metadata
created_at
```

This should be append-only.

---

# 27. Order Cancellation

## `order_cancellations`

```text
order_cancellations
-------------------
id
order_id
cancelled_by_user_id
cancelled_by_role
reason_code
reason_text
refund_amount
created_at
```

This provides a historical cancellation record.

---

# 28. Payment Tables

## `payments`

```text
payments
--------
id
order_id
customer_id
provider
provider_payment_id
method
status
amount
currency
idempotency_key
paid_at
created_at
updated_at
```

---

# 29. Payment Status

Possible states:

```text
PENDING
AUTHORIZED
SUCCEEDED
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

The exact provider integration may introduce additional states internally.

---

# 30. Refunds

## `refunds`

```text
refunds
-------
id
payment_id
order_id
provider_refund_id
amount
reason
status
initiated_by
created_at
completed_at
```

Never modify the original payment amount to represent a refund.

Create a separate refund record.

---

# 31. Riders

## `rider_profiles`

```text
rider_profiles
--------------
id
user_id
first_name
last_name
phone
profile_image_url
vehicle_type
vehicle_number
status
approval_status
is_online
is_available
created_at
updated_at
```

---

# 32. Rider Approval

Possible:

```text
PENDING
UNDER_REVIEW
APPROVED
REJECTED
SUSPENDED
```

A rider must be approved before receiving deliveries.

---

# 33. Rider Documents

## `rider_documents`

```text
rider_documents
---------------
id
rider_id
document_type
file_url
status
uploaded_at
reviewed_at
reviewed_by
rejection_reason
```

---

# 34. Rider Location

For persistent location data, avoid storing every GPS update indefinitely in PostgreSQL.

For V1:

### Current location

Redis.

### Important historical location events

PostgreSQL where required.

Potential table:

```text
rider_location_events
---------------------
id
rider_id
latitude
longitude
accuracy
recorded_at
```

Retention should be configurable.

---

# 35. Delivery

## `deliveries`

A delivery is associated with an order.

```text
deliveries
----------
id
order_id
rider_id
status
pickup_at
picked_up_at
delivered_at
delivery_notes
created_at
updated_at
```

Possible status:

```text
PENDING
ASSIGNED
ARRIVING_AT_RESTAURANT
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
FAILED
CANCELLED
```

---

# 36. Dispatch Offers

## `dispatch_offers`

```text
dispatch_offers
---------------
id
order_id
rider_id
status
offered_at
expires_at
responded_at
distance_to_restaurant
estimated_arrival_seconds
rejection_reason
created_at
updated_at
```

Status:

```text
OFFERED
ACCEPTED
REJECTED
EXPIRED
CANCELLED
```

This table gives us an auditable dispatch history.

---

# 37. Delivery Assignment

We should maintain a clear assignment record.

## `delivery_assignments`

```text id="8f3fcb"
delivery_assignments
--------------------
id
delivery_id
rider_id
assigned_at
unassigned_at
reason
created_at
```

This allows reassignment history.

---

# 38. Dispatch Configuration

## `dispatch_settings`

```text
dispatch_settings
-----------------
id
initial_radius
radius_increment
maximum_radius
offer_timeout_seconds
max_offer_attempts
created_at
updated_at
```

Exact values should be configuration, not hard-coded.

---

# 39. Risk System

Core tables:

```text
risk_events
risk_rules
risk_flags
risk_restrictions
```

---

# 40. `risk_events`

Every relevant risk signal becomes an event.

```text
risk_events
-----------
id
subject_type
subject_id
event_type
severity
metadata
occurred_at
created_at
```

`subject_type` can represent:

```text
CUSTOMER
RESTAURANT
RIDER
```

Example:

```text
subject_type = CUSTOMER
subject_id = ...
event_type = COD_NON_RECEIPT
```

---

# 41. `risk_rules`

```text
risk_rules
----------
id
name
subject_type
event_type
threshold
window_seconds
action
severity
is_enabled
created_by
updated_by
created_at
updated_at
```

Example:

```text
name:
Repeated COD non-receipt

subject:
CUSTOMER

event:
COD_NON_RECEIPT

threshold:
3

window:
90 days

action:
COD_RESTRICTED
```

---

# 42. `risk_flags`

```text
risk_flags
----------
id
subject_type
subject_id
risk_rule_id
status
severity
reason
created_at
resolved_at
resolved_by
```

Possible status:

```text
ACTIVE
RESOLVED
DISMISSED
EXPIRED
```

---

# 43. `risk_restrictions`

```text
risk_restrictions
-----------------
id
subject_type
subject_id
restriction_type
status
starts_at
expires_at
reason
created_by
created_at
```

Examples:

```text
COD_RESTRICTED
ORDER_RESTRICTED
ADDITIONAL_VERIFICATION
ACCOUNT_RESTRICTED
```

---

# 44. Promotions

## `promotions`

```text
promotions
----------
id
restaurant_id
name
description
type
value
minimum_order_amount
maximum_discount_amount
usage_limit
usage_count
starts_at
ends_at
status
created_at
updated_at
```

Potential promotion types:

```text
PERCENTAGE
FIXED_AMOUNT
```

---

# 45. Promotion Usage

## `promotion_usages`

```text
promotion_usages
----------------
id
promotion_id
customer_id
order_id
discount_amount
used_at
```

This prevents relying on a simple counter to reconstruct promotion history.

---

# 46. Reviews

## `reviews`

```text
reviews
-------
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

Only completed/eligible orders should normally generate reviews.

---

# 47. Restaurant Review Responses

## `review_responses`

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

---

# 48. Review Reports

## `review_reports`

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

---

# 49. Notifications

## `notifications`

```text
notifications
-------------
id
user_id
type
title
body
data
read_at
created_at
```

---

# 50. Notification Deliveries

If we need channel-level tracking:

```text
notification_deliveries
-----------------------
id
notification_id
channel
provider
status
provider_message_id
sent_at
delivered_at
failed_at
created_at
```

Channels:

```text
PUSH
SMS
EMAIL
IN_APP
```

---

# 51. Restaurant Earnings

We should avoid putting a single mutable `balance` everywhere.

Use financial records.

## `restaurant_earnings`

```text
restaurant_earnings
-------------------
id
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

# 52. Rider Earnings

## `rider_earnings`

```text
rider_earnings
--------------
id
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

# 53. Settlements

## `settlements`

```text
settlements
-----------
id
recipient_type
recipient_id
period_start
period_end
gross_amount
fees
adjustments
net_amount
status
created_at
processed_at
```

Recipient types:

```text
RESTAURANT
RIDER
```

---

# 54. Settlement Items

## `settlement_items`

```text
settlement_items
----------------
id
settlement_id
source_type
source_id
amount
created_at
```

This allows us to trace a settlement back to individual earnings records.

---

# 55. Payouts

## `payouts`

```text
payouts
-------
id
settlement_id
recipient_type
recipient_id
provider
provider_reference
amount
status
initiated_at
completed_at
created_at
```

---

# 56. Invoices

## `invoices`

```text
invoices
--------
id
recipient_type
recipient_id
settlement_id
invoice_number
file_url
amount
status
issued_at
created_at
```

---

# 57. Support

## `support_tickets`

```text
support_tickets
---------------
id
created_by_user_id
subject
category
priority
status
assigned_to
created_at
updated_at
resolved_at
```

Possible status:

```text
OPEN
IN_PROGRESS
WAITING_FOR_USER
RESOLVED
CLOSED
```

---

# 58. Support Messages

## `support_messages`

```text
support_messages
----------------
id
ticket_id
sender_user_id
message
attachments
created_at
```

---

# 59. Audit Logs

## `audit_logs`

This is critical.

```text
audit_logs
----------
id
actor_user_id
action
entity_type
entity_id
old_values
new_values
ip_address
user_agent
metadata
created_at
```

Examples:

```text
RESTAURANT_APPROVED
ORDER_CANCELLED
REFUND_CREATED
RISK_RESTRICTION_APPLIED
PAYOUT_COMPLETED
PERMISSION_CHANGED
```

---

# 60. System Configuration

Some business configuration should be database-driven.

## `system_settings`

```text
system_settings
---------------
id
key
value
value_type
description
is_sensitive
updated_by
created_at
updated_at
```

But don't put everything into generic key/value storage.

Important structured configurations should have dedicated tables.

---

# 61. Idempotency

## `idempotency_keys`

For APIs where duplicate execution would cause damage.

```text
idempotency_keys
----------------
id
key
user_id
endpoint
request_hash
response_status
response_body
expires_at
created_at
```

Useful for:

* Create order
* Payment
* Refund
* Payout

---

# 62. Outbox

For reliable internal events:

## `outbox_events`

```text
outbox_events
-------------
id
event_type
aggregate_type
aggregate_id
payload
status
attempts
available_at
processed_at
created_at
```

Possible status:

```text
PENDING
PROCESSING
PROCESSED
FAILED
```

This supports reliable event processing.

Implementation columns (Phase 20):

```text
sequence     monotonic creation order (events of one transaction share created_at)
last_error   last handler error message, for monitoring failed events
```

`idempotency_keys` is unique on `(user_id, endpoint, key)`.

---

# 63. Database Relationships

Important relationships:

```text
User
 ├── CustomerProfile
 ├── Addresses
 ├── RestaurantStaff
 └── RiderProfile

Restaurant
 ├── RestaurantStaff
 ├── Categories
 ├── MenuItems
 ├── OperatingHours
 ├── Documents
 ├── PaymentAccounts
 └── Promotions

MenuItem
 ├── Variations
 └── AddOns

Order
 ├── OrderItems
 ├── Payment
 ├── StatusHistory
 ├── Cancellation
 ├── Delivery
 └── Review

Delivery
 ├── DispatchOffers
 └── Assignments

Customer/Rider/Restaurant
 └── RiskEvents
```

---

# 64. Foreign Keys

Foreign keys should be used extensively.

Examples:

```text
orders.customer_id
        → users.id

orders.restaurant_id
        → restaurants.id

order_items.order_id
        → orders.id

deliveries.order_id
        → orders.id

deliveries.rider_id
        → rider_profiles.id
```

Do not leave relational integrity entirely to application code.

---

# 65. Indexing Strategy

Indexes should exist on high-frequency queries.

Examples:

```text
users.email
users.phone

restaurants.status
restaurants.approval_status

restaurant_staff.restaurant_id
restaurant_staff.user_id

menu_items.restaurant_id
menu_items.category_id

orders.customer_id
orders.restaurant_id
orders.status
orders.created_at

deliveries.rider_id
deliveries.status

dispatch_offers.rider_id
dispatch_offers.order_id

risk_events.subject_type
risk_events.subject_id
risk_events.event_type

notifications.user_id
notifications.read_at
```

Do not create indexes blindly on every column.

---

# 66. Unique Constraints

Important examples:

```text
users.email
users.phone
restaurants.slug
order.order_number
restaurant_staff (restaurant_id, user_id)
```

The exact uniqueness rules will be finalized during schema implementation.

---

# 67. Money Storage

Never use floating-point values for financial amounts.

Bad:

```text
FLOAT
DOUBLE
```

Prefer:

```text
NUMERIC(12,2)
```

And always store:

```text
amount
currency
```

---

# 68. Time Storage

Store timestamps consistently in UTC.

For example:

```text
created_at
updated_at
```

Use timezone-aware PostgreSQL timestamps where appropriate.

The application converts them to the user's/local business timezone for display.

---

# 69. Soft Delete

Do not blindly physically delete important records.

For entities such as:

* Restaurants
* Menu items
* Promotions
* Users

we may use:

```text
deleted_at
```

where appropriate.

Orders and financial records should generally remain historically intact.

---

# 70. Data Retention

Not every piece of data should be stored forever.

Examples requiring retention policies:

* Rider GPS history
* Notification delivery records
* Logs
* Temporary dispatch data
* Risk events

Retention periods should be configurable and aligned with operational/legal requirements.

---

# 71. Database Transactions

Critical operations require transactions.

### Order creation

```text
BEGIN
↓
Validate
↓
Calculate
↓
Create order
↓
Create items
↓
Create payment
↓
Create history
↓
Create outbox events
↓
COMMIT
```

### Rider assignment

```text
BEGIN
↓
Lock/check delivery
↓
Verify unassigned
↓
Create assignment
↓
Update order
↓
Create history
↓
COMMIT
```

---

# 72. Preventing Invalid States

Database constraints should prevent obvious invalid data.

Examples:

```text
quantity > 0
price >= 0
rating between 1 and 5
amount >= 0
```

Business-level rules remain in backend services.

---

# 73. Migration Strategy

Database changes must use migrations.

Never manually modify production schema without a migration.

Example:

```text
migrations/
├── 001_initial_schema
├── 002_add_orders
├── 003_add_dispatch
└── ...
```

Migrations must be:

* Version controlled
* Reproducible
* Tested
* Applied consistently across environments

---

# 74. Seed Data

Development/staging should have controlled seed data.

Examples:

```text
Admin
Super Admin
Demo Customer
Demo Restaurant
Demo Operator
Demo Rider

Categories
Menu Items
Promotions
```

Never use fake seed data accidentally in production.

---

# 75. Database Security

Production database:

* No public access unless absolutely necessary
* Strong credentials
* Encrypted connections
* Least-privilege users
* Regular backups
* Monitoring
* Restricted network access

Application users should not have unrestricted database privileges.

---

# 76. Backup Strategy

Production needs:

```text
Automated backups
+
Point-in-time recovery where supported
+
Backup monitoring
+
Restore testing
```

The team should periodically prove that a backup can actually be restored.

---

# 77. What Claude Code Must NOT Do

Claude Code must not:

* Invent tables without updating `DATABASE.md`
* Change relationships silently
* Store money as floating point
* Store passwords in plaintext
* Store provider secrets in the database unnecessarily
* Delete financial history
* Trust client prices
* Trust client order totals
* Trust client permissions
* Use Redis as the permanent source of truth
* bypass migrations

---

# 78. Database Module Ownership

Each backend module owns its database behavior.

For example:

```text
Orders Module
    ↓
orders
order_items
order_status_history
```

Risk module:

```text
risk_events
risk_rules
risk_flags
risk_restrictions
```

Dispatch:

```text
dispatch_offers
delivery_assignments
```

Auth:

```text
user_sessions
refresh_tokens
verification_challenges
```

This keeps the modular-monolith architecture clean.

---

# 79. Final Database Architecture

The core data architecture becomes:

```text
                         PostgreSQL
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
    Identity             Marketplace            Delivery
       │                     │                     │
       │                 Restaurants              Riders
       │                 Menu                    Deliveries
       │                 Orders                  Dispatch
       │                 Payments                Locations
       │
       ├──────────────────────────────────────────────┐
       │                                              │
       ▼                                              ▼
   Trust & Risk                                  Financial
       │                                              │
       │                                      Earnings
       │                                      Settlements
       │                                      Payouts
       │
       ├──────────────────────────────────────────────┐
       │                                              │
       ▼                                              ▼
 Notifications                                    Support
 Reviews                                          Audit
 Promotions                                       System Config
```
