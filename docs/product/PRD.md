# QuickBite — V1 Master Product Requirements Document

**Product:** QuickBite
**Version:** V1.0
**Product Type:** Food Delivery Marketplace
**Platforms:** Customer App, Restaurant App, Rider App, Admin Panel
**Development Approach:** Agile Scrum/Kanban hybrid
**Primary Goal:** Build a production-ready food delivery platform capable of handling the complete customer → restaurant → rider → delivery → payment → earnings lifecycle.

---

# 1. Product Vision

QuickBite is a food delivery marketplace connecting:

**Customers ↔ Restaurants ↔ Riders**

The platform must allow customers to discover restaurants, order food, pay, track deliveries, and review their experience.

Restaurants must be able to onboard, manage menus, receive and process orders, manage availability, communicate with the platform, and track earnings.

Riders must be able to register, become approved, go online, receive nearby delivery opportunities, accept deliveries, navigate to restaurants/customers, complete deliveries, and track earnings.

Administrators must control the marketplace, users, restaurants, riders, orders, payments, disputes, risk, promotions, and platform configuration.

---

# 2. V1 Products

QuickBite V1 consists of exactly four products:

### 2.1 Customer App

For customers ordering food.

### 2.2 Restaurant App

For restaurant owners/operators managing their restaurant and orders.

### 2.3 Rider App

For delivery riders.

### 2.4 Admin Panel

For QuickBite administrators and platform operations.

---

# 3. V1 User Roles

We simplify the restaurant staff model.

## Customer

Can:

* Create account
* Manage profile
* Manage addresses
* Browse restaurants
* Search restaurants/items
* View menus
* Add items to cart
* Checkout
* Pay
* Track orders
* Cancel orders where permitted
* Receive notifications
* Review restaurants/orders
* Contact support

---

## Restaurant Owner

Has full restaurant-management authority.

Can:

* Manage restaurant
* Manage restaurant information
* Manage bank/payment information
* Manage staff/operator
* Manage menu
* Manage orders
* Manage promotions
* Manage availability
* View earnings
* View settlements
* View analytics
* Manage restaurant settings

---

## Restaurant Operator

**Restaurant Manager + Order Staff + Kitchen Staff are NOT separate roles in V1.**

They are combined into:

> **Restaurant Operator**

The Operator handles the restaurant's day-to-day operations.

Can:

* View orders
* Accept orders
* Reject orders
* Start preparation
* Mark orders ready
* Manage menu availability
* Manage restaurant availability
* View relevant operational information
* Handle normal restaurant operations

Sensitive financial/account-management capabilities remain restricted to the Owner unless explicitly granted through future permissions.

---

## Rider

Can:

* Register
* Submit required information/documents
* Complete verification
* Go online/offline
* Receive delivery offers
* Accept/reject delivery offers
* Navigate to restaurant
* Confirm pickup
* Navigate to customer
* Complete delivery
* Handle delivery exceptions
* View delivery history
* View earnings

---

## Admin

Can operate the platform.

Can manage:

* Customers
* Restaurants
* Riders
* Orders
* Payments
* Refunds
* Promotions
* Reviews
* Support
* Risk
* Disputes
* Reports
* Platform configuration

---

## Super Admin

Has the highest administrative authority.

Can additionally:

* Manage admins
* Manage sensitive system configuration
* Manage permissions
* Manage business rules
* Manage risk rules
* Manage cancellation rules
* Manage platform-wide settings
* Access sensitive audit information

---

# 4. Core Business Model

QuickBite connects customers with restaurants and riders.

Basic flow:

```text
Customer
   ↓
Browse Restaurant
   ↓
Select Food
   ↓
Cart
   ↓
Checkout
   ↓
Payment / COD
   ↓
Order Created
   ↓
Restaurant
   ↓
Accept
   ↓
Prepare
   ↓
Ready
   ↓
Dispatch Engine
   ↓
Nearby Rider
   ↓
Pickup
   ↓
Customer
   ↓
Delivery
   ↓
Completed
```

---

# 5. Customer Journey

