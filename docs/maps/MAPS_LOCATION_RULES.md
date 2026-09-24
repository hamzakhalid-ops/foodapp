# QuickBite — Maps & Location Rules

**File:** `docs/maps/MAPS_LOCATION_RULES.md`
**Phase:** 9 — Maps & Location Specification
**Status:** Specification
**Authority:** Product + Architecture + Business Rules

---

## 1. Purpose

This document defines the business and system rules for addresses, geographic coordinates, geocoding, delivery distance, rider location, service areas, restaurant delivery radius, GPS accuracy, and location-dependent QuickBite operations.

The purpose is to ensure that location behavior is:

* accurate
* secure
* consistent
* backend-authoritative
* provider-independent
* suitable for production
* resistant to client-side manipulation

Location data is used by:

* Customer App
* Restaurant App
* Rider App
* Admin Panel
* Order system
* Dispatch Engine
* Delivery system
* Risk Engine
* Notifications
* Analytics

---

# 2. Location Authority

The backend is authoritative for all location-dependent business decisions.

The frontend must never be trusted to determine:

* final delivery distance
* delivery eligibility
* delivery radius eligibility
* rider proximity
* rider assignment
* delivery fee
* ETA used for business decisions
* restaurant service area
* whether an address is valid
* whether a rider is actually near a restaurant
* whether a rider is near a customer
* whether a delivery can be completed

Client-provided location data may be submitted as an input, but the backend validates and processes it before using it for business decisions.

---

# 3. Location Data Types

QuickBite distinguishes between several location types.

## 3.1 Customer Saved Address

Persistent address belonging to a customer.

Examples:

* Home
* Work
* Other

Stored in PostgreSQL.

Contains:

* recipient name
* recipient phone
* address text
* area
* city
* postal code where applicable
* latitude
* longitude
* delivery instructions
* default-address flag

---

## 3.2 Restaurant Location

Persistent location belonging to a restaurant.

Used for:

* restaurant discovery
* delivery eligibility
* delivery distance
* dispatch
* rider navigation
* analytics

Restaurant coordinates are stored in PostgreSQL.

---

## 3.3 Rider Current Location

Temporary live location of an approved rider.

Used for:

* dispatch
* rider proximity
* ETA
* active delivery tracking
* operational monitoring

Current rider location is stored primarily in Redis for fast access.

It must not be treated as the permanent source of historical truth.

---

## 3.4 Rider Location History

Historical rider location events may be stored in PostgreSQL when operationally necessary.

Historical tracking must be minimized according to:

* business requirements
* privacy requirements
* retention policy
* operational usefulness

QuickBite must not retain unlimited GPS history by default.

---

## 3.5 Delivery Location Snapshot

An order must preserve the delivery destination used for the delivery.

The delivery must not depend on a customer changing their saved address after placing an order.

The order/delivery workflow therefore uses an immutable delivery-location snapshot.

---

# 4. Coordinate Standard

QuickBite uses:

* latitude
* longitude

using the standard geographic coordinate representation supported by the selected map provider.

Coordinates must use a consistent reference system across the platform.

Default geographic coordinate system:

**WGS 84 / EPSG:4326**

---

# 5. Coordinate Validation

Every coordinate received by the backend must be validated.

Latitude must be between:

```text
-90 and +90
```

Longitude must be between:

```text
-180 and +180
```

Invalid coordinates must be rejected.

The backend must also reject obviously unusable location values such as:

* null coordinates where coordinates are required
* impossible numeric values
* malformed strings
* NaN
* Infinity
* unsupported coordinate formats

---

# 6. Address Validation

A customer address should contain enough information for delivery.

At minimum, where applicable:

* recipient
* phone
* address
* city
* latitude
* longitude

Additional fields may include:

* area
* postal code
* apartment/unit
* building
* floor
* landmark
* delivery instructions

The exact required fields may vary by deployment configuration.

---

# 7. Address Selection Flow

Customer address selection follows:

```text
Customer opens address selection
        ↓
Search / map selection
        ↓
Address candidate
        ↓
Geocoding / reverse geocoding
        ↓
Backend validation
        ↓
Delivery eligibility check
        ↓
Customer confirms address
        ↓
Address saved or selected
```

The client must not assume that an address is deliverable merely because a map provider returned a valid address.

---

# 8. Geocoding

Geocoding converts an address into coordinates.

Example:

```text
Address
  ↓
Geocoding Provider
  ↓
Latitude + Longitude
```

The provider response must be normalized into a QuickBite internal format.

