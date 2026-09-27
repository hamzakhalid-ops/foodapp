# QuickBite API — Implementation Notes

**File:** `docs/api/API_IMPLEMENTATION_NOTES.md`
**Status:** Living document, Phase 20

`docs/api/API_SPEC.md` remains authoritative for routes and behavior. This document records how
the implementation fills details the specification leaves open (request/response shapes,
interpretations). The executable contracts are the Zod schemas in `packages/validation` and the
typed functions in `packages/api-client`; they are kept identical to the backend.

Conventions for every endpoint:

* Envelope, errors, request IDs and pagination: API_SPEC §8–14.
* Money: decimal strings with 2 places (e.g. `"1250.00"`). Coordinates: JSON numbers (WGS 84).
* Timestamps: ISO 8601 UTC strings. Business-local times (`HH:MM`) use `Asia/Karachi` (ADR-0014 §6).
* Request bodies are **strict**: unknown fields are rejected with `400 VALIDATION_ERROR`
  (mass-assignment protection).
* Resources the caller may not access return `404` (enumeration protection, AUTH_AUTHORIZATION §83).
* Invalid path ids (not a UUID) return `400 INVALID_REQUEST`.

---

## Slice 2 — Customer profile and addresses (§26–27)

| Endpoint | Auth | Request | Response |
|----------|------|---------|----------|
| `GET /customer/profile` | CUSTOMER | — | `CustomerProfile` {id, firstName, lastName, profileImageUrl, dateOfBirth, email, phone} |
| `PATCH /customer/profile` | CUSTOMER | {firstName?, lastName?, profileImageUrl? (https)} | `CustomerProfile` |
| `GET /customer/addresses` | CUSTOMER | — | `Address[]` (default first) |
| `POST /customer/addresses` | CUSTOMER | §27 body; phone normalized to E.164; lat/lng ranges enforced | `201 Address` |
| `PATCH /customer/addresses/{id}` | CUSTOMER (owner) | any subset of the create body | `Address` |
| `DELETE /customer/addresses/{id}` | CUSTOMER (owner) | — | `204` |
| `POST /customer/addresses/{id}/default` | CUSTOMER (owner) | — | `Address` |

`isDefault: true` on create/update makes that address the only default (enforced by a database
index). Deleting the default address leaves no default.

## Slice 3 — Restaurants (§44–49, §57, §96–97)

**Tenant model.** `/restaurant/*` routes carry no restaurant id: they act on the caller's single
ACTIVE membership (`restaurant_staff`). V1: one restaurant per user.

**Roles.** Owner-only: onboarding, profile update, operating-hours update, payment account, staff.
Owner or operator: profile/hours/delivery-settings read, availability (online/offline/pause).

| Endpoint | Auth | Notes |
|----------|------|-------|
| `POST /restaurant/auth/register` | public | {email, phone, password, ownerFirstName, ownerLastName}; creates `RESTAURANT_OWNER` (PENDING_VERIFICATION); same verification flow as customers |
| `POST /restaurant/onboarding` | owner (verified) | {name, description?, phone?, email?, cuisineDescription?}; one restaurant per owner (`409`) |
| `GET /restaurant/onboarding` | owner | `Onboarding` aggregate incl. `missing[]` sections |
| `GET /restaurant/application` | owner | application status part of `Onboarding` |
| `PATCH /restaurant/onboarding/basic-information` | owner | {name?, description?, phone?, email?, cuisineDescription?, logoUrl?, coverImageUrl?} |
| `PATCH /restaurant/onboarding/address` | owner | {addressLine1, addressLine2?, area?, city, postalCode?} |
| `PATCH /restaurant/onboarding/location` | owner | {latitude, longitude} |
| `PATCH /restaurant/onboarding/operating-hours` | owner | same body as `PUT /restaurant/operating-hours` |
| `PATCH /restaurant/onboarding/delivery` | owner | {deliveryEnabled, minimumOrderAmount, estimatedPreparationMinutes 1–240, deliveryRadius km ≤ 100} |
| `PATCH /restaurant/onboarding/business` | owner | {legalName, registrationNumber?, taxNumber?} |
| `POST /restaurant/onboarding/documents` | owner | `multipart/form-data`: `documentType` (e.g. `BUSINESS_LICENSE`), `file` (PDF/PNG/JPEG detected from content, ≤ 10 MB); stored privately |
| `PATCH /restaurant/onboarding/payment` | owner | {provider, accountReference, accountHolderName}; references only; responses show `accountReferenceMasked` |
| `POST /restaurant/onboarding/submit` | owner | `200`; `422 VALIDATION_ERROR` with `details.missing` when incomplete |
| `GET/PATCH /restaurant/profile` | member / owner | after approval only presentational fields; name/address/location change through admin |
| `GET/PUT /restaurant/operating-hours` | member / owner | `{hours: [7 entries: {dayOfWeek 1(Mon)–7(Sun), opensAt, closesAt, isClosed}]}`; overnight hours not supported in V1 |
| `GET /restaurant/delivery-settings` | member | delivery settings or `null` |
| `GET /restaurant/availability` | member | {status, pausedUntil, isOrderableNow} |
| `POST /restaurant/availability/online\|offline\|pause` | member | pause: {durationMinutes 1–240, reason?} |
| `GET/POST /restaurant/staff`, `GET/PATCH/DELETE /restaurant/staff/{id}` | owner | add: {email, role: "OPERATOR"} — the email must belong to an existing ACTIVE account; PATCH: {status}; DELETE deactivates (owner membership cannot be changed) |
| `GET /admin/restaurants` | admin | query: approvalStatus?, status?, search?, page, pageSize |
| `GET /admin/restaurants/{id}` | admin | `Onboarding` + owner + short-lived `documentUrls` |
| `PATCH /admin/restaurants/{id}` | admin | {status: SUSPENDED\|OFFLINE\|CLOSED, reason} |
| `POST /admin/restaurants/{id}/approve` | admin | from SUBMITTED/UNDER_REVIEW; approves pending documents |
| `POST /admin/restaurants/{id}/reject` | admin | {reason} |
| `POST /admin/restaurants/{id}/request-resubmission` | admin | {reason} — shown to the owner as `resubmissionNotes` |

