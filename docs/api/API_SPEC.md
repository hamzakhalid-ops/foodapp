# QuickBite V1 — API Specification

**Document:** `docs/api/API_SPEC.md`

Implementation details for open points: `docs/api/API_IMPLEMENTATION_NOTES.md`.
**Version:** 1.0
**Status:** Approved for Implementation
**Product:** QuickBite Food Delivery Platform
**API Base:** `/api/v1`

---

# 1. Purpose

This document defines the authoritative API contract for QuickBite V1.

It specifies:

* API versioning
* Authentication
* Authorization
* Roles and permissions
* Request and response formats
* Validation
* Pagination
* Filtering
* Sorting
* Error handling
* Idempotency
* Customer APIs
* Restaurant APIs
* Rider APIs
* Admin APIs
* Order lifecycle APIs
* Payment APIs
* Dispatch APIs
* Trust & Risk APIs
* Promotions
* Reviews
* Notifications
* Support
* Earnings
* Settlements
* WebSockets/realtime events
* Webhooks
* Security requirements

Backend implementation must follow this specification.

If implementation requirements conflict with this document, the conflict must be identified before code is changed.

---

# 2. API Architecture

## 2.1 Base URL

Production:

```text
https://api.quickbite.example/api/v1
```

Staging:

```text
https://staging-api.quickbite.example/api/v1
```

Development:

```text
http://localhost:<port>/api/v1
```

The actual production domain is deployment configuration and must not be hard-coded into application business logic.

---

# 3. API Versioning

All public APIs use:

```text
/api/v1
```

Example:

```text
GET /api/v1/restaurants
```

A breaking API change requires a new API version.

Examples:

```text
/api/v1
/api/v2
```

Do not silently change the meaning of an existing V1 endpoint.

Non-breaking additions may be introduced within V1 when backward compatibility is preserved.

---

# 4. Transport

## 4.1 Protocol

Production APIs must use HTTPS.

HTTP is permitted only for local development where appropriate.

## 4.2 Content Type

Requests containing JSON:

```http
Content-Type: application/json
```

Responses:

```http
Content-Type: application/json
```

File uploads use:

```http
Content-Type: multipart/form-data
```

or signed object-storage upload workflows.

---

# 5. Authentication

QuickBite uses token-based authentication.

Recommended architecture:

```text
Access Token
+
Refresh Token
+
Server-side session/revocation capability
```

The exact token implementation is defined by the authentication architecture, but clients must never be trusted merely because they possess a token.

Authentication establishes identity.

Authorization determines what that identity can do.

---

# 6. Roles

V1 roles:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
ADMIN
SUPER_ADMIN
```

Restaurant Manager, Order Staff, and Kitchen Staff are NOT separate V1 roles.

They are represented by:

```text
RESTAURANT_OPERATOR
```

---

# 7. Authorization Model

Every protected request must pass through:

```text
Authentication
    ↓
Identity
    ↓
Role
    ↓
Permission
    ↓
Resource Ownership / Tenant Isolation
    ↓
Business Rule
```

Example:

A restaurant operator requesting:

```text
GET /restaurants/{restaurantId}/orders
```

must satisfy:

```text
Authenticated
AND
RESTAURANT_OPERATOR
AND
operator belongs to restaurantId
AND
restaurant is accessible
```

Frontend route protection is not sufficient.

Authorization must be enforced by the backend.

---

# 8. Standard Success Response

Successful single-resource response:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Example:

```json
{
  "success": true,
  "data": {
    "id": "ord_123",
    "status": "PREPARING"
  },
  "meta": {}
}
```

`meta` may be omitted when unnecessary.

---

# 9. Standard List Response

```json
{
  "success": true,
  "data": [],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

# 10. Cursor Pagination

For high-volume resources, cursor pagination should be preferred.

Example:

```text
GET /api/v1/orders?limit=20&cursor=abc123
```

Response:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "pagination": {
      "limit": 20,
      "nextCursor": "xyz456",
      "hasMore": true
    }
  }
}
```

Cursor pagination should be used for resources such as:

* notifications
* order history
* audit logs
* support messages
* transaction history
* rider location history where exposed

---

# 11. Standard Error Response

All API errors must follow a consistent structure.

```json
{
  "success": false,
  "error": {
    "code": "ORDER_INVALID_STATUS",
    "message": "This order cannot be cancelled in its current state.",
    "details": {},
    "requestId": "req_123"
  }
}
```

`requestId` must allow the request to be correlated with backend logs.

---

# 12. HTTP Status Codes

Use standard HTTP semantics.

```text
200 OK
201 Created
202 Accepted
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests

500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
```

Do not return `200` for business failures.

---

# 13. Standard Error Codes

## Authentication

```text
AUTH_INVALID_CREDENTIALS
AUTH_ACCOUNT_DISABLED
AUTH_ACCOUNT_SUSPENDED
AUTH_TOKEN_INVALID
AUTH_TOKEN_EXPIRED
AUTH_REFRESH_TOKEN_INVALID
AUTH_EMAIL_NOT_VERIFIED
AUTH_PHONE_NOT_VERIFIED
AUTH_VERIFICATION_CODE_INVALID
AUTH_VERIFICATION_CODE_EXPIRED
AUTH_TOO_MANY_ATTEMPTS
AUTH_PASSWORD_RESET_INVALID
AUTH_ACCOUNT_ALREADY_EXISTS
AUTH_PASSWORD_POLICY_VIOLATION
```

`AUTH_ACCOUNT_ALREADY_EXISTS` and `AUTH_PASSWORD_POLICY_VIOLATION` were added in Phase 20 (Slice 1). `AUTH_TOKEN_INVALID` is also returned for revoked or expired sessions; `AUTH_ACCOUNT_DISABLED` corresponds to user status `DEACTIVATED`.

## Authorization

```text
AUTHZ_FORBIDDEN
AUTHZ_INSUFFICIENT_PERMISSION
AUTHZ_RESOURCE_ACCESS_DENIED
```

## Validation

```text
VALIDATION_ERROR
INVALID_REQUEST
INVALID_PARAMETER
INVALID_ID
INVALID_DATE_RANGE
INVALID_FILE
```

## Resource

```text
RESOURCE_NOT_FOUND
USER_NOT_FOUND
RESTAURANT_NOT_FOUND
MENU_ITEM_NOT_FOUND
ORDER_NOT_FOUND
RIDER_NOT_FOUND
DELIVERY_NOT_FOUND
PAYMENT_NOT_FOUND
PROMOTION_NOT_FOUND
REVIEW_NOT_FOUND
SUPPORT_TICKET_NOT_FOUND
```

## Restaurant

```text
RESTAURANT_NOT_AVAILABLE
RESTAURANT_NOT_APPROVED
RESTAURANT_ALREADY_ONLINE
RESTAURANT_ALREADY_OFFLINE
RESTAURANT_CLOSED
RESTAURANT_PAUSED
RESTAURANT_SUSPENDED
```

## Order

```text
ORDER_INVALID_STATUS
ORDER_CANCELLATION_NOT_ALLOWED
ORDER_ALREADY_CANCELLED
ORDER_ALREADY_COMPLETED
ORDER_NOT_MODIFIABLE
ORDER_ITEM_UNAVAILABLE
ORDER_MINIMUM_NOT_MET
ORDER_RECALCULATION_REQUIRED
ORDER_DUPLICATE
ORDER_STATE_CHANGED
```

## Cart / Location

```text
CART_RESTAURANT_MISMATCH
INVALID_VARIATION
INVALID_ADD_ON
ADDRESS_NOT_SERVICEABLE
```

`ORDER_STATE_CHANGED`, `CART_RESTAURANT_MISMATCH`, `INVALID_VARIATION` and `INVALID_ADD_ON` come from
ORDER_RULES §4.1, §23, §35 and `ADDRESS_NOT_SERVICEABLE` from MAPS_LOCATION_SPEC; they were added
to this catalogue in Phase 20 (Slice 5). Where ORDER_RULES uses a different spelling for an existing
code, this catalogue wins: `ORDER_MINIMUM_NOT_MET` (not `MINIMUM_ORDER_NOT_MET`),
`ORDER_ITEM_UNAVAILABLE` (not `MENU_ITEM_UNAVAILABLE`), `RESTAURANT_NOT_AVAILABLE` (not
`RESTAURANT_NOT_ORDERABLE`).

## Promotion

```text
PROMOTION_INACTIVE
PROMOTION_NOT_STARTED
PROMOTION_EXPIRED
PROMOTION_NOT_ELIGIBLE
PROMOTION_USAGE_LIMIT_REACHED
```

Added in Phase 20 (promotions slice) from PROMOTION_RULES §50 / PROMOTION_SPEC. Unknown codes and
codes of another restaurant return `PROMOTION_NOT_FOUND`; an unmet promotion minimum returns
`PROMOTION_NOT_ELIGIBLE` with `details.reason = MINIMUM_ORDER_NOT_MET`; the per-customer limit
returns `PROMOTION_USAGE_LIMIT_REACHED` with `details.scope = CUSTOMER`.

## Review

```text
REVIEW_NOT_ELIGIBLE
REVIEW_ALREADY_EXISTS
REVIEW_ALREADY_REMOVED
REVIEW_REPORT_INVALID
```

Added in Phase 20 (reviews slice) from REVIEW_RULES §44. Other review cases use the existing codes:
`REVIEW_NOT_FOUND`, `ORDER_NOT_FOUND` (not the caller's order), `VALIDATION_ERROR` (rating/content).

## Payment

```text
PAYMENT_REQUIRED
PAYMENT_FAILED
PAYMENT_DECLINED
PAYMENT_ALREADY_PROCESSED
PAYMENT_INVALID_AMOUNT
PAYMENT_PROVIDER_ERROR
REFUND_NOT_ALLOWED
REFUND_FAILED
```

## Dispatch

```text
DISPATCH_NOT_AVAILABLE
RIDER_NOT_ELIGIBLE
RIDER_NOT_AVAILABLE
DISPATCH_OFFER_EXPIRED
DISPATCH_OFFER_ALREADY_RESPONDED
DELIVERY_ALREADY_ASSIGNED
DELIVERY_NOT_ASSIGNABLE
```

## Risk

```text
RISK_RESTRICTION_ACTIVE
RISK_VERIFICATION_REQUIRED
ORDER_RESTRICTED
COD_RESTRICTED
ACCOUNT_RESTRICTED
```

## Idempotency

```text
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_REUSED
IDEMPOTENCY_REQUEST_MISMATCH
```

## System

```text
RATE_LIMITED
INTERNAL_ERROR
```

`RATE_LIMITED` (HTTP 429) may include `details.retryAfterSeconds` and a `Retry-After` header (AUTH_AUTHORIZATION §19). `INTERNAL_ERROR` is used for unexpected failures (HTTP 500) and for dependency unavailability (HTTP 503). Added in Phase 20 from ARCHITECTURE §48.

---

# 14. Request IDs

Every API request must have or receive a request identifier.

Recommended header:

```http
X-Request-ID: req_123
```

If the client does not provide one, the backend generates one.

The request ID must be included in error responses.

---

# 15. Idempotency

Idempotency is required for operations where duplicate execution could cause financial or business damage.

Header:

```http
Idempotency-Key: <unique-key>
```

Required for:

* order creation
* payment creation
* payment confirmation where applicable
* refunds
* payout initiation
* settlement processing
* other explicitly configured financial operations

Example:

```http
POST /api/v1/orders
Idempotency-Key: order-create-abc123
```

The backend must store the request hash and resulting response.

If the same key is reused with a different request:

```text
IDEMPOTENCY_REQUEST_MISMATCH
```

---

# 16. Authentication APIs

## 16.1 Customer Registration

```http
POST /api/v1/auth/register
```

Auth:

```text
Public
```

Request:

```json
{
  "email": "customer@example.com",
  "phone": "+923001234567",
  "password": "StrongPassword",
  "firstName": "Ali",
  "lastName": "Khan"
}
```

Response:

```text
201 Created
```

```json
{
  "success": true,
  "data": {
    "user": {},
    "verification": {
      "phoneRequired": true,
      "emailRequired": true
    }
  }
}
```

Validation:

* valid email
* valid phone
* password policy
* unique email
* unique phone
* required name fields

Behavior (Phase 20, Slice 1):

* Creates the user with role `CUSTOMER`, status `PENDING_VERIFICATION`, and a `customer_profiles` record.
* Sends a phone OTP and an email verification token.
* Does **not** return tokens; the client logs in (§17) and then verifies the phone (§20).
* `user` has the shape of §25.
* Errors: `400 VALIDATION_ERROR`, `400 AUTH_PASSWORD_POLICY_VIOLATION`, `409 AUTH_ACCOUNT_ALREADY_EXISTS` (does not say which field matched), `429 RATE_LIMITED`.

---

# 17. Login

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "identifier": "customer@example.com",
  "password": "StrongPassword"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 900,
    "user": {}
  }
}
```

Never return password hashes.

Behavior (Phase 20, Slice 1):

* `identifier` is an email address or a phone number.
* `expiresIn` is the access-token lifetime in seconds. `user` has the shape of §25.
* Accounts in `PENDING_VERIFICATION` may log in (to verify their phone); `RESTRICTED` accounts may log in and are limited by business rules elsewhere.
* Errors: `401 AUTH_INVALID_CREDENTIALS` (unknown account and wrong password are indistinguishable), `403 AUTH_ACCOUNT_SUSPENDED`, `403 AUTH_ACCOUNT_DISABLED`, `429 RATE_LIMITED`.
* Protected requests send `Authorization: Bearer <accessToken>`.

---

# 18. Refresh Token

```http
POST /api/v1/auth/refresh
```

Request:

```json
{
  "refreshToken": "..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 900
  }
}
```

Every successful refresh rotates the refresh token; the presented token can never be used again. Reusing an already-rotated token revokes the whole session (AUTH_AUTHORIZATION §25).

Errors: `401 AUTH_REFRESH_TOKEN_INVALID` (unknown, expired, reused or revoked), `403 AUTH_ACCOUNT_SUSPENDED`, `403 AUTH_ACCOUNT_DISABLED`, `429 RATE_LIMITED`.

---

# 19. Logout

```http
POST /api/v1/auth/logout
```

Auth:

```text
Authenticated
```

The session/refresh token must be invalidated according to the authentication architecture.

Revokes the session of the presented access token. Response: `204 No Content`.

---

# 20. Verify Phone

```http
POST /api/v1/auth/verify-phone
```

Auth:

```text
Authenticated
```

A code alone does not identify an account, so the caller must be logged in. Success sets `phone_verified_at` and activates a `PENDING_VERIFICATION` account (DATABASE.md §5.3); response data has the shape of §25.

Errors: `400 AUTH_VERIFICATION_CODE_INVALID`, `400 AUTH_VERIFICATION_CODE_EXPIRED`, `429 AUTH_TOO_MANY_ATTEMPTS` (challenge attempt limit reached), `429 RATE_LIMITED`.

Request:

```json
{
  "code": "123456"
}
```

---

# 21. Resend Phone Verification

```http
POST /api/v1/auth/verify-phone/resend
```

Auth: Authenticated. Rate limited. Invalidates the previous code. Response: `202 Accepted`.

---

# 22. Verify Email

```http
POST /api/v1/auth/verify-email
```

Auth: Public (the token identifies the challenge). Errors: `400 AUTH_VERIFICATION_CODE_INVALID`, `400 AUTH_VERIFICATION_CODE_EXPIRED`. Response: `204 No Content`.

Request:

```json
{
  "token": "..."
}
```

---

# 23. Forgot Password

```http
POST /api/v1/auth/forgot-password
```

Request:

```json
{
  "identifier": "customer@example.com"
}
```

Response should not reveal whether an account exists.

Response: always `202 Accepted` for a well-formed request. When the account exists, a reset token is sent to the channel matching the identifier (email or phone).

---

# 24. Reset Password

```http
POST /api/v1/auth/reset-password
```

Request:

```json
{
  "token": "...",
  "newPassword": "NewStrongPassword"
}
```

Success sets the new password, consumes the token and revokes **all** sessions of the user. Response: `204 No Content`.

Errors: `400 AUTH_PASSWORD_RESET_INVALID` (unknown, used or expired token), `400 AUTH_PASSWORD_POLICY_VIOLATION`, `429 RATE_LIMITED`.

---

# 25. Current User

```http
GET /api/v1/me
```

