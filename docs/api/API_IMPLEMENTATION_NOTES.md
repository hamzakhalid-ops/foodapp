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