Onboarding sections (basic information, address, location, business, documents) are editable only
while the application is `DRAFT` or `RESUBMISSION_REQUIRED`. Operating hours, delivery settings and
the payment account can be changed by the owner at any time (audited).

**Orderable** (ARCHITECTURE §59, ADR-0014 §12): approved, effectively `ONLINE` (an expired pause
counts as online), delivery enabled, and inside today's operating hours in the business timezone.

---

## Slice 4 — Menu (§50) and customer discovery (§28–31)

**Roles.** Owner: all menu writes. Owner or operator: menu reads and
`POST /restaurant/menu/items/{id}/availability`. Menu writes require an `APPROVED` restaurant
(`409 RESTAURANT_NOT_APPROVED`; PRD §10 places menu setup after approval).

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET/POST /restaurant/menu/categories` | member / owner | {name, description?, sortOrder? 0–10000, isActive?} |
| `PATCH/DELETE /restaurant/menu/categories/{id}` | owner | partial body; DELETE only when empty (`409 INVALID_REQUEST`), otherwise deactivate with `isActive: false` |
| `GET /restaurant/menu/items` | member | query `categoryId?`; items include variations and add-ons |
| `POST /restaurant/menu/items` | owner | {categoryId, name, description?, imageUrl? (https), basePrice, isAvailable?, sortOrder?}; category must be the caller's |
| `GET/PATCH/DELETE /restaurant/menu/items/{id}` | member / owner / owner | DELETE removes the item with its variations and add-ons (orders keep their own snapshots) |
| `POST /restaurant/menu/items/{id}/availability` | member | {available} → `MenuItem` |
| `GET/POST /restaurant/menu/items/{id}/variations` | member / owner | {name, priceAdjustment? (default `0.00`), isActive?, sortOrder?} |
| `PATCH/DELETE /restaurant/menu/variations/{id}` | owner | |
| `GET/POST /restaurant/menu/items/{id}/add-ons` | member / owner | {name, price, isActive?, sortOrder?} |
| `PATCH/DELETE /restaurant/menu/add-ons/{id}` | owner | |

Prices are non-negative decimal strings with at most 2 places; the database enforces `>= 0`.
Variation adjustments are additive and non-negative (DATABASE.md §19 example `Small +0`).

**Discovery (public, no authentication).** Visible restaurants are `APPROVED` with status
`ONLINE`, `OFFLINE` or `TEMPORARILY_PAUSED`; `SUSPENDED`/`CLOSED`/unapproved restaurants return
`404 RESTAURANT_NOT_FOUND`. A visible restaurant may be not orderable (`isOrderableNow: false`,
MAPS_LOCATION_RULES §32–33).

| Endpoint | Notes |
|----------|-------|
| `GET /restaurants` | query: latitude?, longitude? (together), radius? km (needs location), search?, cuisine?, status? (`ONLINE`\|`OFFLINE`\|`TEMPORARILY_PAUSED`), sort `name`\|`distance` (distance needs location), page, pageSize. `cursor` is not supported (offset pagination). |
| `GET /restaurants/{id}` | query: latitude?, longitude?; summary + addressLine1, coordinates, deliveryRadius, operatingHours. No phone/email/approval/business/payment data. |
| `GET /restaurants/{id}/menu` | active categories that contain items; unavailable items are listed with `isAvailable: false`; inactive variations/add-ons are omitted |
| `GET /search` | query: q (1–100), type `RESTAURANT`\|`MENU_ITEM`\|`ALL`, latitude?, longitude?, radius?, page, pageSize → `{restaurants, menuItems}`; page/pageSize apply to each list; case-insensitive substring match |

`RestaurantSummary`: id, name, slug, description, logoUrl, coverImageUrl, cuisineDescription, area,
city, status, isOrderableNow, minimumOrderAmount, estimatedPreparationMinutes, deliveryFee
(platform flat fee, `null` until configured), distanceKm and deliversToLocation (`null` without a
caller location). Distance is straight-line (MAPS_LOCATION_RULES §13) and delivery reach compares
it with the restaurant's delivery radius. Ratings are added with the reviews slice.

---

## Slice 5 — Cart, checkout and order creation (§32–41)

**Cart (customer only).** Stored in PostgreSQL; selections only. Every response is recalculated
from the current menu, restaurant state and pricing settings, so price and availability changes
are always visible.

| Endpoint | Notes |
|----------|-------|
| `GET /cart` | `Cart` (empty cart: `restaurant: null`, totals `0.00`) |
| `POST /cart/items` | {restaurantId, menuItemId, quantity 1–99, variationIds (0–1), addOnIds (unique, ≤ 20)} → `201 Cart`. Item must be available and belong to the restaurant; `409 CART_RESTAURANT_MISMATCH` when the cart holds another restaurant's items; `422 ORDER_ITEM_UNAVAILABLE / INVALID_VARIATION / INVALID_ADD_ON` |
| `PATCH /cart/items/{id}` | {quantity 1–99} → `Cart` |
| `DELETE /cart/items/{id}` | → `Cart` (the cart forgets its restaurant when it becomes empty) |
| `DELETE /cart` | `204` |
| `POST /cart/recalculate` | `200 Cart` (same as GET) |

`Cart`: restaurant {id, name, isOrderableNow} or null, items [{id, menuItemId, name, imageUrl,
quantity, unitPrice, lineTotal, variations [{id, name, price}], addOns [...], isAvailable}],
subtotal, deliveryFee, serviceFee, tax, total, currency, minimumOrderAmount, issues [{code,
message, cartItemId}], isCheckoutReady. Issues: `ORDER_ITEM_UNAVAILABLE`, `INVALID_VARIATION`,
`INVALID_ADD_ON`, `RESTAURANT_NOT_AVAILABLE`, `ORDER_MINIMUM_NOT_MET`.

**Variations** are mutually exclusive choices (DATABASE.md §19 "Small / Medium / Large"): an item
with active variations requires exactly one; an item without variations accepts none. Add-ons are
optional, each at most once per unit.

**Pricing** (ADR-0014 §1): unit price = base + variation + add-ons; subtotal = Σ unit × quantity;
tax = `pricing.tax_percent` of (subtotal − discount), rounded half-up to 2 dp once; total =
subtotal − discount + delivery fee + tax + service fee. Unconfigured pricing settings fail with
`503 INTERNAL_ERROR` rather than an invented value.

| Endpoint | Notes |
|----------|-------|
| `POST /checkout/preview` | {addressId, paymentMethod `ONLINE_PAYMENT`\|`CASH_ON_DELIVERY`, promotionCode?} → `200` {restaurantId, addressId, subtotal, discount, deliveryFee, tax, serviceFee, total, currency, paymentMethod, promotionCode}. Not an order. |
| `POST /orders` | `Idempotency-Key` required; {addressId, paymentMethod, promotionCode?, instructions? ≤ 500} → `201 Order` |
| `GET /orders/{id}` | customer (own), restaurant staff (own restaurant, once released), admin; others `404 ORDER_NOT_FOUND`. Riders are added with the delivery slice. |
| `GET /orders/{id}/status` | {orderId, status, paymentStatus, history [{fromStatus, toStatus, reason, createdAt}]} |
| `GET /customer/orders` | query: status?, from?, to? (ISO 8601), cursor?, limit 1–100 (default 20); newest first; `meta.pagination` {limit, nextCursor, hasMore} |

Payment method values are the frozen vocabulary (`ONLINE_PAYMENT`, `CASH_ON_DELIVERY`), not the
`"COD"` shorthand in the §37 example.

Checkout failures: `422 INVALID_REQUEST` (empty cart), the first cart issue code with
`details.issues`, `404` for an address that is not the caller's, `422 ADDRESS_NOT_SERVICEABLE`
when the straight-line distance exceeds the restaurant delivery radius, `422 PROMOTION_NOT_FOUND`
for an unknown code.

Order creation runs in one transaction (cart row locked `FOR UPDATE`, so concurrent checkouts
create one order): order + item/option snapshots + delivery-address snapshot + `PENDING` status
history + `PENDING` payment record + outbox `order.created`, then the cart is emptied. Risk checks
join this transaction with the risk slice.

**Release to the restaurant.** Cash-on-delivery orders are visible to the restaurant immediately.
Online-payment orders are visible (and actionable) only once the payment is `AUTHORIZED` or
`SUCCEEDED` (PAYMENT_RULES §4, §8: the order continues after the provider confirms payment).

---

## Slice 6 — Restaurant orders, lifecycle and cancellation (§42–43, §51–56, §101)

**State machine.** `orders.status` changes only through one service: transitions follow
ORDER_RULES §11 plus `RESTAURANT_ACCEPTED → CANCELLED_BY_CUSTOMER` within
`orders.accepted_cancellation_window_seconds` (ADR-0014 §12). Each transition is a compare-and-set
on the current status that appends `order_status_history` and an `order.status_changed` outbox
event ({orderId, orderNumber, customerId, restaurantId, fromStatus, toStatus, occurredAt}).
Status timestamps (`acceptedAt`, `preparingAt`, `readyAt`, `pickedUpAt`, `deliveredAt`,
`cancelledAt`) are set by the transition.

Errors: `409 ORDER_INVALID_STATUS` (transition not allowed from the current status, `details.status`),
`409 ORDER_STATE_CHANGED` (lost a race), `409 ORDER_ALREADY_CANCELLED`, `409 ORDER_ALREADY_COMPLETED`,
`409 ORDER_CANCELLATION_NOT_ALLOWED`.

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET /restaurant/orders/new` | member | released `PENDING` orders, oldest first (max 100) |
| `GET /restaurant/orders` | member | query: status?, from?, to?, search? (order number), cursor?, limit; cursor meta |
| `GET /restaurant/orders/{id}` | member | `Order` |
| `POST /restaurant/orders/{id}/accept` | member | {estimatedPreparationMinutes? 1–240}; refused while the restaurant is `SUSPENDED`/`CLOSED` |
| `POST /restaurant/orders/{id}/preparing` | member | `RESTAURANT_ACCEPTED → PREPARING` |
| `POST /restaurant/orders/{id}/ready` | member | `PREPARING → READY_FOR_PICKUP` (starts dispatch via the outbox event) |
| `POST /restaurant/orders/{id}/reject` and `/cancel` | member | {reasonCode `RESTAURANT_ITEM_UNAVAILABLE`\|`RESTAURANT_UNABLE_TO_FULFILL`\|`RESTAURANT_CLOSED`\|`OTHER`, reason? (required for OTHER)}; only `PENDING` orders (ORDER_RULES §11) |
| `POST /orders/{id}/cancel` | customer | {reasonCode `CUSTOMER_CHANGED_MIND`\|`CUSTOMER_ORDERED_BY_MISTAKE`\|`OTHER`, reason?}; `PENDING`, or `RESTAURANT_ACCEPTED` inside the configured window |
| `POST /admin/orders/{id}/cancel` | admin | {reasonCode (any §12 code), reason (required)}; any state except delivered/cancelled |