QuickBite must not allow provider-specific response formats to leak throughout the application.

Use an abstraction such as:

```text
MapsService.geocode()
```

---

# 9. Reverse Geocoding

Reverse geocoding converts coordinates into a human-readable address.

Example:

```text
Latitude + Longitude
        ↓
Maps Provider
        ↓
Address Candidate
```

Reverse-geocoded results must be treated as provider data rather than automatically trusted as the customer's final address.

The customer should be able to confirm or edit relevant address details.

---

# 10. Map Provider Abstraction

QuickBite must not tightly couple business logic to one map provider.

Use an internal abstraction:

```text
MapsService
```

Possible operations:

```text
geocode()
reverseGeocode()
calculateDistance()
calculateRoute()
calculateETA()
validateCoordinates()
```

Provider-specific implementations remain behind the abstraction.

Example:

```text
MapsService
    ├── ProviderA
    ├── ProviderB
    └── ProviderC
```

The specific provider may change without requiring business logic to change.

---

# 11. Delivery Eligibility

A restaurant may define a configurable delivery radius.

Example:

```text
Restaurant
    ↓
Delivery Radius
    ↓
Customer Coordinates
    ↓
Distance Calculation
    ↓
Eligible / Not Eligible
```

The backend determines eligibility.

The frontend may display an estimate, but the backend makes the final decision.

---

# 12. Delivery Radius

Restaurant delivery radius must be configurable.

Example:

```text
delivery_radius_km
```

The exact value must not be hard-coded into frontend or backend business logic.

Configuration may eventually support:

* restaurant-specific radius
* platform maximum radius
* city/zone restrictions
* temporary operational limits

---

# 13. Distance Calculation

QuickBite distinguishes between:

### Straight-line distance

Used for:

* proximity filtering
* broad dispatch search
* fast geographic queries

### Route distance

Used for:

* customer-facing delivery estimates
* rider navigation
* operational ETA
* more accurate delivery calculations

Straight-line distance must not automatically be treated as actual driving distance.

---

# 14. Distance Calculation Authority

The backend calculates authoritative operational distances.

Client-side calculations may be used for UI presentation but must not determine:

* delivery eligibility
* rider assignment
* delivery fee
* financial calculations
* operational status

---

# 15. Dispatch Location Rules

When an order becomes:

```text
READY_FOR_PICKUP
```

the Dispatch Engine searches for eligible riders.

Initial filtering may use:

```text
restaurant coordinates
        ↓
Redis geospatial lookup
        ↓
nearby riders
```

Candidates are then validated using backend business rules.

See:

```text
docs/business-rules/DISPATCH_RULES.md
```

---

# 16. Rider Location Eligibility

A rider is considered location-eligible only when:

* rider is approved
* rider account is active
* rider is online
* rider is available
* current location exists
* location is sufficiently recent
* rider is within configured search radius
* rider is not otherwise occupied
* rider meets other dispatch eligibility rules

A stale location must not be treated as current.

---

# 17. Rider Location Freshness

Every rider location update includes:

```text
latitude
longitude
accuracy
recorded_at
```

The Dispatch Engine must apply a configurable freshness threshold.

Example:

```text
location recorded recently
        ↓
eligible for dispatch

location too old
        ↓
location treated as stale
        ↓
candidate excluded or deprioritized
```

The threshold must be configurable.

---

# 18. GPS Accuracy

Rider devices should provide GPS accuracy information where supported.

Example:

```text
accuracy_meters
```

Very inaccurate locations may be:

* ignored
* deprioritized
* marked stale
* excluded from dispatch

depending on configurable rules.

QuickBite must not assume that every GPS coordinate is equally reliable.

---

# 19. Rider Location Updates

The Rider App may send location updates while the rider is:

* online
* available
* assigned to an active delivery
* actively navigating a delivery

Update frequency should be configurable.

QuickBite should avoid unnecessary high-frequency GPS updates when the rider is:

* offline
* inactive
* not involved in a delivery

This reduces:

* battery consumption
* network usage
* infrastructure cost
* privacy exposure

---

# 20. Redis Rider Location

Redis may store:

```text
rider:{id}:location
```

and/or geospatial indexes.

Redis is used for:

* current location
* nearby-rider queries
* presence
* temporary dispatch state

Redis is not the durable financial or order source of truth.

PostgreSQL remains authoritative for durable business records.

---

# 21. Customer Live Tracking

During an active delivery, the customer may receive rider location updates.

Example:

```text
Rider
  ↓
Rider App
  ↓
Backend
  ↓
Realtime layer
  ↓
Customer App
```

The customer should only receive location information relevant to their own active order.

---

# 22. Location Privacy

Location information is sensitive operational data.

QuickBite must apply access control.

A customer must not be able to:

* query arbitrary rider locations
* view another customer's delivery
* access historical rider tracks unrelated to their order

A restaurant must not be able to access arbitrary rider locations.

Admins may have controlled operational access according to permissions.

---

# 23. Restaurant Access to Rider Location

A restaurant may receive operational information necessary to fulfill an active order.

For example:

* rider assigned
* rider approaching pickup
* rider arrival
* pickup status

Exact rider coordinates should only be exposed where operationally justified.

---

# 24. Customer Location Privacy

Customer delivery coordinates must not be publicly exposed.

They should only be accessible to authorized systems/users involved in fulfilling the order.

Access should be restricted by:

* authenticated identity
* order ownership
* restaurant relationship
* rider assignment
* admin permission
* business rules

---

# 25. Order Location Snapshot

When an order is created, QuickBite must preserve the destination used for that order.

The snapshot should contain sufficient delivery information such as:

```text
recipient_name
recipient_phone
address_text
area
city
postal_code
latitude
longitude
delivery_instructions
```

Changing the customer's saved address later must not silently change an existing order.

---

# 26. Delivery Fee

If delivery fee depends on distance, the backend calculates it using authoritative location data.

The client must never submit:

```text
delivery_fee = 0
```

or another arbitrary value and expect the backend to accept it.

The backend recalculates:

```text
restaurant location
        +
customer delivery location
        ↓
distance calculation
        ↓
delivery pricing rules
        ↓
delivery fee
```

Delivery pricing rules remain separate from the MapsService.

Maps determine geographic facts; pricing rules determine financial outcomes.

---

# 27. ETA

ETA is an estimate, not a guarantee.

ETA may depend on:

* route distance
* traffic information where available
* rider location
* restaurant preparation time
* dispatch time
* operational conditions

The backend should expose ETA using a normalized internal model.

Example:

```text
estimated_preparation_time
estimated_pickup_time
estimated_delivery_time
```

---

# 28. ETA Authority

The backend should be the authoritative source for customer-facing operational ETA.

The client may animate or display the value but should not independently determine the official ETA.

ETA may be recalculated during an active delivery.

---

# 29. Restaurant Preparation Time

Restaurant preparation time is separate from map travel time.

Example:

```text
Food preparation
        +
Rider travel to restaurant
        +
Pickup
        +
Travel to customer
        =
Estimated delivery timeline
```

Do not treat map routing as restaurant preparation time.

---

# 30. Service Area

QuickBite may eventually support geographic service areas.

Possible models include:

* radius
* polygon
* city
* zone

V1 may use radius-based delivery configuration.

More advanced geographic zones should be introduced only when justified.

---

# 31. Zone Architecture

If zones are introduced, the architecture should support:

```text
Customer coordinates
        ↓
Zone lookup
        ↓
Applicable configuration
        ↓
Delivery eligibility / pricing / dispatch rules
```

Zone configuration must not be duplicated across unrelated modules.

---

# 32. Restaurant Discovery by Location

Customer restaurant discovery may use:

* customer coordinates
* selected delivery address
* city/area
* restaurant status
* restaurant delivery radius

Only restaurants currently eligible to receive the customer's order should be presented as orderable.

A restaurant may appear in discovery but still be unavailable for ordering.

---

# 33. Restaurant Availability

Location does not override restaurant status.

For example:

```text
Customer within radius
+
Restaurant OFFLINE
=
Not orderable
```

Likewise:

```text
Customer outside delivery area
+
Restaurant ONLINE
=
Not orderable
```

Both geographic and operational eligibility must be checked.

---

# 34. Location-Based Risk Signals

The Risk Engine may use location-related signals when appropriate.

Examples:

* impossible travel patterns
* suspicious location changes
* repeated abnormal delivery locations
* suspicious rider GPS behavior

Location signals must be treated as risk inputs rather than automatic proof of fraud.

See:

```text
docs/business-rules/RISK_RULES.md
```

---

# 35. GPS Spoofing

QuickBite should detect suspicious GPS behavior where technically feasible.

Possible signals include:

* impossible movement speed
* sudden large coordinate jumps
* repeated identical coordinates
* unrealistic GPS accuracy
* emulator/device indicators where available
* inconsistent movement with delivery state

A suspicious signal should feed the Trust & Risk Engine rather than automatically causing a permanent account action.