```text
Open App
↓
Welcome
↓
Register/Login
↓
Phone/Email Verification
↓
Location
↓
Home
↓
Search/Browse
↓
Restaurant
↓
Menu
↓
Item Details
↓
Cart
↓
Checkout
↓
Address
↓
Payment Method
↓
Order Confirmation
↓
Order Tracking
↓
Restaurant Accepts
↓
Preparing
↓
Ready
↓
Rider Assigned
↓
Picked Up
↓
Out for Delivery
↓
Delivered
↓
Review
```

---

# 6. Restaurant Journey

```text
Register
↓
Verify
↓
Restaurant Onboarding
↓
Basic Information
↓
Address
↓
Map Location
↓
Operating Hours
↓
Delivery Configuration
↓
Business Information
↓
Documents
↓
Bank Information
↓
Submit Application
↓
Admin Review
↓
Approved
↓
Restaurant Setup
↓
Menu Setup
↓
Go Live
↓
Receive Orders
↓
Accept/Reject
↓
Preparing
↓
Ready
↓
Rider Pickup
↓
Completed
↓
Earnings
↓
Settlement
```

---

# 7. Rider Journey

```text
Register
↓
Verify
↓
Rider Information
↓
Documents
↓
Admin Review
↓
Approved
↓
Go Online
↓
Dispatch Engine
↓
Nearby Delivery Offer
↓
Accept
↓
Restaurant
↓
Pickup
↓
Customer
↓
Delivered
↓
Earnings
```

---

# 8. Admin Journey

```text
Admin Login
↓
Dashboard
↓
Restaurants
↓
Riders
↓
Customers
↓
Orders
↓
Payments
↓
Refunds
↓
Settlements
↓
Promotions
↓
Reviews
↓
Support
↓
Risk & Fraud
↓
Reports
↓
System Configuration
↓
Audit Logs
```

---

# 9. Restaurant Onboarding

Restaurant application states:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
RESUBMISSION_REQUIRED
```

Required information may include:

* Restaurant name
* Owner information
* Phone
* Email
* Address
* GPS location
* Cuisine
* Operating hours
* Delivery configuration
* Business information
* Required documents
* Bank/payment information

Admin must approve the restaurant before it can go live.

---

# 10. Restaurant Status

Restaurant availability must be controlled by the backend.

Possible states:

```text
OFFLINE
ONLINE
TEMPORARILY_PAUSED
CLOSED
SUSPENDED
```

The frontend may display these states, but the backend is authoritative.

---

# 11. Menu

Restaurants can manage:

### Categories

* Create
* Edit
* Delete/deactivate
* Reorder

### Items

* Name
* Description
* Image
* Price
* Availability
* Category
* Preparation information

### Add-ons

Examples:

```text
Extra Cheese
Extra Sauce
Extra Chicken
```

### Variations

Examples:

```text
Small
Medium
Large
```

The backend must calculate authoritative item prices.

The client cannot be trusted to submit the final price.

---

# 12. Cart

The cart contains:

* Restaurant
* Items
* Quantities
* Variations
* Add-ons
* Item prices
* Subtotal
* Delivery fee
* Discount
* Taxes/fees where applicable
* Final total

The backend recalculates all monetary values during order creation.

---

# 13. Orders

## Order States

The primary order lifecycle is:

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

Cancellation states are separate:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

Every important status transition must be recorded.

---

# 14. Cancellation Rules Engine

Cancellation is **not simply a frontend button**.

The backend must have a dedicated:

> **Cancellation Rules Engine**

Example V1 policy:

| Order State         | Customer Cancellation    |
| ------------------- | ------------------------ |
| PENDING             | Allowed subject to rules |
| RESTAURANT_ACCEPTED | Restricted/configurable  |
| PREPARING           | Not normally allowed     |
| READY_FOR_PICKUP    | Not allowed              |
| RIDER_ASSIGNED      | Not allowed              |
| PICKED_UP           | Not allowed              |
| OUT_FOR_DELIVERY    | Not allowed              |
| DELIVERED           | Not applicable           |

### Important business rule

Once the restaurant begins preparing the order:

> **The customer cannot normally cancel the order.**

This rule must be enforced server-side.

The frontend must never be the authority.

---

# 15. Cancellation Exceptions

Admin/support may intervene for legitimate cases such as:

* Restaurant cannot fulfill order
* Restaurant closed unexpectedly
* Payment problem
* Safety issue
* Duplicate order
* Platform error
* Other legitimate operational issue

Administrative cancellation must create an audit record.

---

# 16. Delivery Dispatch Engine

This is a core V1 system.

When an order becomes:

```text
READY_FOR_PICKUP
```

the backend activates the:

> **Delivery Dispatch Engine**

It finds eligible riders near the restaurant.

---

# 17. Rider Eligibility

A rider can receive an order only if relevant eligibility conditions are satisfied.

Examples:

```text
Account approved
AND
Account active
AND
Rider online
AND
Rider available
AND
Not currently occupied
AND
Within dispatch radius
AND
Eligible vehicle/type
AND
Not restricted
```

---

# 18. Dispatch Radius

The system should initially search for riders within a configurable radius around the restaurant.

For example:

```text
Initial radius
     ↓