Reason codes are the CANCELLATION_RULES §12 list (the API_SPEC examples `CHANGED_MIND` /
`ITEM_UNAVAILABLE` map to `CUSTOMER_CHANGED_MIND` / `RESTAURANT_ITEM_UNAVAILABLE`).

**Cancellation transaction.** Order row locked → eligibility → transition → `order_cancellations`
row (refundAmount `null`) → an unpaid (`PENDING`) payment becomes `CANCELLED` → audit
`ORDER_CANCELLED` (actor, role, previous/new state, reason) → outbox `order.cancelled`
({…, reasonCode, refundDecisionRequired}). A captured online payment is left as is:
`refundDecisionRequired: true` hands it to an administrator (ADR-0014 §9). There is no automatic
refund and no cancellation-fee logic.

---

## Slice 7 — Payments and refunds (§77–82, §102)

**Provider.** `PaymentProvider` port with one adapter, `sandbox` (ADR-0014 §5): simulated provider
state in Redis, HMAC-SHA256 signed webhooks (`x-sandbox-signature: t=<unix>,v1=<hex>` over
`<t>.<raw body>`, 5-minute tolerance). Configuration refuses `PAYMENT_PROVIDER=sandbox` in
staging/production, so those environments need a real adapter before they can start.

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET /payment-methods` | customer | `[{method, available}]` for `ONLINE_PAYMENT`, `CASH_ON_DELIVERY` (COD availability narrows with risk restrictions) |
| `POST /payments` | customer, `Idempotency-Key` | {orderId, paymentMethod: `ONLINE_PAYMENT`} → `201 Payment`. Amount comes from the order. Resumes a pending attempt; after `FAILED` creates a new attempt. `422` for COD or a mismatched method, `409 ORDER_INVALID_STATUS` unless the order is `PENDING`, `409 PAYMENT_ALREADY_PROCESSED` once paid, `502 PAYMENT_PROVIDER_ERROR` |
| `GET /payments/{id}` | owner customer, admin | `Payment` {id, orderId, method, status, amount, currency, provider, failureReason, paidAt, createdAt, nextAction {type: REDIRECT, url} \| null, refundedAmount} |
| `POST /payments/{id}/confirm` | owner customer, admin | asks the provider for the payment state and records it; the request body is ignored |
| `POST /webhooks/payments/{provider}` | provider signature | `200 {received, duplicate}`; invalid/stale signature `400`; unknown provider `404`; each provider event id is processed once |
| `POST /payments/{id}/refund` | admin, `Idempotency-Key` | {amount, reasonCode (UPPER_CASE), reason?} → `201 Refund`; only captured online payments (`409 REFUND_NOT_ALLOWED`); `422 PAYMENT_INVALID_AMOUNT` above the remaining refundable amount; `502 REFUND_FAILED` |
| `POST /admin/orders/{id}/refund-decision` | admin, `Idempotency-Key` | {decision `FULL_REFUND`\|`PARTIAL_REFUND` (+amount)\|`NO_REFUND`, reason} → `{decision, refund \| null}`; cancelled orders with a captured payment, one decision per order |
| `GET /admin/payments`, `/admin/payments/{id}` | admin | query: status?, method?, orderId?, cursor?, limit |
| `GET /admin/refunds`, `/admin/refunds/{id}` | admin | query: status?, orderId?, cursor?, limit |
| `POST /sandbox/payments/{providerPaymentId}/outcome` | development/test only | {outcome `SUCCEEDED`\|`FAILED`\|`AUTHORIZED`}; simulates the customer at the provider and delivers the signed webhook |

**Recording provider results.** The provider reference must map to a QuickBite payment and the
provider amount/currency must equal the payment's, otherwise the payment becomes `FAILED`
("could not be verified", audited `PAYMENT_VERIFICATION_FAILED`). Allowed verified changes:
`PENDING → AUTHORIZED/SUCCEEDED/FAILED`, `AUTHORIZED → SUCCEEDED/FAILED`, and
`FAILED/CANCELLED → AUTHORIZED/SUCCEEDED` (money captured after a local failure/cancellation is
recorded and flagged `refundDecisionRequired`). The order's `paymentStatus` mirrors the payment;
each change is audited and emits `payment.status_changed`.

**Refunds.** Separate records; the payment amount is never changed. Payment status becomes
`PARTIALLY_REFUNDED` or `REFUNDED` from the total of succeeded refunds, the cancelled order's
`order_cancellations.refund_amount` holds that total, and `refund.succeeded` is emitted. Cash on
delivery has no online refund path in V1.

**Not automated:** unpaid online orders are not expired automatically (no timeout rule is
specified); they stay `PENDING` until paid or cancelled.

---

## Slices 8–9 — Riders, dispatch and deliveries (§63–74, §98–99)

**Rider application.** `approvalStatus`: `PENDING` (filling in) → `UNDER_REVIEW` (submitted) →
`APPROVED` / `REJECTED` (editable and resubmittable) ; `APPROVED` ↔ `SUSPENDED`. Submission needs
vehicle type/number and at least one document. Approval also approves pending documents.

| Endpoint | Auth | Notes |
|----------|------|-------|
| `POST /rider/auth/register` | public | {email, phone, password, firstName, lastName}; same verification flow as customers |
| `GET/PATCH /rider/profile` | rider | {firstName?, lastName?, profileImageUrl?, vehicleType? (UPPER_CASE), vehicleNumber?}; vehicle fields only while editable |
| `GET/PATCH /rider/onboarding`, `POST /rider/onboarding/submit` | rider | `RiderOnboarding` {profile, documents, submittedAt, rejectionReason, missing[]}; submit `422` with `details.missing` |
| `GET/POST /rider/documents`, `PATCH/DELETE /rider/documents/{id}` | rider | multipart `documentType` + `file` (PDF/PNG/JPEG); PATCH replaces the file; editable while `PENDING`/`REJECTED` |
| `GET /rider/availability`, `POST /rider/availability/online\|offline` | rider | `{isOnline, isAvailable, state OFFLINE\|AVAILABLE\|BUSY}`; online requires `APPROVED` + `ACTIVE` + all documents approved (`409 RIDER_NOT_ELIGIBLE`); offline refused during an active delivery |
| `POST /rider/availability` | rider | {available}; online riders only; unavailable withdraws open offers |
| `POST /rider/location` | rider | {latitude, longitude, accuracyMeters?} → `204`; online riders only; stored in Redis |
| `GET/PATCH /admin/riders[/{id}]` | admin | list query: approvalStatus?, online?, search?, page, pageSize; detail adds documents with short-lived URLs; PATCH {vehicleType?, vehicleNumber?} |
| `POST /admin/riders/{id}/approve\|reject\|suspend\|restore` | admin | reject/suspend/restore take {reason}; suspension takes the rider offline; audited |

**Dispatch.** Triggered by the `order.status_changed` → `READY_FOR_PICKUP` outbox event (and a
5-second worker tick for expiry and retries). Settings come from the single `dispatch_settings`
row; without it dispatch is paused. One open offer per order: the nearest eligible rider not yet
offered this order, searching from `initial_radius` by `radius_increment` up to `maximum_radius`.
Eligible = approved, active, online, available, account active, no active delivery, no other open
offer, location newer than `location_max_age_seconds`. Vehicle type is not used (no vehicle rules
exist in V1). After `max_offer_attempts` offers the delivery gets `dispatchFailedAt` and
`dispatch.failed` is emitted for operations.

| Endpoint | Notes |
|----------|-------|
| `GET /rider/delivery-offers`, `/{id}` | open offers of the caller: order number, restaurant location, delivery area/city, payment method, `amountToCollect` (COD), `expiresAt`, `distanceToRestaurantKm`; no customer contact before acceptance |
| `POST /rider/delivery-offers/{id}/accept` | → `Delivery`; re-checks offer, expiry (`409 DISPATCH_OFFER_EXPIRED`), rider eligibility (`409 RIDER_NOT_ELIGIBLE`), assignment (`409 DELIVERY_ALREADY_ASSIGNED`); repeating an accepted offer returns the delivery |
| `POST /rider/delivery-offers/{id}/reject` | {reasonCode UPPER_CASE}; the next rider is offered immediately |

**Deliveries.**

| Endpoint | Notes |
|----------|-------|
| `GET /rider/delivery/current` | active delivery or `null` |
| `GET /rider/deliveries` | query: status?, from?, to?, cursor?, limit |
| `GET /deliveries/{id}` | assigned rider, the order's customer, restaurant staff, admins |
| `POST /rider/deliveries/{id}/arriving` | `ASSIGNED → ARRIVING_AT_RESTAURANT` |
| `POST /rider/deliveries/{id}/pickup` | delivery `→ PICKED_UP`, order `RIDER_ASSIGNED → PICKED_UP` |
| `POST /rider/deliveries/{id}/out-for-delivery` | both `→ OUT_FOR_DELIVERY` |
| `POST /rider/deliveries/{id}/complete` | {notes?, cashCollected?}; both `→ DELIVERED`; cash on delivery requires `cashCollected: true` and marks the payment `SUCCEEDED` in the same transaction (ADR-0014 §10–11) |

`Delivery` {id, orderId, orderNumber, orderStatus, status, riderId, restaurant {name, addressText,
area, city, latitude, longitude, phone}, destination {recipientName, recipientPhone, addressText,
area, city, latitude, longitude, instructions}, paymentMethod, amountToCollect, currency,
pickupAt, pickedUpAt, deliveredAt, deliveryNotes, createdAt}. Other riders' deliveries read as
`404 DELIVERY_NOT_FOUND`; out-of-order steps return `409 ORDER_INVALID_STATUS`.

Cancelling an order cancels open offers and the delivery, closes the assignment and makes the
rider available again. `GET /orders/{id}` also serves the assigned rider.

**Not implemented (no specification yet):** manual admin assignment/reassignment endpoints and
exception handling when an assigned rider is suspended mid-delivery (DISPATCH_RULES §42–43);
distance-based ETA (`estimated_arrival_seconds` stays null without a maps provider).

---

## Slice 10 — Trust & Risk Engine (§83–87)

**Signals recorded automatically** (in the same transaction as the business change, severity
`LOW`): customer cancellation → `REPEATED_ORDER_CANCELLATION` (CUSTOMER); restaurant
rejection/cancellation → `REPEATED_ORDER_CANCELLATION` (RESTAURANT); verified failed online
payment → `REPEATED_PAYMENT_FAILURE`; succeeded refund → `EXCESSIVE_REFUNDS` (with amount and
reason). `COD_NON_RECEIPT`, `REPEATED_FALSE_COMPLAINT`, `SUSPICIOUS_*`,
`MULTIPLE_FAILED_DELIVERIES`, `ABNORMAL_ORDER_FREQUENCY` are recorded by administrators/support
through `POST /admin/risk/events` (no automatic detection is specified).

**Evaluation** (outbox worker, idempotent, serialised per subject): for each enabled rule on the
event's subject type and event type, count that subject's events in `(occurredAt − window,
occurredAt]`; at `count ≥ threshold` create one ACTIVE flag (reason explains rule, count, window,
threshold) and, for `COD_RESTRICTED` / `ORDER_RESTRICTED` / `ADDITIONAL_VERIFICATION` /
`ACCOUNT_RESTRICTED`, one ACTIVE restriction linked to the flag. `MONITORED` flags only; `NORMAL`
does nothing. Rules are only ever data (no thresholds in code).

**Enforcement** (synchronous, authoritative):

| Subject | Restriction | Effect |
|---------|-------------|--------|
| Customer | `COD_RESTRICTED` | COD checkout `403 COD_RESTRICTED`; `GET /payment-methods` shows COD unavailable |
| Customer | `ORDER_RESTRICTED` / `ACCOUNT_RESTRICTED` | checkout `403 ORDER_RESTRICTED` / `403 ACCOUNT_RESTRICTED` |
| Customer | `ADDITIONAL_VERIFICATION` | checkout `403 RISK_VERIFICATION_REQUIRED` until an admin removes it (no V1 verification flow is specified) |
| Restaurant | `ORDER_RESTRICTED` / `ACCOUNT_RESTRICTED` | not orderable at checkout (`422 RESTAURANT_NOT_AVAILABLE`), cannot go online or accept orders (`403 ACCOUNT_RESTRICTED`) |
| Rider | `ORDER_RESTRICTED` / `ACCOUNT_RESTRICTED` | cannot go online (`409 ACCOUNT_RESTRICTED`), receives no offers, cannot accept (`409 RIDER_NOT_ELIGIBLE`) |

Restrictions with `expiresAt` in the past are not enforced.

| Endpoint (admin) | Notes |
|------------------|-------|
| `POST /admin/risk/events` | {subjectType, subjectId, eventType, severity? (default MEDIUM), metadata?} → `202` |
| `GET /admin/risk/events` | query: subjectType?, subjectId?, cursor?, limit (listing added for the risk dashboard, ADMIN_SPEC §23) |
| `GET/POST /admin/risk/rules`, `PATCH /admin/risk/rules/{id}` | body per API_SPEC §85; PATCH {name?, threshold?, windowSeconds?, action?, severity?, enabled?} |
| `GET /admin/risk/flags`, `/{id}` | query adds status (`ACTIVE`\|`RESOLVED`\|`DISMISSED`\|`EXPIRED`); detail includes its restrictions |
| `POST /admin/risk/flags/{id}/resolve\|dismiss` | {reason}; dismissal removes the restrictions the flag created |
| `GET/POST /admin/risk/restrictions` | POST {subjectType, subjectId, restrictionType, reason, expiresAt?}; `409 RISK_RESTRICTION_ACTIVE` if already active |
| `PATCH /admin/risk/restrictions/{id}` | {expiresAt \| null, reason} (override) |
| `POST /admin/risk/restrictions/{id}/remove` | {reason} |

Every administrative risk action is audited (`RISK_*` audit actions).

---

## Slice 11 — Promotions (§58, §104, PROMOTION_RULES)

Restaurant-funded only (ADR-0014 §3); managed by the restaurant **owner** (`promotions.manage`,
AUTH_AUTHORIZATION §42). Statuses: created as `DRAFT`; `DRAFT → ACTIVE`, `ACTIVE ↔ PAUSED` via
PATCH; `disable` is final; past-end promotions become `EXPIRED` (worker, every minute — validation
always checks the time window itself). The code can change only while `DRAFT`; disabled/expired
promotions cannot be edited. All changes are audited (`PROMOTION_*`).

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET/POST /restaurant/promotions` | owner | POST {name, description?, code, type `PERCENTAGE`\|`FIXED_AMOUNT`, value, minimumOrderAmount?, maximumDiscount?, usageLimit?, perCustomerUsageLimit?, startsAt, endsAt}; list query: status?, page, pageSize |
| `GET/PATCH /restaurant/promotions/{id}` | owner | PATCH: any create field + status `ACTIVE`\|`PAUSED` |
| `POST /restaurant/promotions/{id}/disable` | owner | |
| `GET /restaurants/{id}/promotions` | public | currently usable promotions (no usage counters); visibility is not eligibility |
| `POST /promotions/validate` | customer | {code} → `200 {valid, promotionId, discount, currency, reason, message}` against the current cart; informational only |
| `GET /admin/promotions`, `/{id}` | admin | |
| `PATCH /admin/promotions/{id}` | admin | {status `ACTIVE`\|`PAUSED`, reason} (admins change status only) |
| `POST /admin/promotions/{id}/disable` | admin | {reason} |