Auth:

```text
Authenticated
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "usr_123",
    "email": "customer@example.com",
    "phone": "+923001234567",
    "roles": ["CUSTOMER"],
    "status": "ACTIVE"
  }
}
```

---

# 26. Customer Profile APIs

## Get Profile

```http
GET /api/v1/customer/profile
```

## Update Profile

```http
PATCH /api/v1/customer/profile
```

Request:

```json
{
  "firstName": "Ali",
  "lastName": "Khan",
  "profileImageUrl": "..."
}
```

The backend validates ownership.

---

# 27. Customer Address APIs

## List Addresses

```http
GET /api/v1/customer/addresses
```

## Create Address

```http
POST /api/v1/customer/addresses
```

Request:

```json
{
  "label": "Home",
  "recipientName": "Ali Khan",
  "phone": "+923001234567",
  "addressLine1": "Example Street",
  "addressLine2": "",
  "area": "Model Town",
  "city": "Lahore",
  "postalCode": "54000",
  "latitude": 31.48,
  "longitude": 74.32,
  "deliveryInstructions": "Call on arrival",
  "isDefault": true
}
```

Coordinates must be validated.

## Update Address

```http
PATCH /api/v1/customer/addresses/{addressId}
```

## Delete Address

```http
DELETE /api/v1/customer/addresses/{addressId}
```

## Set Default Address

```http
POST /api/v1/customer/addresses/{addressId}/default
```

---

# 28. Restaurant Discovery

## List Restaurants

```http
GET /api/v1/restaurants
```

Query:

```text
latitude
longitude
radius
search
cuisine
status
sort
page
pageSize
cursor
```

Example:

```text
GET /api/v1/restaurants?latitude=31.48&longitude=74.32&radius=5&sort=distance
```

The backend determines actual restaurant availability.

---

# 29. Restaurant Details

```http
GET /api/v1/restaurants/{restaurantId}
```

Public information may include:

* restaurant name
* description
* logo
* cover
* cuisines
* rating
* operating status
* delivery fee
* minimum order
* estimated preparation/delivery information

Sensitive restaurant data must never be returned.

---

# 30. Restaurant Menu

```http
GET /api/v1/restaurants/{restaurantId}/menu
```

Only active and customer-visible menu data is returned.

Unavailable items must be represented according to product requirements.

---

# 31. Search

```http
GET /api/v1/search
```

Query:

```text
q
latitude
longitude
radius
type
page
pageSize
```

Search types:

```text
RESTAURANT
MENU_ITEM
ALL
```

V1 may use PostgreSQL-based search.

---

# 32. Customer Cart

Cart is server-authoritative.

## Get Cart

```http
GET /api/v1/cart
```

## Add Item

```http
POST /api/v1/cart/items
```

Request:

```json
{
  "restaurantId": "rest_123",
  "menuItemId": "item_123",
  "quantity": 2,
  "variationIds": ["var_1"],
  "addOnIds": ["addon_1"]
}
```

The backend must:

* verify restaurant
* verify item
* verify item availability
* verify variations
* verify add-ons
* calculate prices
* calculate subtotal
* apply applicable rules

Client-submitted prices are ignored.

---

# 33. Update Cart Item

```http
PATCH /api/v1/cart/items/{cartItemId}
```

Request:

```json
{
  "quantity": 3
}
```

---

# 34. Remove Cart Item

```http
DELETE /api/v1/cart/items/{cartItemId}
```

---

# 35. Clear Cart

```http
DELETE /api/v1/cart
```

---

# 36. Cart Recalculation

```http
POST /api/v1/cart/recalculate
```

Backend recalculates:

```text
item prices
+
variation prices
+
add-ons
+
subtotal
+
promotion
+
delivery fee
+
tax
+
service fee
=
total
```

---

# 37. Checkout Preview

```http
POST /api/v1/checkout/preview
```

Request:

```json
{
  "addressId": "addr_123",
  "paymentMethod": "COD",
  "promotionCode": "SAVE10"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "subtotal": "1500.00",
    "discount": "100.00",
    "deliveryFee": "150.00",
    "tax": "0.00",
    "serviceFee": "50.00",
    "total": "1600.00",
    "currency": "PKR",
    "paymentMethod": "COD"
  }
}
```

The preview is not an order.

---

# 38. Create Order

```http
POST /api/v1/orders
```

Required:

```http
Idempotency-Key
```

Request:

```json
{
  "addressId": "addr_123",
  "paymentMethod": "COD",
  "promotionCode": "SAVE10",
  "instructions": "Call on arrival"
}
```

The backend must perform a transaction covering:

1. customer validation
2. address validation
3. restaurant validation
4. restaurant availability
5. menu availability
6. price recalculation
7. promotion validation
8. risk evaluation
9. payment requirements
10. order creation
11. order items
12. status history
13. payment record where applicable
14. outbox event

The client must not submit:

```text
subtotal
discount
deliveryFee
tax
serviceFee
total
commission
restaurant earnings
rider earnings
```

as authoritative values.

---

# 39. Get Order

```http
GET /api/v1/orders/{orderId}
```

Access:

```text
Customer: own orders
Restaurant: own restaurant orders
Rider: assigned delivery orders
Admin: authorized administrative access
```

---

# 40. Customer Order History

```http
GET /api/v1/customer/orders
```

Query:

```text
status
from
to
cursor
limit
```

---

# 41. Order Status

```http
GET /api/v1/orders/{orderId}/status
```

Returns:

```text
current status
status history
timestamps
delivery status
rider information where appropriate
```

---

# 42. Order Lifecycle

V1 order states:

```text
PENDING
RESTAURANT_ACCEPTED
PREPARING
READY_FOR_PICKUP
RIDER_ASSIGNED
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
```

Cancellation states:

```text
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

Only valid state transitions are permitted.

The backend is authoritative.

---

# 43. Customer Cancellation

```http
POST /api/v1/orders/{orderId}/cancel
```

Request:

```json
{
  "reasonCode": "CHANGED_MIND",
  "reason": "Optional explanation"
}
```

The Cancellation Rules Engine determines whether cancellation is allowed.

Typical V1 behavior:

```text
PENDING
→ customer may cancel subject to payment/refund rules

RESTAURANT_ACCEPTED
→ restricted/configurable

PREPARING
→ normally not customer-cancellable

READY_FOR_PICKUP
→ not customer-cancellable

RIDER_ASSIGNED
→ not customer-cancellable

PICKED_UP
→ not customer-cancellable

OUT_FOR_DELIVERY
→ not customer-cancellable

DELIVERED
→ not applicable
```

Admin/support intervention may be permitted for legitimate operational cases.

Every administrative cancellation must be audited.

---

# 44. Restaurant Authentication / Registration

```http
POST /api/v1/restaurant/auth/register
```

Request:

```json
{
  "email": "restaurant@example.com",
  "phone": "+923001234567",
  "password": "StrongPassword",
  "ownerFirstName": "Ali",
  "ownerLastName": "Khan"
}
```

The created account begins the restaurant onboarding process.

---

# 45. Restaurant Onboarding

## Create Restaurant

```http
POST /api/v1/restaurant/onboarding
```

## Get Onboarding

```http
GET /api/v1/restaurant/onboarding
```

## Update Basic Information

```http
PATCH /api/v1/restaurant/onboarding/basic-information
```

## Update Address

```http
PATCH /api/v1/restaurant/onboarding/address
```

## Update Map Location

```http
PATCH /api/v1/restaurant/onboarding/location
```

## Update Operating Hours

```http
PATCH /api/v1/restaurant/onboarding/operating-hours
```

## Update Delivery Configuration

```http
PATCH /api/v1/restaurant/onboarding/delivery
```

## Update Business Information

```http
PATCH /api/v1/restaurant/onboarding/business
```

## Upload Document

```http
POST /api/v1/restaurant/onboarding/documents
```

## Update Payment Information

```http
PATCH /api/v1/restaurant/onboarding/payment
```

## Submit Application

```http
POST /api/v1/restaurant/onboarding/submit
```

Submission changes the application to:

```text
SUBMITTED
```

and then administrative processing may move it to:

```text
UNDER_REVIEW
```

---

# 46. Restaurant Application Status

```http
GET /api/v1/restaurant/application
```

Possible states:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
RESUBMISSION_REQUIRED
```