---

# 36. Location Manipulation

The backend must not trust:

* client-calculated distance
* client-calculated ETA
* client-provided rider proximity
* client-provided delivery eligibility
* client-provided route completion
* client-provided "arrived" claims

The backend verifies relevant conditions independently.

---

# 37. Arrival at Restaurant

Rider arrival may use multiple signals.

Possible signals:

* rider GPS proximity
* explicit rider action
* restaurant confirmation
* delivery state
* timestamp
* operational rules

No single client-provided GPS event should automatically prove pickup unless the backend's configured business rule allows it.

---

# 38. Pickup Verification

Pickup should be verified through the Delivery workflow.

Possible future controls include:

* rider confirmation
* restaurant confirmation
* pickup PIN
* QR code
* order code

Any stronger verification mechanism must be specified separately before implementation.

---

# 39. Delivery Completion Location

Delivery completion may be supported by:

* rider confirmation
* customer confirmation
* delivery PIN
* GPS proximity
* other configured verification

The exact completion policy must be defined by the Delivery/Order rules before implementation.

---

# 40. Location Permissions

Customer App should request location permission only when needed.

Examples:

* selecting current location
* map-based address selection
* nearby restaurant discovery

Rider App requires stronger location handling because location is an operational requirement.

Permission denial must not crash the application.

---

# 41. Permission Denied Behavior

If a customer denies location permission:

The app should still allow:

* manual address entry
* saved address selection
* search-based address selection

If a rider denies required location access:

The Rider App should clearly communicate that online delivery functionality may be unavailable.

---

# 42. Background Location

Background location must only be used when operationally necessary.

For riders, background location may be required during:

* online mode
* active delivery

For customers, continuous background location tracking should not be required for normal V1 usage.

---

# 43. Location Permission UX

Permission requests should explain:

* why location is needed
* what functionality depends on it
* when it is used

Do not request location access unnecessarily at application startup.

---

# 44. Location Failure Handling

Location services may fail because of:

* GPS disabled
* permission denied
* weak GPS
* network failure
* provider failure
* stale coordinates
* device restrictions

The system must degrade gracefully.

Examples:

```text
No customer GPS
→ manual address selection

No rider GPS
→ rider cannot remain eligible for location-dependent dispatch

Map provider unavailable
→ existing saved addresses remain usable where possible
```

---

# 45. Provider Failure

Map provider failures must not corrupt:

* orders
* payments
* earnings
* settlements
* rider assignments

If a map provider is temporarily unavailable:

* do not invent coordinates
* do not invent distance
* do not invent ETA
* use cached data only where safe
* retry through background mechanisms where appropriate
* expose a controlled error

---

# 46. Caching

Maps responses may be cached where legally and technically permitted.

Cache only data where stale information will not cause unsafe or financially incorrect behavior.

Never use stale cached location data as authoritative current rider location beyond configured freshness rules.

---

# 47. Geocoding Caching

Geocoding results may be cached to reduce provider costs.

Cached results must still be treated as location data subject to validation.

The cache must have an appropriate expiration strategy.

---

# 48. Map Provider Quotas

Provider quotas and API limits must be monitored.

The system should prevent uncontrolled client-side map API usage.

Where appropriate:

```text
Client
  ↓
QuickBite backend
  ↓
MapsService
  ↓
Provider
```

Provider credentials must remain protected.

---

# 49. API Security

Map-provider API keys must not expose privileged server credentials to clients.

Public client keys, if required by the provider, must use provider-supported restrictions.

Server-side credentials must be stored in secure secret management.

---

# 50. Authorization

Location APIs must enforce:

```text
Authentication
→ Identity
→ Role
→ Permission
→ Resource Ownership / Relationship
→ Business Rule
```

Examples:

Customer:

```text
Can access own addresses
Can access own active-order tracking
```

Rider:

```text
Can update own location
Can access assigned delivery information
```

Restaurant:

```text
Can access location information required for its own orders
```

Admin:

```text
Access depends on explicit administrative permission
```

---

# 51. Audit

Sensitive administrative location operations should be auditable.

Examples:

* manual location override
* delivery destination correction
* manual rider reassignment based on location
* administrative location access where required

---

# 52. Data Retention

Location retention must be purpose-based.

Recommended categories:

### Current rider location

Short-lived.

### Active delivery tracking

Retained for operational needs and configured history requirements.

### Historical GPS

Retained only when necessary for:

* dispute resolution
* fraud investigation
* operational analysis
* regulatory/legal requirements