**Eligibility** (checkout preview, order creation, validate): the code belongs to the cart's
restaurant, status `ACTIVE`, `startsAt ≤ now < endsAt`, item subtotal ≥ `minimumOrderAmount`,
total usage below `usageLimit`, the customer's usages below `perCustomerUsageLimit`.

**Discount** = percentage of the item subtotal (half-up, 2 dp) capped by `maximumDiscount`, or the
fixed amount; never more than the subtotal. Tax applies to `subtotal − discount` (ADR-0014 §1).

**Redemption.** At order creation the promotion row is locked, eligibility is re-checked, the
order stores `promotionId` and `discountAmount`, and one `promotion_usages` row is created with
`usage_count + 1` — concurrent checkouts cannot exceed the limit and idempotent retries never
consume twice. A cancelled order keeps its usage (PROMOTION_RULES §32 default); refunds are based
on the amount actually paid (§33).

Not implemented (no rules yet): first-order/targeted promotions, promotion-specific risk
restrictions.

---

## Slice 12 — Notifications and realtime (§90–91, REALTIME_SPEC)

**Notifications.** Created by the worker from committed domain events (outbox), each with a
deterministic dedup key, so re-delivered events never duplicate a notification. Every
notification is stored in-app; push/SMS/email deliveries are queued per channel and sent by the
worker through the provider port with retries (10 s doubling, capped at 1 h, up to
`NOTIFICATION_MAX_ATTEMPTS`); permanent failures (e.g. no destination) fail immediately. Only the
development/test `log` adapter exists and deployed environments refuse it. Templates are a
versioned code registry (v1, English) in `backend/src/modules/notifications/templates.ts`.