---

# 47. Restaurant Profile

## Get Profile

```http
GET /api/v1/restaurant/profile
```

## Update Profile

```http
PATCH /api/v1/restaurant/profile
```

Only authorized restaurant users may update permitted fields.

Sensitive financial/account information requires appropriate permission.

---

# 48. Restaurant Operating Hours

```http
GET /api/v1/restaurant/operating-hours
```

```http
PUT /api/v1/restaurant/operating-hours
```

Request:

```json
{
  "hours": [
    {
      "dayOfWeek": 1,
      "opensAt": "09:00",
      "closesAt": "23:00",
      "isClosed": false
    }
  ]
}
```

---

# 49. Restaurant Availability

## Get Status

```http
GET /api/v1/restaurant/availability
```

## Go Online

```http
POST /api/v1/restaurant/availability/online
```

## Go Offline

```http
POST /api/v1/restaurant/availability/offline
```

## Temporary Pause

```http
POST /api/v1/restaurant/availability/pause
```

Request:

```json
{
  "durationMinutes": 30,
  "reason": "Kitchen busy"
}
```

Restaurant status:

```text
OFFLINE
ONLINE
TEMPORARILY_PAUSED
CLOSED
SUSPENDED
```

Backend determines whether a restaurant is actually orderable.

---

# 50. Restaurant Menu APIs

## Categories

```http
GET /api/v1/restaurant/menu/categories
POST /api/v1/restaurant/menu/categories
PATCH /api/v1/restaurant/menu/categories/{categoryId}
DELETE /api/v1/restaurant/menu/categories/{categoryId}
```

## Items

```http
GET /api/v1/restaurant/menu/items
POST /api/v1/restaurant/menu/items
GET /api/v1/restaurant/menu/items/{itemId}
PATCH /api/v1/restaurant/menu/items/{itemId}
DELETE /api/v1/restaurant/menu/items/{itemId}
```

## Add-ons

```http
GET /api/v1/restaurant/menu/items/{itemId}/add-ons
POST /api/v1/restaurant/menu/items/{itemId}/add-ons
PATCH /api/v1/restaurant/menu/add-ons/{addOnId}
DELETE /api/v1/restaurant/menu/add-ons/{addOnId}
```

## Variations

```http
GET /api/v1/restaurant/menu/items/{itemId}/variations
POST /api/v1/restaurant/menu/items/{itemId}/variations
PATCH /api/v1/restaurant/menu/variations/{variationId}
DELETE /api/v1/restaurant/menu/variations/{variationId}
```

## Item Availability

```http
POST /api/v1/restaurant/menu/items/{itemId}/availability
```

Request:

```json
{
  "available": false
}
```

---

# 51. Restaurant Order APIs

## New Orders

```http
GET /api/v1/restaurant/orders/new
```

## All Restaurant Orders

```http
GET /api/v1/restaurant/orders
```

Query:

```text
status
from
to
search
cursor
limit
```

## Order Details

```http
GET /api/v1/restaurant/orders/{orderId}
```

---

# 52. Accept Order

```http
POST /api/v1/restaurant/orders/{orderId}/accept
```

Optional request:

```json
{
  "estimatedPreparationMinutes": 25
}
```

Backend validates:

* restaurant ownership
* order status
* restaurant status
* payment requirements
* risk restrictions
* order validity

Transition:

```text
PENDING
→
RESTAURANT_ACCEPTED
```

---

# 53. Reject Order

```http
POST /api/v1/restaurant/orders/{orderId}/reject
```

Request:

```json
{
  "reasonCode": "ITEM_UNAVAILABLE",
  "reason": "Optional explanation"
}
```

Creates cancellation/rejection records according to business rules.

---

# 54. Start Preparing

```http
POST /api/v1/restaurant/orders/{orderId}/preparing
```

Transition:

```text
RESTAURANT_ACCEPTED
→
PREPARING
```

---

# 55. Mark Ready

```http
POST /api/v1/restaurant/orders/{orderId}/ready
```

Transition:

```text
PREPARING
→
READY_FOR_PICKUP
```

This event triggers the Delivery Dispatch Engine.

---

# 56. Restaurant Order Cancellation

```http
POST /api/v1/restaurant/orders/{orderId}/cancel
```

The Cancellation Rules Engine validates the operation.

Admin-configured policies determine refund and financial consequences.

---

# 57. Restaurant Staff APIs

## List Staff

```http
GET /api/v1/restaurant/staff
```

## Add Staff

```http
POST /api/v1/restaurant/staff
```

Request:

```json
{
  "email": "operator@example.com",
  "role": "OPERATOR"
}
```

## Staff Details

```http
GET /api/v1/restaurant/staff/{staffId}
```

## Update Staff

```http
PATCH /api/v1/restaurant/staff/{staffId}
```

## Remove Staff

```http
DELETE /api/v1/restaurant/staff/{staffId}
```

V1 restaurant roles:

```text
OWNER
OPERATOR
```

Owner retains sensitive financial/account access unless explicit permissions are later introduced.

---

# 58. Restaurant Promotions

## List Promotions

```http
GET /api/v1/restaurant/promotions
```

## Create Promotion

```http
POST /api/v1/restaurant/promotions
```

Request:

```json
{
  "name": "10% Off",
  "description": "10 percent discount",
  "type": "PERCENTAGE",
  "value": "10.00",
  "minimumOrderAmount": "500.00",
  "maximumDiscount": "300.00",
  "usageLimit": 100,
  "startsAt": "2026-10-01T00:00:00Z",
  "endsAt": "2026-10-31T23:59:59Z"
}
```

## Get Promotion

```http
GET /api/v1/restaurant/promotions/{promotionId}
```

## Update Promotion

```http
PATCH /api/v1/restaurant/promotions/{promotionId}
```

## Disable Promotion

```http
POST /api/v1/restaurant/promotions/{promotionId}/disable
```

---

# 59. Earnings APIs

## Restaurant Earnings Overview

```http
GET /api/v1/restaurant/earnings
```

Query:

```text
from
to
```

## Transactions

```http
GET /api/v1/restaurant/earnings/transactions
```

## Commission and Fees

```http
GET /api/v1/restaurant/earnings/fees
```

## Earnings Details

```http
GET /api/v1/restaurant/earnings/{earningId}
```

---

# 60. Restaurant Settlements

```http
GET /api/v1/restaurant/settlements
```

```http
GET /api/v1/restaurant/settlements/{settlementId}
```

```http
GET /api/v1/restaurant/payouts
```

```http
GET /api/v1/restaurant/invoices
```

Restaurant clients cannot modify settlement amounts.

---

# 61. Restaurant Analytics

```http
GET /api/v1/restaurant/analytics/overview
GET /api/v1/restaurant/analytics/sales
GET /api/v1/restaurant/analytics/orders
GET /api/v1/restaurant/analytics/popular-items
GET /api/v1/restaurant/analytics/ratings
GET /api/v1/restaurant/analytics/cancellations
```

Query:

```text
from
to
```

Analytics are derived from backend records.

---

# 62. Restaurant Reviews

```http
GET /api/v1/restaurant/reviews
GET /api/v1/restaurant/reviews/{reviewId}
POST /api/v1/restaurant/reviews/{reviewId}/reply
POST /api/v1/restaurant/reviews/{reviewId}/report
```

A restaurant may respond only to reviews associated with that restaurant.

---

# 63. Rider Registration

```http
POST /api/v1/rider/auth/register
```

Request includes required identity/contact information.

---

# 64. Rider Profile

```http
GET /api/v1/rider/profile
PATCH /api/v1/rider/profile
```

---

# 65. Rider Onboarding

```http
GET /api/v1/rider/onboarding
PATCH /api/v1/rider/onboarding
POST /api/v1/rider/onboarding/submit
```

Application states:

```text
PENDING
UNDER_REVIEW
APPROVED
REJECTED
SUSPENDED
```

---

# 66. Rider Documents

```http
GET /api/v1/rider/documents
POST /api/v1/rider/documents
PATCH /api/v1/rider/documents/{documentId}
DELETE /api/v1/rider/documents/{documentId}
```

Sensitive documents must use secure storage and controlled access.

---

# 67. Rider Online/Offline

## Get Availability

```http
GET /api/v1/rider/availability
```

## Go Online