Find eligible riders
     ↓
If none
     ↓
Expand radius
     ↓
Search again
     ↓
Continue according to configured limits
```

The exact radius must be configurable.

Do not hard-code business thresholds throughout the application.

---

# 19. Dispatch Ranking

Eligible riders can be ranked using configurable factors such as:

* Distance from restaurant
* Estimated arrival time
* Rider availability
* Current workload
* Delivery zone
* Vehicle eligibility
* Rider reliability
* Other operational signals

V1 should keep the dispatch algorithm simple and configurable rather than building an unnecessarily complex AI system.

---

# 20. Dispatch Assignment Safety

The system must prevent two riders from accepting the same delivery.

Use server-side assignment locking/transaction mechanisms.

Example:

```text
Order READY
↓
Dispatch offer
↓
Rider A accepts
↓
Server verifies order still available
↓
Assignment lock
↓
Rider A assigned
↓
Other offers expire
```

If a rider does not accept within the configured period:

```text
Offer expires
↓
Dispatch engine
↓
Next eligible rider
```

---

# 21. Trust & Risk Engine

QuickBite V1 includes a dedicated:

> **Trust & Risk Engine**

It should not simply be a hard-coded "ban after X events" system.

Architecture:

```text
User Activity
     ↓
Risk Signals
     ↓
Risk Evaluation
     ↓
Risk Flags
     ↓
Risk Level
     ↓
Configured Action
```

---

# 22. Customer Risk Signals

Examples:

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

---

# 23. COD Fraud Example

Example configurable rule:

```text
COD non-receipt #1
        ↓
Risk flag

COD non-receipt #2
        ↓
Higher risk

COD non-receipt #3
        ↓
Restrict COD
```

The customer may still be permitted to use prepaid payment.

This avoids unnecessarily blocking the entire account when the actual risk is specifically related to COD.

The exact threshold must be configurable by administrators.

---

# 24. Risk Actions

Possible actions:

```text
NORMAL
MONITORED
COD_RESTRICTED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

Rules must support:

* Threshold
* Time window
* Risk level
* Action
* Enabled/disabled
* Admin override

Example:

```text
Event:
COD non-receipt

Threshold:
3

Window:
90 days

Action:
Restrict COD
```

---

# 25. Restaurant Risk

The system should also detect restaurant-side abuse.

Examples:

* Suspicious order rejection
* Repeated false cancellations
* False ready status
* Manipulation of order status
* Suspicious operational patterns

---

# 26. Rider Risk

Examples:

* False pickup
* False delivery
* GPS anomalies
* Excessive failed delivery claims
* Suspicious location behavior
* Repeated delivery disputes

---

# 27. Risk Check Before Order Creation

Before creating an order:

```text
Customer
↓
Create Order Request
↓
Risk Check
↓
Payment Method Check
↓
Restaurant Availability Check
↓
Item Availability Check
↓
Delivery Eligibility
↓
Create Order
```

If the customer's COD access is restricted:

```text
COD unavailable
```

The backend must enforce this.

---

# 28. Payments

Payment architecture must support:

* Online payment
* Cash on Delivery
* Payment authorization/confirmation
* Payment failure
* Refunds
* Payment reconciliation

The frontend cannot declare:

> "Payment successful."

The payment provider/server must confirm payment.

---

# 29. Financial Authority

The backend is authoritative for:

* Item prices
* Subtotal
* Discounts
* Delivery fee
* Taxes
* Platform fees
* Restaurant earnings
* Rider earnings
* Refunds
* Settlements
* Payouts