Push is queued only when the user has an active device; SMS only to a verified phone; email only
when an address exists. Users may switch PUSH/SMS/EMAIL off per category except `AUTHENTICATION`
and `SECURITY` (`422`). In-app notifications are always recorded.

| Event | Recipients / notification |
|-------|---------------------------|
| `order.created` | customer `ORDER_CREATED`; restaurant staff `RESTAURANT_NEW_ORDER` for cash orders |
| `payment.status_changed` | customer `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED`; staff `RESTAURANT_NEW_ORDER` when an online order is released |
| `order.status_changed` | customer `ORDER_ACCEPTED` … `ORDER_DELIVERED`, `ORDER_REJECTED`, `ORDER_CANCELLED`; staff `RESTAURANT_ORDER_CANCELLED` |
| `refund.succeeded` | customer `PAYMENT_REFUNDED` |
| `dispatch.offer_created` / `_expired` | rider `DELIVERY_OFFER` / `DELIVERY_OFFER_EXPIRED` |
| `delivery.assigned`, `delivery.delivered`, `delivery.cancelled` | rider `DELIVERY_ASSIGNED`, `DELIVERY_COMPLETED`, `DELIVERY_CANCELLED` |
| `restaurant.application_submitted`, `rider.application_submitted` | admins |
| `restaurant.application_reviewed`, `rider.status_changed` | owner / rider decision notifications |