```http
POST /api/v1/rider/availability/online
```

## Go Offline

```http
POST /api/v1/rider/availability/offline
```

The backend verifies:

* rider approved
* account active
* required documents valid
* no account restriction preventing delivery
* required configuration present

---

# 68. Rider Availability

```http
POST /api/v1/rider/availability
```

Request:

```json
{
  "available": true
}
```

Being online does not automatically mean available for a new delivery.

A rider may be:

```text
ONLINE + AVAILABLE
ONLINE + BUSY
OFFLINE
```

---

# 69. Rider Location

```http
POST /api/v1/rider/location
```

Request:

```json
{
  "latitude": 31.48,
  "longitude": 74.32,
  "accuracyMeters": 8
}
```

Current rider location is stored in the real-time/geospatial system.

Historical location storage follows retention policy.

The server must validate location updates.

---

# 70. Dispatch Offers

## Current Offers

```http
GET /api/v1/rider/delivery-offers
```

## Offer Details

```http
GET /api/v1/rider/delivery-offers/{offerId}
```

## Accept Offer

```http
POST /api/v1/rider/delivery-offers/{offerId}/accept
```

## Reject Offer

```http
POST /api/v1/rider/delivery-offers/{offerId}/reject
```

Reject request:

```json
{
  "reasonCode": "TOO_FAR"
}
```

The backend verifies the offer is still valid.

---

# 71. Dispatch Engine Rules

The rider application must never assign itself a delivery.

When restaurant marks an order:

```text
READY_FOR_PICKUP
```

the backend triggers:

```text
Dispatch Engine
```

Flow:

```text
READY
↓
Find eligible riders
↓
Proximity
↓
Online
↓
Available
↓
No conflicting active delivery
↓
Vehicle eligibility
↓
Account status
↓
Risk restrictions
↓
Rank eligible riders
↓
Create offer
↓
Rider accepts
↓
Assignment
```

Do not broadcast every delivery to every rider.

---

# 72. Dispatch Radius

Dispatch settings are configurable.

Example settings:

```text
initial radius
radius increment
maximum radius
offer timeout
maximum attempts
```

The exact production values must be configuration, not hard-coded constants.

---

# 73. Delivery APIs

## Current Delivery

```http
GET /api/v1/rider/delivery/current
```

## Delivery Details

```http
GET /api/v1/deliveries/{deliveryId}
```

## Arriving at Restaurant

```http
POST /api/v1/rider/deliveries/{deliveryId}/arriving
```

## Confirm Pickup

```http
POST /api/v1/rider/deliveries/{deliveryId}/pickup
```

Transition:

```text
RIDER_ASSIGNED
→
PICKED_UP
```

and delivery:

```text
ASSIGNED
→
PICKED_UP
```

## Start Delivery

```http
POST /api/v1/rider/deliveries/{deliveryId}/out-for-delivery
```

## Complete Delivery

```http
POST /api/v1/rider/deliveries/{deliveryId}/complete
```

Completion may require configured proof such as:

* delivery confirmation
* OTP
* photo
* signature

The exact proof mechanism is configurable.

---

# 74. Rider Delivery History

```http
GET /api/v1/rider/deliveries
```

Query:

```text
status
from
to
cursor
limit
```

---

# 75. Rider Earnings

```http
GET /api/v1/rider/earnings
GET /api/v1/rider/earnings/transactions
GET /api/v1/rider/earnings/{earningId}
```

---

# 76. Rider Settlements

```http
GET /api/v1/rider/settlements
GET /api/v1/rider/settlements/{settlementId}
GET /api/v1/rider/payouts
```

---

# 77. Payment Methods

```http
GET /api/v1/payment-methods
```

Supported V1 business methods may include:

```text
COD
ONLINE_PAYMENT
```

The actual online payment providers are infrastructure configuration.

---

# 78. Create Payment

```http
POST /api/v1/payments
```

Required:

```http
Idempotency-Key
```

Request:

```json
{
  "orderId": "ord_123",
  "paymentMethod": "ONLINE_PAYMENT"
}
```

The backend obtains the authoritative amount from the order.

The client cannot specify the payment amount as authoritative.

---

# 79. Payment Details

```http
GET /api/v1/payments/{paymentId}
```

---

# 80. Payment Confirmation

```http
POST /api/v1/payments/{paymentId}/confirm
```

Provider-specific confirmation information may be supplied according to the payment provider integration.

The backend must verify provider state.

Client-side "payment successful" is never authoritative.

---

# 81. Payment Webhook

Provider-specific endpoint:

```http
POST /api/v1/webhooks/payments/{provider}
```

Webhook requirements:

* signature verification
* replay protection
* idempotent processing
* provider event ID tracking
* no trust in client-originated payment claims

---

# 82. Refunds

## Request Refund

```http
POST /api/v1/payments/{paymentId}/refund
```

Required:

```http
Idempotency-Key
```

Request:

```json
{
  "amount": "500.00",
  "reasonCode": "ORDER_CANCELLED"
}
```

Authorization:

```text
ADMIN
SUPER_ADMIN
```

or authorized automated business workflow.

Refund amount must be validated against the payment and refund history.

---

# 83. Trust & Risk Engine

The Risk Engine applies to:

```text
CUSTOMER
RESTAURANT
RIDER
```

Risk architecture:

```text
Subject
↓
Behavior/Event
↓
Risk Event
↓
Risk Rules
↓
Risk Score/Flags
↓
Action
```

---

# 84. Risk Events

Internal/admin API:

```http
POST /api/v1/admin/risk/events
```

Request:

```json
{
  "subjectType": "CUSTOMER",
  "subjectId": "usr_123",
  "eventType": "COD_NON_RECEIPT",
  "metadata": {}
}
```

The public customer application must not be allowed to create arbitrary trusted risk events.

System-generated events are preferred.

---

# 85. Risk Rules

## List

```http
GET /api/v1/admin/risk/rules
```

## Create

```http
POST /api/v1/admin/risk/rules
```

Request:

```json
{
  "name": "Repeated COD Non Receipt",
  "subjectType": "CUSTOMER",
  "eventType": "COD_NON_RECEIPT",
  "threshold": 3,
  "windowSeconds": 2592000,
  "action": "COD_RESTRICTED",
  "severity": "HIGH",
  "enabled": true
}
```

## Update

```http
PATCH /api/v1/admin/risk/rules/{ruleId}
```

Business thresholds must be configurable.

They must not be embedded in application source code.

---

# 86. Risk Flags

```http
GET /api/v1/admin/risk/flags
GET /api/v1/admin/risk/flags/{flagId}
POST /api/v1/admin/risk/flags/{flagId}/resolve
POST /api/v1/admin/risk/flags/{flagId}/dismiss
```

---

# 87. Risk Restrictions

```http
GET /api/v1/admin/risk/restrictions
POST /api/v1/admin/risk/restrictions
PATCH /api/v1/admin/risk/restrictions/{restrictionId}
POST /api/v1/admin/risk/restrictions/{restrictionId}/remove
```

Restriction types:

```text
COD_RESTRICTED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
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

A risk restriction must be traceable to its source.

---

# 88. Customer Reviews

## Create Review

```http
POST /api/v1/orders/{orderId}/review
```

Request:

```json
{
  "rating": 5,
  "comment": "Great food and delivery."
}
```

Validation:

* customer owns order
* order is delivered
* review not already created
* rating within allowed range

## Get Review

```http
GET /api/v1/orders/{orderId}/review
```

---

# 89. Review Reports

```http
POST /api/v1/reviews/{reviewId}/report
```

Request:

```json
{
  "reason": "INAPPROPRIATE_CONTENT",
  "details": "..."
}
```

---

# 90. Notifications

## List Notifications

```http
GET /api/v1/notifications
```

Query:

```text
read
type
cursor
limit
```

## Get Notification

```http
GET /api/v1/notifications/{notificationId}
```

## Mark Read

```http
POST /api/v1/notifications/{notificationId}/read
```

## Mark All Read

```http
POST /api/v1/notifications/read-all
```

---

# 91. Notification Preferences

```http
GET /api/v1/notifications/preferences
PATCH /api/v1/notifications/preferences
```

Channels:

```text
PUSH
SMS
EMAIL
IN_APP
```

Critical transactional notifications may not be disabled where business/security rules require delivery.

---

# 92. Support

## Create Ticket

```http
POST /api/v1/support/tickets
```

Request:

```json
{
  "subject": "Order problem",
  "category": "ORDER",
  "priority": "NORMAL",
  "message": "I have an issue with my order."
}
```

## List Tickets

```http
GET /api/v1/support/tickets
```

## Ticket Details

```http
GET /api/v1/support/tickets/{ticketId}
```

## Send Message

```http
POST /api/v1/support/tickets/{ticketId}/messages
```

## Close Ticket

```http
POST /api/v1/support/tickets/{ticketId}/close
```

---

# 93. Admin Authentication

Admin authentication uses the same fundamental identity system but requires stronger security controls.

Recommended controls:

```text
MFA
shorter sessions
strong password policy
session monitoring
audit logging
IP/device controls where appropriate
```

---

# 94. Admin Dashboard

```http
GET /api/v1/admin/dashboard
```

Possible metrics:

* total customers
* active restaurants
* active riders
* orders
* revenue
* refunds
* pending restaurant applications
* pending rider applications
* active deliveries
* risk alerts
* support tickets

Dashboard metrics must be derived from authoritative backend data.

---

# 95. Admin Customers

```http
GET /api/v1/admin/customers
GET /api/v1/admin/customers/{customerId}
PATCH /api/v1/admin/customers/{customerId}
```

Possible administrative actions:

```http
POST /api/v1/admin/customers/{customerId}/restrict
POST /api/v1/admin/customers/{customerId}/restore
```

All sensitive administrative actions must be audited.

---

# 96. Admin Restaurants

```http
GET /api/v1/admin/restaurants
GET /api/v1/admin/restaurants/{restaurantId}
PATCH /api/v1/admin/restaurants/{restaurantId}
```

---

# 97. Restaurant Approval

```http
POST /api/v1/admin/restaurants/{restaurantId}/approve
POST /api/v1/admin/restaurants/{restaurantId}/reject
POST /api/v1/admin/restaurants/{restaurantId}/request-resubmission
```

Reject request:

```json
{
  "reason": "Required document is invalid."
}
```

---

# 98. Admin Riders

```http
GET /api/v1/admin/riders
GET /api/v1/admin/riders/{riderId}
PATCH /api/v1/admin/riders/{riderId}
```

---

# 99. Rider Approval

```http
POST /api/v1/admin/riders/{riderId}/approve
POST /api/v1/admin/riders/{riderId}/reject
POST /api/v1/admin/riders/{riderId}/suspend
POST /api/v1/admin/riders/{riderId}/restore
```

All actions require appropriate administrative permission.

---

# 100. Admin Orders

```http
GET /api/v1/admin/orders
GET /api/v1/admin/orders/{orderId}
```

Filters:

```text
status
customer
restaurant
rider
paymentStatus
from
to
search
```

---

# 101. Admin Order Intervention

```http
POST /api/v1/admin/orders/{orderId}/cancel
```

Request:

```json
{
  "reasonCode": "RESTAURANT_UNABLE_TO_FULFILL",
  "reason": "..."
}
```

Administrative cancellation must:

1. validate authority
2. validate business rules
3. calculate financial consequences
4. create cancellation record
5. create status history
6. process refund if required
7. create audit log
8. emit required events

---

# 102. Admin Payments

```http
GET /api/v1/admin/payments
GET /api/v1/admin/payments/{paymentId}
GET /api/v1/admin/refunds
GET /api/v1/admin/refunds/{refundId}
```

---

# 103. Admin Settlements

```http
GET /api/v1/admin/settlements
GET /api/v1/admin/settlements/{settlementId}
POST /api/v1/admin/settlements/{settlementId}/process
POST /api/v1/admin/settlements/{settlementId}/approve
```

Settlement processing must be idempotent.

---

# 104. Admin Promotions

```http
GET /api/v1/admin/promotions
GET /api/v1/admin/promotions/{promotionId}
PATCH /api/v1/admin/promotions/{promotionId}
POST /api/v1/admin/promotions/{promotionId}/disable
```

---

# 105. Admin Reviews

```http
GET /api/v1/admin/reviews
GET /api/v1/admin/reviews/{reviewId}
POST /api/v1/admin/reviews/{reviewId}/hide
POST /api/v1/admin/reviews/{reviewId}/restore
```

Review moderation actions must be audited.

---

# 106. Admin Support

```http
GET /api/v1/admin/support/tickets
GET /api/v1/admin/support/tickets/{ticketId}
POST /api/v1/admin/support/tickets/{ticketId}/assign
POST /api/v1/admin/support/tickets/{ticketId}/resolve
```

---

# 107. Admin Configuration

Business configuration should be managed through controlled configuration APIs.

Examples:

```http
GET /api/v1/admin/configuration
GET /api/v1/admin/configuration/{key}
PATCH /api/v1/admin/configuration/{key}
```

However, important structured configuration should use dedicated domain tables rather than turning the entire system into arbitrary key/value configuration.

Examples of dedicated configuration:

```text
dispatch settings
risk rules
promotion rules
fee configuration
cancellation rules
```

Every configuration change must be audited.

---

# 108. Admin Audit Logs

```http
GET /api/v1/admin/audit-logs
GET /api/v1/admin/audit-logs/{auditLogId}
```

Filters:

```text
actor
action
entityType
entityId
from
to
```

Audit logs should be append-only from the application perspective.

---

# 109. File Uploads

Files include:

* restaurant documents
* rider documents
* profile images
* restaurant images
* menu images
* support attachments
* delivery proof

Preferred architecture:

```text
Client
↓
Backend authorization
↓
Signed upload URL
↓
Object Storage
↓
Backend metadata record
```

The backend must verify:

* file type
* file size
* authorized owner
* allowed destination
* upload expiration
* object ownership

Never expose private documents through public URLs.

---

# 110. Realtime Architecture

WebSocket or equivalent realtime transport is used for time-sensitive state.

Authentication is required.

The client must still be able to recover authoritative state through normal HTTP APIs after reconnecting.

Realtime is an optimization, not the sole source of truth.

---

# 111. Customer Realtime Events

Possible events:

```text
order.created
order.restaurant_accepted
order.preparing
order.ready
order.rider_assigned
order.picked_up
order.out_for_delivery
order.delivered
order.cancelled
delivery.rider_location_updated
notification.created
```

Example:

```json
{
  "event": "order.status_changed",
  "data": {
    "orderId": "ord_123",
    "status": "OUT_FOR_DELIVERY",
    "occurredAt": "2026-09-25T10:00:00Z"
  }
}
```

---

# 112. Restaurant Realtime Events

Restaurant receives relevant events such as:

```text
order.created
order.cancelled
payment.status_changed
delivery.rider_assigned
delivery.rider_arriving
notification.created
```

---

# 113. Rider Realtime Events

Rider receives:

```text
delivery.offer_created
delivery.offer_cancelled
delivery.offer_expired
delivery.assignment_created
delivery.assignment_cancelled
notification.created
```

---

# 114. Admin Realtime Events

Admin dashboard may receive:

```text
order.created
order.status_changed
delivery.created
delivery.assigned
risk.flag_created
support.ticket_created
restaurant.application_submitted
rider.application_submitted
payment.failed
```

---

# 115. WebSocket Security

WebSocket connections must:

* authenticate the user
* authorize subscriptions
* restrict events by ownership/role
* prevent cross-restaurant data leakage
* prevent customers receiving other customers' events
* prevent riders receiving other riders' private information
* support reconnection
* support heartbeat/timeout
* log abnormal behavior where appropriate

---

# 116. Webhook Architecture

External webhooks must use:

```text
signature verification
+
event ID
+
idempotency
+
replay protection
+
transactional processing
```

Supported webhook categories may include:

```text
payments
payouts
SMS
email
maps/provider events where applicable
```

---

# 117. Webhook Response

A successfully accepted webhook should return an appropriate success response even when downstream processing is asynchronous.

Recommended:

```text
202 Accepted
```

when queued for processing.

Duplicate events must not duplicate business effects.

---

# 118. Order Event Architecture

Important order changes should produce internal events.

Examples:

```text
OrderCreated
OrderAccepted
OrderPreparing
OrderReady
RiderAssigned
OrderPickedUp
OrderOutForDelivery
OrderDelivered
OrderCancelled
```

Events should be persisted through the outbox mechanism defined by the architecture.

---

# 119. Order Transition Authorization

Only authorized actors may perform specific transitions.

Example:

```text
PENDING
→ RESTAURANT_ACCEPTED
```

Allowed:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

for the owning restaurant.

```text
RESTAURANT_ACCEPTED
→ PREPARING
```

Allowed:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

```text
PREPARING
→ READY_FOR_PICKUP
```

Allowed:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

```text
RIDER_ASSIGNED
→ PICKED_UP
```

Allowed:

```text
assigned RIDER
```

```text
PICKED_UP
→ OUT_FOR_DELIVERY
```

Allowed:

```text
assigned RIDER
```

```text
OUT_FOR_DELIVERY
→ DELIVERED
```

Allowed:

```text
assigned RIDER
```

Admin intervention requires explicit administrative authorization and audit logging.

---

# 120. Resource Ownership

The API must enforce ownership.

Examples:

A customer cannot access:

```text
another customer's address
another customer's order
another customer's payment
```

A restaurant cannot access:

```text
another restaurant's menu
another restaurant's orders
another restaurant's earnings
another restaurant's staff
```

A rider cannot access:

```text
another rider's earnings
another rider's private profile
another rider's deliveries
```

unless explicitly required by an authorized administrative workflow.

---

# 121. Tenant Isolation

Restaurant resources are tenant-scoped.

Every restaurant-owned query must include tenant context.

Do not rely solely on:

```text
WHERE id = ?
```

when the resource belongs to a restaurant.

Use ownership constraints such as:

```text
WHERE id = ?
AND restaurant_id = authenticatedRestaurantId
```

This applies to:

* orders
* menu
* staff
* promotions
* earnings
* reviews
* settings
* analytics

---

# 122. Money Handling

Money must be represented using exact decimal/database numeric values.

Do not use floating point for financial calculations.

API values should preferably be serialized as strings:

```json
{
  "total": "1599.50",
  "currency": "PKR"
}
```

Backend owns all calculations.

---

# 123. Currency

Every financial response should identify currency.

Example:

```json
{
  "amount": "1500.00",
  "currency": "PKR"
}
```

V1 is single-market/single-currency unless otherwise configured.

---

# 124. Dates and Times

All backend timestamps use UTC.

Example:

```text
2026-09-25T10:30:00Z
```

Clients may display local time.

Operating hours must represent the restaurant's configured local timezone.

---

# 125. Filtering

Standard filtering format:

```text
?status=ACTIVE
```

Multiple values:

```text
?status=ACTIVE,PAUSED
```

or an implementation-defined repeated parameter.

The exact convention must remain consistent throughout the API.

---

# 126. Sorting

Recommended:

```text
?sort=createdAt
?sort=-createdAt
```

where:

```text
ascending = field
descending = -field
```

Only documented sortable fields may be accepted.

Never interpolate arbitrary client strings into SQL.

---

# 127. Search

Search parameters must be validated and bounded.

Example:

```text
?search=burger
```

Search must not expose internal/private records.

---

# 128. Rate Limiting

Rate limiting is required for:

* login
* registration
* verification codes
* password reset
* resend verification
* payment creation
* payment confirmation
* support abuse-prone endpoints
* public search
* location updates
* delivery offer actions

Different limits may be configured by:

```text
IP
user
endpoint
device/session
role
risk level
```

---

# 129. Brute Force Protection

Authentication endpoints must implement protections against:

* credential stuffing
* verification-code guessing
* password reset abuse
* account enumeration
* automated registration

Responses must avoid revealing unnecessary account existence information.

---

# 130. Input Validation

Every request must be validated at the API boundary.

Validation includes:

* required fields
* type
* format
* length
* numeric bounds
* enum values
* relationships
* ownership
* business rules

Validation must not replace business authorization.

Both are required.

---

# 131. Database Transactions

Transactions are required for operations where partial completion would create inconsistent state.

Examples:

```text
create order
accept order
cancel order
payment/refund state changes
rider assignment
settlement processing
payout state changes
```

---

# 132. Concurrency Control

The backend must protect against concurrent actions.

Example:

Two riders attempt to accept the same dispatch offer.

Only one may succeed.

The backend must atomically verify and assign:

```text
offer still active
+
delivery unassigned
+
rider eligible
```

The losing request receives:

```text
DISPATCH_OFFER_ALREADY_RESPONDED
```

or an appropriate conflict error.

---

# 133. Restaurant Order Concurrency

Two restaurant operators may attempt to accept/reject the same order.

Only one valid state transition may succeed.

The second request must receive:

```text
ORDER_INVALID_STATUS
```

or `409 Conflict`.

---

# 134. Payment Concurrency

Payment confirmation must be idempotent.

Multiple provider callbacks must not produce:

```text
duplicate payment
duplicate order completion
duplicate earnings
duplicate settlement
```

---

# 135. Logging

Every important API request should have structured logs containing:

```text
requestId
userId where available
role
endpoint
method
status
latency
errorCode where applicable
```

Sensitive information must not be logged.

Never log:

```text
passwords
full payment credentials
authentication tokens
private document contents
```

---

# 136. Audit Logging

Audit logs are required for sensitive operations.

Examples:

```text
restaurant approval
restaurant rejection
rider approval
rider suspension
customer restriction
risk restriction
manual refund
admin cancellation
settlement approval
payout action
configuration change
permission change
review moderation
```

Audit records include:

```text
actor
action
entity
old state
new state
timestamp
request ID
IP where appropriate
metadata
```

---

# 137. API Security Principles

The following are mandatory:

```text
Never trust client totals.
Never trust client prices.
Never trust client payment success.
Never trust client permissions.
Never trust client order status.
Never trust client restaurant availability.
Never trust client rider assignment.
Never trust client earnings.
Never trust client settlement values.
Never trust client risk status.
```

The backend is authoritative.

---

# 138. Sensitive Data

Sensitive data must have controlled access.

Examples:

* identity documents
* bank/payment account references
* private customer information
* rider documents
* authentication information

API responses must expose only the minimum necessary information.

---

# 139. API Caching

Cache only data that is safe to cache.

Potential candidates:

```text
restaurant discovery
restaurant public profile
menu data
configuration
```

Do not cache sensitive or rapidly changing state without an explicit consistency strategy.

Do not rely on cache as the authoritative source for:

```text
payments
orders
financial records
permissions
risk restrictions
settlements
```

---

# 140. API Consistency

Endpoint naming must remain consistent.

Use nouns for resources:

```text
/orders
/restaurants
/riders
/payments
/reviews
```

Use explicit action endpoints for state-changing business operations:

```text
/orders/{id}/cancel
/orders/{id}/accept
/orders/{id}/ready
/delivery-offers/{id}/accept
```

---

# 141. Soft Deletion

Where soft deletion is used, deleted resources must not accidentally appear in normal API responses.

Financial and order records must not be physically removed merely to represent normal application deletion.

---

# 142. API Documentation

Every implemented endpoint must have:

```text
HTTP method
path
authentication requirement
role/permission
request schema
validation
response schema
errors
side effects
idempotency requirements
authorization rules
```

OpenAPI/Swagger should be generated or maintained from the implementation contract.

The API documentation must not contradict this specification.

---

# 143. Golden E2E API Flow

The following sequence represents the primary V1 integration flow.

## Step 1 — Customer Registration

```http
POST /api/v1/auth/register
```

## Step 2 — Verification

```http
POST /api/v1/auth/verify-phone
POST /api/v1/auth/verify-email
```

## Step 3 — Customer Address

```http
POST /api/v1/customer/addresses
```

## Step 4 — Restaurant Discovery

```http
GET /api/v1/restaurants
```

## Step 5 — Restaurant Menu

```http
GET /api/v1/restaurants/{restaurantId}/menu
```

## Step 6 — Cart

```http
POST /api/v1/cart/items
```

## Step 7 — Checkout Preview

```http
POST /api/v1/checkout/preview
```

## Step 8 — Create Order

```http
POST /api/v1/orders
```

Backend:

```text
validate
→ calculate
→ risk check
→ create order
→ create payment record
→ create status history
→ publish event
```

## Step 9 — Restaurant Receives Order

```text
order.created
```

## Step 10 — Restaurant Accepts

```http
POST /api/v1/restaurant/orders/{orderId}/accept
```

## Step 11 — Restaurant Starts Preparation

```http
POST /api/v1/restaurant/orders/{orderId}/preparing
```

## Step 12 — Restaurant Marks Ready

```http
POST /api/v1/restaurant/orders/{orderId}/ready
```

## Step 13 — Dispatch Engine

Internal process:

```text
find eligible riders
→ rank riders
→ create offer
```

## Step 14 — Rider Receives Offer

```text
delivery.offer_created
```

## Step 15 — Rider Accepts

```http
POST /api/v1/rider/delivery-offers/{offerId}/accept
```

## Step 16 — Rider Arrives

```http
POST /api/v1/rider/deliveries/{deliveryId}/arriving
```

## Step 17 — Pickup

```http
POST /api/v1/rider/deliveries/{deliveryId}/pickup
```

## Step 18 — Out for Delivery

```http
POST /api/v1/rider/deliveries/{deliveryId}/out-for-delivery
```

## Step 19 — Delivery Complete

```http
POST /api/v1/rider/deliveries/{deliveryId}/complete
```

## Step 20 — Earnings

Backend creates:

```text
restaurant earning
rider earning
```

## Step 21 — Review

```http
POST /api/v1/orders/{orderId}/review
```

---

# 144. API Implementation Order

Implementation should follow this order:

## Phase A — Foundation

```text
authentication
authorization
users
roles
permissions
request validation
error handling
logging
database transaction infrastructure
idempotency
outbox
```

## Phase B — Customer

```text
profile
addresses
restaurant discovery
menus
cart
checkout
orders
```

## Phase C — Restaurant

```text
onboarding
approval
profile
availability
menu
orders
```

## Phase D — Rider

```text
onboarding
approval
availability
location
delivery offers
delivery lifecycle
```

## Phase E — Payments

```text
payments
webhooks
refunds
```

## Phase F — Dispatch

```text
dispatch engine
eligibility
ranking
offers
assignment
reassignment
```

## Phase G — Risk

```text
risk events
rules
flags
restrictions
```

## Phase H — Financial

```text
earnings
settlements
payouts
invoices
```

## Phase I — Supporting Features

```text
notifications
reviews
promotions
support
analytics
```

## Phase J — Admin

```text
dashboard
customers
restaurants
riders
orders
payments
risk
support
settlements
configuration
audit
reports
```

---

# 145. API Definition of Done

An API endpoint is not complete until:

* route implemented
* authentication implemented
* authorization implemented
* tenant isolation implemented
* request validation implemented
* business rules implemented
* database interaction implemented
* transaction handling implemented where required
* idempotency implemented where required
* correct HTTP status implemented
* standard success response implemented
* standard error response implemented
* logging implemented
* audit logging implemented where required
* tests implemented
* security reviewed
* OpenAPI/API documentation updated
* realtime events implemented where required
* background jobs/events implemented where required

---

# 146. Forbidden API Behaviors

The following are prohibited:

## Client-controlled prices

```text
POST /orders
{
  "total": 100
}
```

must never make the client-provided total authoritative.

## Client-controlled order status

```text
PATCH /orders/{id}
{
  "status": "DELIVERED"
}
```

must not be exposed as a generic status mutation.

## Client-controlled rider assignment

A rider cannot arbitrarily assign themselves an order.

## Client-controlled earnings

Clients cannot submit their own earnings.

## Client-controlled risk status

Clients cannot remove or modify risk restrictions.

## Client-controlled permissions

Clients cannot assign themselves roles.

## Client-controlled restaurant availability

Customers cannot make a restaurant online/offline.

---

# 147. Generic Status Mutation Is Forbidden

Do not implement:

```http
PATCH /orders/{id}
```

with arbitrary:

```json
{
  "status": "..."
}
```

for business-critical order states.

Use explicit transition endpoints.

Example:

```text
/accept
/preparing
/ready
/cancel
/pickup
/out-for-delivery
/complete
```

This makes authorization and business rules explicit.

---

# 148. Internal APIs

Internal module communication should normally use application services/domain events rather than exposing internal HTTP endpoints unnecessarily.

Example:

```text
OrderService
→ DispatchService
```

through an internal event:

```text
OrderReadyForDispatch
```

rather than forcing the public client API to orchestrate the process.

---

# 149. Background Jobs

Background processing may be used for:

```text
notifications
dispatch offer expiration
risk evaluation
payment reconciliation
settlement generation
payout processing
analytics aggregation
cleanup
retryable provider calls
outbox processing
```

Jobs must be idempotent.

Retries must use controlled backoff.

Failed jobs must be observable.

---

# 150. API Reliability

External provider failures must not corrupt internal business state.

Example:

Payment provider temporarily unavailable.

The backend must not mark:

```text
payment = SUCCEEDED
```

without authoritative provider confirmation.

Similarly:

Notification provider failure must not change:

```text
order status
```

The business operation and notification delivery are separate concerns.

---

# 151. Reconciliation

Financial integrations must support reconciliation.

Examples:

```text
internal payment record
↔
provider payment record