Retention periods must be configurable and documented.

---

# 53. Financial Separation

Location calculations must never directly mutate financial records.

Correct flow:

```text
MapsService
    ↓
Distance / route fact
    ↓
Pricing Rule
    ↓
Delivery Fee
    ↓
Order Financial Snapshot
```

This keeps geographic services separate from financial authority.

---

# 54. Cancellation Integration

Cancellation must not be based solely on map status.

Cancellation remains controlled by:

```text
Cancellation Rules Engine
```

Location information may be used as an input for operational decisions, but must not bypass cancellation rules.

---

# 55. Dispatch Integration

Dispatch uses:

* restaurant coordinates
* rider current coordinates
* rider freshness
* rider eligibility
* delivery constraints
* dispatch configuration

Dispatch remains controlled by:

```text
Delivery Dispatch Engine
```

See:

```text
docs/business-rules/DISPATCH_RULES.md
```

---

# 56. Order Integration

Order creation must verify:

* delivery address exists
* coordinates are valid where required
* restaurant can serve destination
* restaurant is orderable
* delivery pricing can be calculated

The final order stores the location snapshot.

---

# 57. Admin Location Operations

Admins may need operational tools to:

* inspect restaurant location
* inspect delivery destination
* inspect active rider location
* troubleshoot delivery issues
* manually correct eligible location data
* investigate location-related disputes

Administrative access must be permission-controlled and audited.

---

# 58. Location Override

Manual location overrides are sensitive.

An override should record:

* actor
* previous value
* new value
* reason
* timestamp
* affected resource

Existing completed financial/order records should not be silently rewritten.

---

# 59. Data Integrity

Location fields must use appropriate database types.

Avoid storing coordinates as arbitrary strings for authoritative geographic calculations.

Recommended PostgreSQL representation may use:

* numeric latitude/longitude columns
* PostGIS where justified

The final implementation must follow the architecture decision documented in the Maps technical specification.

---

# 60. V1 Simplicity

QuickBite V1 should avoid unnecessary geographic complexity.

V1 should prioritize:

* address coordinates
* restaurant coordinates
* rider live location
* radius-based delivery eligibility
* proximity-based dispatch
* route/ETA abstraction
* basic live tracking
* configurable location freshness
* provider abstraction

Avoid implementing advanced geographic optimization unless required.

---

# 61. Definition of Done

Maps/location functionality is complete only when:

* [ ] Address coordinates are validated
* [ ] Restaurant coordinates are stored
* [ ] Customer delivery location is snapshotted
* [ ] Geocoding is abstracted
* [ ] Reverse geocoding is abstracted
* [ ] Distance calculation is backend-authoritative
* [ ] Delivery radius is configurable
* [ ] Rider location is stored safely
* [ ] Rider location freshness is enforced
* [ ] Redis geospatial lookup works
* [ ] Dispatch integration works
* [ ] Customer live tracking is authorized
* [ ] Location privacy is enforced
* [ ] GPS accuracy is handled
* [ ] Permission-denied states are handled
* [ ] Provider failure is handled
* [ ] Map credentials are secured
* [ ] Location-related actions are auditable where required
* [ ] Tests cover normal and failure cases

---

# 62. Claude Code Implementation Rules

Before implementing maps/location:

1. Read:

   * `docs/architecture/ARCHITECTURE.md`
   * `docs/database/DATABASE.md`
   * `docs/api/API_SPEC.md`
   * `docs/business-rules/ORDER_RULES.md`
   * `docs/business-rules/DISPATCH_RULES.md`
   * `docs/business-rules/RISK_RULES.md`
   * `docs/security/AUTH_AUTHORIZATION.md`
   * this document
   * `docs/maps/MAPS_LOCATION_SPEC.md`

2. Do not invent location behavior.

3. Do not put provider-specific logic into business modules.

4. Do not trust client-provided distance or ETA.

5. Do not hard-code delivery radius or location freshness thresholds.

6. Keep current rider location separate from durable order data.

7. Preserve delivery location snapshots.

8. Enforce authorization on all location APIs.

9. Add tests before considering location functionality complete.

10. If implementation requirements conflict with this specification, stop and report the conflict instead of silently changing the architecture.

---

# 63. Final Rule

**Maps provide geographic information. QuickBite business rules decide what that information means.**

The Maps layer must never become the authority for:

* order state
* rider assignment
* payment
* pricing
* cancellation
* permissions
* financial records
* risk decisions

Those remain controlled by their respective backend modules and business-rule engines.