All financial records should have an auditable history.

---

# 30. Restaurant Earnings

Restaurant earnings should support:

* Gross sales
* Discounts
* Platform commission
* Fees
* Refunds
* Net earnings
* Transactions
* Settlements
* Payout history
* Invoices

---

# 31. Rider Earnings

Riders should see:

* Delivery earnings
* Bonuses/incentives if introduced
* Adjustments
* Completed deliveries
* Available balance
* Payout history

---

# 32. Notifications

Notifications should support relevant events such as:

### Customer

* Order created
* Restaurant accepted
* Preparing
* Ready
* Rider assigned
* Rider picked up
* Out for delivery
* Delivered
* Cancellation
* Payment
* Promotions

### Restaurant

* New order
* Cancellation
* Rider assigned
* Rider arriving/pickup
* Payment/settlement
* System announcements

### Rider

* New delivery offer
* Assignment
* Pickup reminders
* Delivery updates
* Earnings
* Account notifications

---

# 33. Real-Time Updates

Important order/delivery information should update in real time where appropriate.

Examples:

```text
Order status
Rider assignment
Rider location
Delivery status
New restaurant order
Dispatch offers
```

Use a real-time mechanism such as WebSockets.

---

# 34. Maps & Location

Location capabilities include:

* Customer address
* Restaurant location
* Rider location
* Distance calculation
* Delivery route
* Rider tracking
* Dispatch radius
* Geospatial rider discovery

Location must be validated server-side where necessary.

---

# 35. Reviews & Ratings

Customers can review completed orders.

Support:

* Rating
* Review
* Review history
* Restaurant response
* Reporting
* Admin moderation

Reviews should normally only be associated with valid completed orders.

---

# 36. Promotions

V1 supports:

* Promotion creation
* Promotion activation/deactivation
* Start/end dates
* Eligibility
* Discount rules
* Usage limits
* Restaurant promotions

The backend validates all promotion conditions.

---

# 37. Support

Support includes:

* Help Center
* Help articles
* Support tickets
* Ticket details
* Support conversation
* Admin support management

---

# 38. Audit Logs

Important actions must be auditable.

Examples:

```text
Admin login
Restaurant approval
Restaurant rejection
Order cancellation
Refund
Payment adjustment
Settlement adjustment
Risk restriction
Account restriction
Permission change
Business rule change
```

Audit records should include relevant:

* Actor
* Action
* Entity
* Timestamp
* Previous state
* New state
* Metadata/reason

---

# 39. Security Requirements

Security is a V1 requirement, not a future feature.

Must include:

* Authentication
* Authorization
* Role-based access control
* Server-side validation
* Input validation
* Rate limiting
* Secure password handling
* Token/session security
* Sensitive data protection
* Payment security
* File upload validation
* Audit logs
* API security
* Protection against unauthorized resource access

Most importantly:

> **Frontend permissions are not security.**

Every sensitive operation must be authorized by the backend.

---

# 40. Database Principles

The database must maintain reliable records for:

* Users
* Customer profiles
* Addresses
* Restaurants
* Restaurant staff
* Restaurant onboarding
* Restaurant documents
* Restaurant bank information
* Menus
* Categories
* Items
* Add-ons
* Variations
* Orders
* Order items
* Order status history
* Payments
* Refunds
* Riders
* Deliveries
* Rider locations
* Dispatch offers
* Assignments
* Promotions
* Reviews
* Notifications
* Earnings
* Settlements
* Payouts
* Risk events
* Risk flags
* Risk rules
* Support tickets
* Audit logs

Financial and historical records should generally be immutable rather than overwritten.

---

# 41. Backend Architecture Principle

For V1:

> **Use a modular monolith rather than microservices.**

The backend should still have strong internal module boundaries.

Possible modules:

```text
Auth
Users
Customers
Restaurants
Restaurant Staff
Menu
Orders
Cancellation
Payments
Riders
Delivery
Dispatch
Risk
Notifications
Earnings
Settlements
Promotions
Reviews
Support
Admin
Audit
```

This gives us simpler deployment while keeping the system ready to split into services later if necessary.

---

# 42. Core Internal Events

The architecture should support events such as:

```text
UserRegistered
UserVerified

RestaurantSubmitted
RestaurantApproved
RestaurantRejected

OrderCreated
OrderAccepted
OrderPreparing
OrderReady

DispatchStarted
DeliveryOffered
RiderAssigned

OrderPickedUp
OrderOutForDelivery
OrderDelivered

OrderCancelled

PaymentSucceeded
PaymentFailed
RefundCreated

RiskFlagCreated
RiskRestrictionApplied

SettlementCreated
PayoutCompleted
```

---

# 43. API Principles

APIs must have:

* Versioning
* Authentication
* Authorization
* Validation
* Consistent response format
* Consistent error format
* Pagination
* Filtering
* Sorting
* Idempotency where required
* Rate limiting
* Request tracing

Critical operations such as payment/order creation must be protected against duplicate requests.

---

# 44. Admin Configuration

Business rules should be configurable where practical.

Examples:

* Cancellation rules
* Dispatch radius
* Dispatch timeout
* COD risk threshold
* Refund rules
* Platform fees
* Restaurant commission
* Delivery fees
* Promotion limits
* Risk thresholds

Avoid scattering magic numbers throughout the codebase.

---

# 45. V1 Scope

## Included

### Customer

* Authentication
* Profile
* Addresses
* Restaurant discovery
* Search
* Menu
* Cart
* Checkout
* Online payment
* COD
* Orders
* Tracking
* Cancellation according to rules
* Notifications
* Reviews
* Support

### Restaurant

* Authentication
* Onboarding
* Verification
* Restaurant profile
* Menu
* Orders
* Availability
* Promotions
* Staff/operator
* Earnings
* Settlements
* Analytics
* Reviews
* Notifications
* Support
* Settings

### Rider

* Authentication
* Onboarding
* Verification
* Documents
* Online/offline
* Dispatch
* Delivery offers
* Pickup
* Delivery
* Location
* Earnings
* History
* Notifications

### Admin

* Dashboard
* Users
* Restaurants
* Riders
* Orders
* Payments
* Refunds
* Settlements
* Promotions
* Reviews
* Support
* Risk
* Reports
* Configuration
* Audit logs

---

# 46. Explicit V1 Exclusions

To keep V1 achievable, we should initially exclude:

* AI recommendations
* AI voice ordering
* Loyalty program
* Subscription plans
* Corporate accounts
* Multi-restaurant cart
* Advanced advertising marketplace
* Complex restaurant advertising bidding
* Advanced AI fraud detection
* Complex predictive analytics
* Grocery marketplace
* Pharmacy marketplace
* Multi-country support
* Multi-currency marketplace
* Cryptocurrency payments

These can be considered after the core marketplace is stable.

---

# 47. Definition of Done

A feature is **not complete** simply because the UI works.

A feature is complete only when:

```text
UI
+
API
+
Backend Logic
+
Database
+
Validation
+
Authorization
+
Error Handling
+
Notifications where required
+
Logging
+
Testing
+
Security
```

are implemented.

---

# 48. Golden End-to-End Test

The most important V1 integration test is:

```text
Customer registers
↓
Customer finds restaurant
↓
Customer selects food
↓
Customer checks out
↓
Payment/COD validation
↓
Risk check
↓
Order created
↓
Restaurant receives order
↓
Restaurant accepts
↓
Restaurant prepares
↓
Restaurant marks ready
↓
Dispatch Engine searches nearby riders
↓
Eligible rider receives offer
↓
Rider accepts
↓
Rider reaches restaurant
↓
Rider picks up
↓
Rider travels to customer
↓
Rider completes delivery
↓
Customer receives order
↓
Customer reviews
↓
Restaurant earnings recorded
↓
Rider earnings recorded
↓
Settlement records generated
```

**If this flow does not work reliably, QuickBite V1 is not ready for production.**

---

# 49. V1 Success Criteria

QuickBite V1 should be capable of reliably completing:

**Customer → Restaurant → Dispatch → Rider → Delivery → Payment → Earnings**

while maintaining:

* Correct authorization
* Correct financial calculations
* Correct order state transitions
* Correct cancellation enforcement
* Correct rider dispatch
* Risk controls
* Auditability
* Error recovery
* Real-time updates
* Production monitoring

---