internal refund
↔
provider refund

settlement
↔
payout provider
```

Mismatch detection should produce operational alerts.

---

# 152. API Testing Requirements

Every API module must contain:

## Unit tests

For:

```text
validation
calculations
authorization
business rules
state transitions
```

## Integration tests

For:

```text
database
transactions
payments
dispatch
risk
```

## E2E tests

At minimum:

```text
customer registration
restaurant onboarding
rider onboarding
order creation
restaurant acceptance
preparation
dispatch
rider acceptance
pickup
delivery
review
earnings
```

## Failure tests

Examples:

```text
payment failure
restaurant rejection
rider rejects offer
offer expires
two riders accept simultaneously
two operators update order simultaneously
customer attempts invalid cancellation
restaurant becomes unavailable
item becomes unavailable
risk restriction blocks COD
provider timeout
webhook duplicated
```

---

# 153. API Contract Testing

Frontend and backend must validate against the same contract.

Recommended:

```text
OpenAPI
+
generated/shared types where practical
+
contract tests
```

Frontend code must not independently invent response structures.

---

# 154. API Change Process

Before changing an existing endpoint:

1. Identify affected clients.
2. Identify affected database modules.
3. Identify affected business rules.
4. Identify backward compatibility impact.
5. Update this document.
6. Update OpenAPI.
7. Update tests.
8. Update implementation.
9. Update frontend clients.
10. Record an ADR if the change is architectural.

---

# 155. Breaking Changes

Examples of breaking changes:

```text
removing endpoint
changing required field
changing field meaning
changing enum semantics
changing authentication behavior
changing response type
changing state-transition behavior
```

Breaking changes require API versioning or an approved migration strategy.

---

# 156. Final API Authority

The following hierarchy applies:

```text
PRD
↓
Architecture
↓
Database
↓
API Specification
↓
Business Rules
↓
Implementation
```

Where an implementation conflicts with these documents, the implementation must not silently redefine the requirements.

Ambiguities must be resolved before implementation.

---

# 157. Related Documents

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
docs/decisions/ADR/
```

---

# 158. Phase 4 Completion Criteria

Phase 4 is considered complete when:

```text
[✓] API versioning defined
[✓] authentication defined
[✓] authorization defined
[✓] roles defined
[✓] common responses defined
[✓] errors defined
[✓] idempotency defined
[✓] customer API defined
[✓] restaurant API defined
[✓] rider API defined
[✓] admin API defined
[✓] order lifecycle defined
[✓] cancellation API defined
[✓] payment API defined
[✓] refund API defined
[✓] dispatch API defined
[✓] risk API defined
[✓] promotion API defined
[✓] review API defined
[✓] notification API defined
[✓] support API defined
[✓] earnings API defined
[✓] settlement API defined
[✓] realtime events defined
[✓] webhook behavior defined
[✓] security rules defined
[✓] tenant isolation defined
[✓] concurrency requirements defined
[✓] testing requirements defined
[✓] implementation order defined
```

---

# 159. Phase 4 Status

**Status:** Ready for implementation planning.

The API contract must be treated as a controlled engineering document.

Do not allow individual frontend or backend developers to independently invent business-critical API behavior.

All changes must be reviewed against:

```text
PRD
Architecture
Database
API Specification
Business Rules
```

before implementation.