| Endpoint | Notes |
|----------|-------|
| `GET /notifications` | query: read? (`true`\|`false`), type?, cursor?, limit; `meta.unreadCount` |
| `GET /notifications/{id}`, `POST /notifications/{id}/read` | own notifications only |
| `POST /notifications/read-all` | `{updated}` |
| `GET /notifications/preferences` | `[{category, channel PUSH\|SMS\|EMAIL, enabled, mandatory}]` |
| `PATCH /notifications/preferences` | `{preferences: [{category, channel, enabled}]}` |
| `PUT /notifications/devices` | {deviceId, platform `IOS`\|`ANDROID`\|`WEB`, pushToken} → `204` (register/refresh) |
| `DELETE /notifications/devices/{deviceId}` | `204` (deactivate) |

**Realtime (Socket.IO, path `/realtime`).** Connect with `auth: { token: <access token> }` (or an
`Authorization: Bearer` header). Invalid, revoked or unverified sessions fail with a
`connect_error` whose message is the API error code; live sockets are re-checked every 30 seconds
and disconnected when their session ends. On connect the socket joins `user:{userId}` (and
`rider:{riderId}` for riders) and receives `session.ready`.

Client messages (with acknowledgement): `subscribe {channel}` → `{ok, channel}` or
`{ok: false, error: {code: AUTHZ_FORBIDDEN}}`; `unsubscribe {channel}`. Channels and who may join:

| Channel | Allowed |
|---------|---------|
| `user:{id}` | that user |
| `order:{id}` | the same rule as `GET /orders/{id}` |
| `delivery:{id}` | the same rule as `GET /deliveries/{id}` |
| `restaurant:{id}`, `restaurant:{id}:orders`, `restaurant:{id}:operations` | active staff of that restaurant |
| `rider:{id}` | that rider |
| `admin:operations\|orders\|dispatch\|risk\|support` | ADMIN / SUPER_ADMIN |

Server events use the envelope `{eventId, eventType, version, occurredAt, resourceType, resourceId,
channel, sequence, data}` (ADR-0014 §7); `sequence` increases per channel — on a gap, refetch over
REST. Events: `order.created`, `order.status_changed`, `payment.status_changed`,
`delivery.offer_created`, `delivery.offer_expired`, `delivery.assigned`, `delivery.status_changed`,
`delivery.cancelled`, `dispatch.failed` (admin), `notification.created`. Payloads carry ids and
statuses only.

---

## Slice 13 — Reviews (§62, §88–89, §105, REVIEW_SPEC §25–27)

Customer → restaurant, rating 1–5 (integers only), optional comment ≤ 1000 characters
(`REVIEW_COMMENT_MAX_LENGTH`), one review per `DELIVERED` order; the backend derives customer and
restaurant from the order. New reviews are `PUBLISHED`; moderation happens through reports and
administrators. Nothing is physically deleted.

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET /orders/{id}/review-eligibility` | customer (own order) | `{eligible, reason (REVIEW_NOT_ELIGIBLE \| REVIEW_ALREADY_EXISTS), reviewId}` |
| `POST /orders/{id}/review` | customer | {rating, comment?} → `201`; `409 REVIEW_NOT_ELIGIBLE` / `409 REVIEW_ALREADY_EXISTS` (also under concurrency) |
| `GET /orders/{id}/review` | customer | |
| `PATCH /reviews/{id}` | customer (author) | {rating?, comment?}; not after HIDDEN/REMOVED (`409 REVIEW_ALREADY_REMOVED`) |
| `DELETE /reviews/{id}` | customer (author) | `204`; sets `REMOVED` (audited) |
| `POST /reviews/{id}/report` | customer | {reason (REVIEW_RULES §18 list), details? (required for OTHER)}; published reviews; one report per user (`409 REVIEW_REPORT_INVALID`) |
| `GET /restaurants/{id}/reviews` | public | query: rating?, sort `newest`\|`highest`\|`lowest`, page, pageSize; published only; author shown as first name |
| `GET /restaurants/{id}/rating-summary` | public | {averageRating (1 decimal) \| null, reviewCount, distribution {1..5}} over published reviews |
| `GET /restaurant/reviews`, `/{id}` | owner/operator | own restaurant, excluding removed; query rating?, cursor, limit |
| `POST /restaurant/reviews/{id}/reply` | owner/operator | {response ≤ 1000}; creates or edits the single response (audited) |
| `POST /restaurant/reviews/{id}/report` | owner/operator | as above, own restaurant's reviews |
| `GET /admin/reviews`, `/{id}` | admin | query status?, restaurantId?; detail includes reports |
| `POST /admin/reviews/{id}/hide\|restore\|remove` | admin | {reason}; hide/remove resolve open reports, restore dismisses them; audited |
| `GET /admin/review-reports` | admin | query status? |
| `POST /admin/review-reports/{id}/resolve` | admin | {outcome `RESOLVED`\|`DISMISSED`, reason} |

`RestaurantSummary` in discovery now includes `rating {average, count}`. Notifications:
`REVIEW_RECEIVED` to restaurant staff, `REVIEW_RESPONSE` to the customer (first response only).
Not implemented (no rules yet): moderation of restaurant responses, review reminders, automated
content screening.
