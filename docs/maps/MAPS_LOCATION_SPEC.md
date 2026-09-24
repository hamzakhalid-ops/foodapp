# QuickBite — Maps & Location Technical Specification

**File:** `docs/maps/MAPS_LOCATION_SPEC.md`
**Phase:** 9 — Maps & Location Specification
**Status:** Specification
**Architecture:** Modular Monolith V1

---

# 1. Purpose

This document defines the technical architecture for QuickBite's mapping and location infrastructure.

It converts the location business rules into implementation-level requirements for:

* geocoding
* reverse geocoding
* routing
* distance calculation
* ETA
* restaurant coordinates
* customer addresses
* rider live location
* Redis geospatial indexing
* location freshness
* delivery radius
* live delivery tracking
* map-provider abstraction
* location APIs
* caching
* security
* failure handling
* monitoring
* testing

---

# 2. Architecture Principle

QuickBite must use a provider-independent Maps layer.

Business modules must communicate with:

```text
MapsService
```

rather than directly calling a specific provider.

Architecture:

```text
Customer App
Restaurant App
Rider App
Admin Panel
        ↓
      API
        ↓
  Location Module
        ↓
    MapsService
        ↓
 Maps Provider Adapter
        ↓
External Maps Provider
```

The selected provider is an infrastructure decision rather than a business-rule dependency.

---

# 3. MapsService

The backend should expose an internal service abstraction similar to:

```text
MapsService
```

Core operations:

```text
geocode(address)
reverseGeocode(latitude, longitude)
calculateDistance(origin, destination)
calculateRoute(origin, destination)
calculateETA(origin, destination, options)
validateCoordinates(latitude, longitude)
```

The exact programming-language interface should follow the backend stack.

---

# 4. Provider Adapter

A provider adapter isolates external APIs.

Example:

```text
MapsService
    ↓
MapsProviderInterface
    ↓
ProviderAdapter
```

Potential implementations:

```text
GoogleMapsProvider
MapboxProvider
OpenStreetMapProvider
OtherProvider
```

The actual provider is selected through configuration.

Business modules must not import provider-specific SDKs directly.

---

# 5. Provider Configuration

Provider configuration must use environment/secret configuration.

Example:

```text
MAPS_PROVIDER
MAPS_API_KEY
MAPS_SERVER_API_KEY
MAPS_REGION
MAPS_TIMEOUT_MS
```

Sensitive credentials must never be committed to Git.

---

# 6. Geocoding Interface

Conceptual request:

```text
geocode({
  address,
  city?,
  country?
})
```

Normalized response:

```text
{
  latitude,
  longitude,
  formattedAddress,
  components,
  confidence
}
```

Provider-specific fields should not leak into the application.

---

# 7. Reverse Geocoding Interface

Conceptual request:

```text
reverseGeocode({
  latitude,
  longitude
})
```

Normalized response:

```text
{
  latitude,
  longitude,
  formattedAddress,
  components,
  confidence
}
```

The returned address is a candidate representation, not automatically the customer's confirmed delivery address.

---

# 8. Routing Interface

Conceptual request:

```text
calculateRoute({
  origin,
  destination,
  mode
})
```

Possible response:

```text
{
  distanceMeters,
  durationSeconds,
  routeGeometry?,
  providerMetadata?
}
```

Provider metadata should be minimized and normalized.

---

# 9. ETA Interface

Conceptual request:

```text
calculateETA({
  origin,
  destination,
  mode,
  departureTime?
})
```

Response:

```text
{
  durationSeconds,
  distanceMeters,
  calculatedAt
}
```

ETA is an estimate and must include calculation time.

---

# 10. Geographic Coordinate Model

Canonical internal coordinate representation:

```text
latitude: decimal
longitude: decimal
```

Coordinate system:

```text
WGS 84 / EPSG:4326
```

Database precision must be sufficient for delivery operations.

Do not use floating-point money types for geographic pricing calculations.

---

# 11. PostgreSQL Location Storage

Persistent resources such as:

* restaurants
* addresses
* order delivery snapshots

store their coordinates in PostgreSQL.

The implementation may use:

```text
latitude NUMERIC
longitude NUMERIC
```

or a PostGIS geographic type if the project adopts PostGIS.

The choice should be recorded as an ADR before implementation if PostGIS is introduced.

---

# 12. PostGIS Consideration

PostGIS is useful for:

* radius searches
* spatial indexes
* polygon service areas
* advanced geographic queries

However, QuickBite V1 does not require introducing PostGIS if Redis geospatial operations plus standard coordinate columns are sufficient.

Do not introduce PostGIS solely because it is technically available.

If geographic requirements become more advanced, adopt it through an ADR.

---

# 13. Restaurant Coordinates

Restaurant records should contain authoritative coordinates.

Example:

```text
restaurants
    latitude
    longitude
```

Coordinates are established during:

* restaurant onboarding
* restaurant address changes
* administrative correction

Coordinate changes should be permission-controlled.

---

# 14. Customer Address Coordinates

`addresses` should contain:

```text
latitude
longitude
```

where location is required for delivery.

The backend validates coordinates before saving.

---

# 15. Order Delivery Snapshot

At order creation, copy the relevant delivery information into an immutable order-level representation.

The existing database design already includes:

```text
delivery_address_id
```

The implementation should additionally preserve the actual delivery destination used by the order so that future address edits cannot change historical delivery meaning.

If the final schema requires an explicit order delivery snapshot table or fields, update `DATABASE.md` through an ADR/migration specification before implementation.

---

# 16. Current Rider Location

Current rider location should be stored in Redis.

Conceptual data:

```text
rider_location:{riderId}
```

Example:

```text
{
  latitude,
  longitude,
  accuracyMeters,
  recordedAt,
  heading?,
  speed?
}
```

Only fields required for V1 should be retained.

---

# 17. Redis Geospatial Index

Use a Redis geospatial structure for nearby-rider queries.

Conceptually:

```text
GEOADD riders:locations longitude latitude riderId
```

The exact Redis implementation should follow the Redis client/library used by the backend.

Important:

Redis location data is temporary operational state.

PostgreSQL remains the durable source of truth for:

* rider identity
* rider approval
* rider status
* deliveries
* assignments
* earnings

---

# 18. Rider Presence

Redis may also track:

```text
online
available
lastSeen
```

Presence must have expiration/heartbeat semantics.

A rider who disappears without a clean offline event must eventually become unavailable.

---

# 19. Rider Heartbeat

Rider App should periodically communicate its operational state.

Possible heartbeat data:

```text
riderId
online
available
timestamp
```

Location updates may also refresh presence.

The exact heartbeat interval must be configurable.

---

# 20. Rider Location Update

Conceptual API:

```http
POST /api/v1/riders/me/location
```

Request:

```json
{
  "latitude": 31.5204,
  "longitude": 74.3587,
  "accuracyMeters": 12,
  "heading": 90,
  "speedMetersPerSecond": 5.2,
  "recordedAt": "2026-01-01T12:00:00Z"
}
```

The backend must validate:

* authenticated rider
* rider approval
* rider account status
* coordinate range
* timestamp
* accuracy
* impossible movement
* stale/future timestamps

---

# 21. Location Timestamp Validation

The backend must not blindly accept arbitrary timestamps.

Possible validation:

```text
future timestamp
→ reject

extremely old timestamp
→ reject or ignore

reasonable timestamp
→ process
```

Server receipt time must also be recorded.

---

# 22. Location Update Ordering

Out-of-order GPS updates must not overwrite newer location state.

Example:

```text
Update A
recorded_at = 10:05

Update B
recorded_at = 10:06

Update A arrives after B
```

The backend/Redis update process must prevent A from replacing B.

---

# 23. Location Accuracy

If:

```text
accuracyMeters
```

is supplied, it should be validated.

Extremely poor accuracy may cause:

* location update rejection
* dispatch exclusion
* lower ranking
* stale status

The exact thresholds must be configurable.

---

# 24. Impossible Movement

The system should detect obvious impossible movement.

Example:

```text
Location A
        ↓
Location B
        ↓
Impossible speed
```

This may generate:

```text
SUSPICIOUS_LOCATION_MOVEMENT
```

for the Risk Engine where appropriate.

This should not automatically result in account suspension.

---

# 25. Nearby Rider Search

Dispatch Engine may request:

```text
findNearbyRiders(
  restaurantLatitude,
  restaurantLongitude,
  radius
)
```

The Location/Dispatch infrastructure returns candidate rider IDs.

It must not make the final eligibility decision.

---

# 26. Dispatch Separation

Correct architecture:

```text
Location Module
    ↓
Nearby Rider Candidates
    ↓
Dispatch Engine
    ↓
Eligibility Rules
    ↓
Ranking
    ↓
Offer
    ↓
Assignment
```

Location infrastructure finds geographic candidates.

Dispatch owns business eligibility.

---

# 27. Radius Expansion

Dispatch may search using:

```text
initial radius
        ↓
if no suitable rider
        ↓
expanded radius
        ↓
continue until maximum radius
```

Configuration comes from:

```text
dispatch_settings
```

Location infrastructure should support arbitrary requested radius values.

---

# 28. Restaurant Delivery Radius

Restaurant delivery radius may be stored in:

```text
restaurant_delivery_settings.delivery_radius
```

The backend uses this value for orderability.

Example:

```text
restaurant
   ↓
delivery radius
   ↓
customer coordinates
   ↓
distance
   ↓
eligible / ineligible
```

---

# 29. Straight-Line Distance API

A geographic distance utility should support:

```text
distanceBetween(origin, destination)
```

It may use the Haversine formula or an equivalent geographic calculation.

This is appropriate for:

* proximity
* radius checks
* candidate filtering

It should not automatically represent driving distance.

---

# 30. Route Distance

Driving route distance should be obtained from the MapsService routing abstraction where needed.

Example:

```text
restaurant → customer
```

The result may be used for:

* ETA
* customer delivery estimates
* operational calculations
* analytics

---

# 31. Delivery Pricing

Delivery pricing must not depend directly on provider-specific route responses.

Correct architecture:

```text
MapsService
     ↓
Distance fact
     ↓
Delivery Pricing Service
     ↓
Delivery fee
```

The pricing service owns financial rules.

---

# 32. Delivery Fee Configuration

Delivery pricing may eventually support:

* flat fee
* distance-based fee
* zone-based fee
* minimum/maximum fee

V1 should implement only the approved pricing model.

Any additional model requires product approval and documentation.

---

# 33. ETA Calculation

ETA can combine:

```text
restaurant preparation estimate
+
route duration
+
operational buffer
```

Example:

```text
ETA =
preparation time
+
rider travel to restaurant
+
pickup buffer
+
restaurant-to-customer route time
```

Exact formula belongs to the Order/Delivery implementation and must not be invented by the frontend.

---

# 34. ETA Recalculation

ETA may be recalculated when:

* restaurant preparation estimate changes
* rider is assigned
* rider location changes materially
* route changes
* traffic changes where provider supports it
* delivery state changes

Avoid recalculating unnecessarily on every GPS packet.

---

# 35. Live Tracking

During an active delivery:

```text
Rider App
   ↓
Location API
   ↓
Redis current location
   ↓
Realtime layer
   ↓
Customer App
```

The customer receives only the location associated with the active order.

---

# 36. WebSocket Authorization

Before a customer subscribes to:

```text
order:{orderId}:tracking
```

the backend must verify:

```text
authenticated user
+
customer owns order
+
order is trackable
```

Equivalent authorization applies to:

* rider channels
* restaurant channels
* admin channels

---

# 37. Realtime Location Events

Possible event:

```text
delivery.location.updated
```

Payload should be minimized.

Example:

```json
{
  "orderId": "order-id",
  "latitude": 31.5204,
  "longitude": 74.3587,
  "heading": 90,
  "recordedAt": "2026-01-01T12:00:00Z"
}
```

Do not expose internal Redis data or sensitive metadata.

---

# 38. Location Event Throttling

GPS updates may arrive more frequently than customers need.

The realtime layer may throttle/batch updates to reduce:

* WebSocket traffic
* mobile battery consumption
* server load

The current location in Redis can still update at a different frequency.

---

# 39. Reconnection

When a customer's WebSocket disconnects:

```text
WebSocket reconnect
        ↓
authenticate
        ↓
authorize order channel
        ↓
retrieve current order state
        ↓
retrieve current rider location
        ↓
resume realtime updates
```

Do not rely on receiving every historical GPS event.

---

# 40. Event Ordering

Location events are inherently time-sensitive.

Each event should contain:

```text
recordedAt
```

and preferably a server-side sequence/version where required.

Clients should ignore older updates when necessary.

---

# 41. Offline Customer

If the customer is offline:

* location events do not need indefinite buffering
* latest state can be retrieved after reconnect
* active-order state should be available through normal API

Do not build an unlimited location event queue.

---

# 42. Offline Rider

If rider connectivity is lost:

```text
last location
        ↓
freshness timer
        ↓
stale
        ↓
rider becomes unavailable for new dispatch
```

An existing active delivery may require additional operational handling rather than immediate cancellation.

---

# 43. Map Provider Timeout

External map requests should have bounded timeouts.

Example configuration:

```text
MAPS_TIMEOUT_MS
```

If provider response exceeds the timeout:

* fail gracefully
* do not block critical transactions indefinitely
* log the failure
* emit metrics
* retry only where safe

---

# 44. Map Provider Retry

Retries must use:

* bounded attempts
* exponential backoff where appropriate
* jitter
* idempotent/read-safe operations

Do not repeatedly retry a failing provider synchronously during checkout or order creation if doing so can create latency or cascading failure.

---

# 45. Provider Rate Limits

Handle:

```text
HTTP 429
```

or provider-equivalent rate-limit responses.

Use:

* backoff
* quota monitoring
* caching
* request reduction
* provider fallback only if explicitly configured

---

# 46. Provider Fallback

Provider fallback may eventually support:

```text
Primary Provider
       ↓
failure
       ↓
Secondary Provider
```

However, V1 should not implement multi-provider complexity unless operationally necessary.

The abstraction should make future fallback possible.

---

# 47. Geocoding Cache

A cache may use a normalized address key.

Example:

```text
geocode:{normalizedAddressHash}
```

Cache entries should include:

* coordinates
* formatted address
* confidence
* provider
* created/updated time
* expiration

Do not cache sensitive user identifiers in the key.

---

# 48. Route Cache

Route caching may be used carefully.

Avoid caching routes where changing traffic conditions make stale results misleading.

Route caching is more suitable for:

* repeated static routes
* non-time-sensitive operations
* controlled analytics

---

# 49. API Endpoints

The API specification should include location endpoints such as:

### Customer

```http
POST   /api/v1/addresses
GET    /api/v1/addresses
GET    /api/v1/addresses/:id
PATCH  /api/v1/addresses/:id
DELETE /api/v1/addresses/:id
POST   /api/v1/addresses/geocode
POST   /api/v1/addresses/reverse-geocode
```

### Rider

```http
POST /api/v1/riders/me/location
POST /api/v1/riders/me/presence
```

### Restaurant

```http
PATCH /api/v1/restaurants/me/location
GET   /api/v1/restaurants/me/delivery-settings
PATCH /api/v1/restaurants/me/delivery-settings
```

### Delivery Tracking

```http
GET /api/v1/orders/:orderId/tracking
```

Exact endpoint definitions must remain consistent with:

```text
docs/api/API_SPEC.md
```

---

# 50. Geocoding API Security

Public client-facing geocoding must have:

* authentication where appropriate
* rate limiting
* abuse protection
* provider quota controls

Do not allow an unauthenticated endpoint to proxy unlimited map-provider requests.

---

# 51. Location API Rate Limits

Example categories:

```text
address creation
geocoding
reverse geocoding
rider location updates
tracking reads
```

Rider location updates require a higher-frequency but controlled rate limit.

The exact numeric limits should be configuration rather than hard-coded business logic.

---

# 52. Database Indexes

Indexes should support:

* restaurant location lookup where required
* address ownership
* rider profile lookup
* delivery/order lookup
* active delivery lookup

If PostGIS is introduced, spatial indexes must be used appropriately.

Do not add unnecessary indexes before measuring query patterns.

---

# 53. Location Service Module

Recommended backend structure:

```text
backend/
└── modules/
    └── location/
        ├── application/
        ├── domain/
        ├── infrastructure/
        ├── providers/
        ├── controllers/
        ├── services/
        └── tests/
```

The exact folder naming should follow the project's final backend framework conventions.

---

# 54. Location Domain Responsibilities

The Location module should own:

* coordinate validation
* geocoding abstraction
* reverse geocoding abstraction
* route abstraction
* distance utilities
* current location infrastructure
* location freshness
* provider normalization

It should not own:

* order cancellation
* rider assignment
* payment
* earnings
* restaurant authorization
* risk decisions

---

# 55. Redis Responsibilities

Redis may own temporary:

* rider current location
* rider geospatial index
* rider presence
* location freshness state
* temporary tracking state

Redis must not become the permanent system of record for:

* orders
* payments
* settlements
* rider identities
* restaurant identities

---

# 56. PostgreSQL Responsibilities

PostgreSQL owns durable:

* addresses
* restaurant coordinates
* delivery location snapshots
* rider location events where retained
* audit information
* order/delivery records

---

# 57. Background Jobs

Background workers may handle:

* stale rider cleanup
* provider retry
* location history processing
* geocoding retry
* analytics aggregation
* cleanup of expired temporary location state

Jobs must be idempotent.

---

# 58. Stale Rider Cleanup

A background process may periodically identify riders whose presence has expired.

Example:

```text
online=true
        ↓
heartbeat missing
        ↓
presence expires
        ↓
available=false
        ↓
excluded from new dispatch
```

Do not directly delete durable rider records.

---

# 59. Delivery Tracking State

Active tracking should derive from:

```text
Order
+
Delivery
+
Rider current location
```

Do not create an independent second source of truth for delivery status.

---

# 60. Security

Location security must include:

* HTTPS
* authenticated APIs
* RBAC
* resource ownership checks
* tenant isolation
* rate limiting
* audit logging for sensitive operations
* secret management
* input validation
* abuse detection
* privacy-aware retention

---

# 61. Authorization Examples

### Customer

Allowed:

```text
Own addresses
Own active-order tracking
```

Denied:

```text
Other customer addresses
Other rider locations
Other orders
```

### Rider

Allowed:

```text
Own location updates
Assigned delivery tracking
```

Denied:

```text
Other riders' private location history
```

### Restaurant Operator

Allowed:

```text
Restaurant orders
Operational rider information related to those orders
```

Denied:

```text
Unrelated customer data
Unrelated rider tracking
```

### Admin

Access depends on explicit permission.

---

# 62. Privacy

Do not expose:

* unnecessary GPS precision
* historical rider tracks
* unrelated customer coordinates
* internal provider metadata
* private location logs

Location data must follow least-privilege access.

---

# 63. Monitoring

Track metrics including:

```text
maps.geocode.success
maps.geocode.failure
maps.reverse_geocode.success
maps.route.success
maps.route.failure
maps.provider.latency
maps.provider.rate_limit
rider.location.update.success
rider.location.update.failure
rider.location.stale
dispatch.nearby_search.latency
tracking.websocket.connected
tracking.websocket.disconnected
```

---

# 64. Alerts

Operational alerts may be configured for:

* map-provider outage
* unusual provider latency
* quota exhaustion
* abnormal API error rate
* Redis location failures
* excessive stale riders
* abnormal GPS update failures
* WebSocket tracking failures

---

# 65. Logging

Logs should include correlation IDs.

Example:

```text
requestId
userId
riderId
orderId
provider
operation
latency
result
```

Do not log unnecessary sensitive location data.

Where coordinates must be logged for debugging, use controlled access and appropriate redaction/retention.

---

# 66. Testing

Required unit tests:

* coordinate validation
* Haversine distance
* timestamp validation
* location freshness
* impossible movement detection
* provider response normalization
* delivery radius checks

Integration tests:

* MapsService provider adapter
* Redis geospatial lookup
* rider presence
* rider location update
* stale location handling
* address geocoding
* tracking authorization

E2E tests:

* customer selects address
* restaurant delivery eligibility
* rider goes online
* rider sends location
* READY order triggers nearby-rider search
* rider receives dispatch offer
* active delivery exposes authorized tracking
* customer reconnects and receives current location

---

# 67. Failure Testing

Test:

* maps provider unavailable
* maps provider timeout
* maps provider rate limit
* Redis unavailable
* stale GPS
* invalid GPS
* out-of-order GPS
* duplicate GPS updates
* WebSocket disconnect
* customer unauthorized tracking request
* rider unauthorized location update
* location permission denied
* GPS disabled
* network loss

---

# 68. Golden Location Flow

```text
Customer selects address
        ↓
Geocode / reverse geocode
        ↓
Backend validates coordinates
        ↓
Address saved
        ↓
Customer selects restaurant
        ↓
Backend checks restaurant availability
        ↓
Backend calculates delivery eligibility
        ↓
Customer creates order
        ↓
Delivery location snapshot created
        ↓
Restaurant prepares order
        ↓
Order becomes READY_FOR_PICKUP
        ↓
Dispatch Engine requests nearby riders
        ↓
Redis geospatial lookup
        ↓
Eligible riders filtered
        ↓
Rider accepts
        ↓
Rider sends live location
        ↓
Customer receives authorized tracking
        ↓
Rider reaches restaurant
        ↓
Pickup
        ↓
Rider travels to customer
        ↓
Delivery completed
        ↓
Tracking ends
```

---

# 69. Critical Invariants

The following must always remain true:

### Location Invariant 1

Invalid coordinates cannot become authoritative delivery coordinates.

### Location Invariant 2

Client-provided distance cannot determine financial or operational outcomes.

### Location Invariant 3

Stale rider location cannot be treated as current.

### Location Invariant 4

A customer cannot access another customer's or unrelated rider's location.

### Location Invariant 5

Current rider location does not replace durable delivery state.

### Location Invariant 6

Changing a saved customer address does not rewrite an existing order's delivery destination.

### Location Invariant 7

Maps provider failure cannot corrupt order or payment state.

### Location Invariant 8

Location infrastructure cannot bypass Dispatch, Cancellation, Risk, Authorization, or Financial rules.

---

# 70. Configuration

Location-related configuration should be centrally managed.

Examples:

```text
MAPS_PROVIDER
MAPS_TIMEOUT_MS
LOCATION_UPDATE_INTERVAL
LOCATION_STALE_AFTER_SECONDS
LOCATION_MAX_ACCURACY_METERS
TRACKING_UPDATE_INTERVAL
GEOCODING_CACHE_TTL
ROUTE_CACHE_TTL
```

Business-critical configuration should be managed according to the project's configuration architecture rather than scattered environment variables.

---

# 71. No Hard-Coded Business Thresholds

Do not hard-code:

```text
5 km radius
30 second freshness
100 meter GPS accuracy
10 second tracking interval
```

unless explicitly approved as technical defaults.

Business thresholds should be configurable.

---

# 72. API Response Principles

Location APIs should use the standard API envelope defined in:

```text
docs/api/API_SPEC.md
```

Errors should use standardized codes.

Examples:

```text
INVALID_COORDINATES
LOCATION_PERMISSION_REQUIRED
LOCATION_STALE
LOCATION_UNAVAILABLE
ADDRESS_NOT_SERVICEABLE
MAPS_PROVIDER_UNAVAILABLE
TRACKING_ACCESS_DENIED
```

---

# 73. Idempotency

Location updates generally do not require traditional financial-style idempotency keys.

However:

* duplicate updates must be harmless
* stale updates must not overwrite newer state
* retrying the same update must not corrupt presence

Address creation and other state-changing APIs should follow normal API idempotency rules where applicable.

---

# 74. Transaction Boundaries

Maps calls should not unnecessarily occur inside long-running database transactions.

Prefer:

```text
validate input
    ↓
external map operation
    ↓
validate result
    ↓
short DB transaction
```

For critical order creation, use a design that avoids holding DB locks while waiting on external providers.

---

# 75. External Provider Isolation

External map providers must be treated as unreliable dependencies.

The backend should isolate them using:

* timeouts
* retries
* circuit breaking where justified
* metrics
* logging
* caching
* rate limiting

---

# 76. Versioning

MapsService should have an internal interface stable enough that changing providers does not require rewriting:

* Orders
* Restaurants
* Riders
* Dispatch
* Customer tracking

Provider changes should primarily affect the infrastructure adapter.

---

# 77. ADR Requirements

Create an ADR before introducing major location architecture changes such as:

* PostGIS
* multi-provider routing
* advanced polygon zones
* complex route optimization
* high-volume historical GPS storage
* dedicated location microservice

Example:

```text
docs/decisions/ADR/XXXX-location-storage.md
```

---

# 78. Implementation Order

Recommended implementation sequence:

### Step 1

Coordinate model and validation.

### Step 2

Restaurant location.

### Step 3

Customer address location.

### Step 4

MapsService abstraction.

### Step 5

Geocoding/reverse geocoding.

### Step 6

Distance calculation.

### Step 7

Delivery eligibility.

### Step 8

Rider current location.

### Step 9

Redis geospatial index.

### Step 10

Location freshness/presence.

### Step 11

Dispatch integration.

### Step 12

ETA/routing.

### Step 13

Realtime tracking.

### Step 14

Monitoring and failure handling.

### Step 15

Full E2E testing.

---

# 79. Claude Code Implementation Rules

Before coding:

1. Read all authoritative architecture documents.
2. Inspect the current database schema.
3. Inspect the current API specification.
4. Inspect Dispatch Rules.
5. Inspect Auth/Authorization.
6. Inspect Notifications/Realtime specifications.
7. Inspect this document and `MAPS_LOCATION_RULES.md`.
8. Identify any conflicts.
9. Do not invent provider behavior.
10. Do not expose provider credentials.
11. Do not trust client-side location calculations.
12. Do not change frozen business rules.
13. Implement vertical slices.
14. Add tests with each slice.
15. Update documentation when an approved architecture change occurs.

---

# 80. Definition of Done

Phase 9 technical implementation readiness requires:

* [ ] MapsService abstraction defined
* [ ] Provider adapter defined
* [ ] Coordinate standard defined
* [ ] Restaurant location model defined
* [ ] Customer address location model defined
* [ ] Order delivery snapshot defined
* [ ] Rider location model defined
* [ ] Redis geospatial architecture defined
* [ ] Rider freshness rules defined
* [ ] Geocoding interface defined
* [ ] Reverse geocoding interface defined
* [ ] Routing interface defined
* [ ] ETA interface defined
* [ ] Delivery radius architecture defined
* [ ] Dispatch integration defined
* [ ] Live tracking architecture defined
* [ ] WebSocket authorization defined
* [ ] Location privacy defined
* [ ] Provider failure handling defined
* [ ] Rate limiting defined
* [ ] Monitoring defined
* [ ] Testing defined
* [ ] Critical invariants documented
* [ ] Claude Code implementation rules documented

---

# 81. Final Architecture

```text
                    ┌──────────────────────┐
                    │ Customer App         │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Restaurant App       │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Rider App             │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Admin Panel           │
                    └──────────┬───────────┘
                               │
                        ┌──────▼──────┐
                        │ API Layer   │
                        └──────┬──────┘
                               │
                  ┌────────────▼────────────┐
                  │ Location Module         │
                  │                         │
                  │ Coordinate Validation   │
                  │ Address Location        │
                  │ Rider Location           │
                  │ Location Freshness       │
                  │ Distance                 │
                  │ Geocoding               │
                  │ Routing                 │
                  │ ETA                     │
                  └───────┬────────┬────────┘
                          │        │
                 ┌────────▼───┐ ┌──▼─────────────┐
                 │ Redis      │ │ MapsService    │
                 │            │ │                │
                 │ Geospatial │ │ Provider       │
                 │ Presence   │ │ Abstraction    │
                 │ Live GPS   │ └───────┬────────┘
                 └────────────┘         │
                                        ▼
                               ┌────────────────┐
                               │ Maps Provider  │
                               └────────────────┘

                    ┌──────────────────────────┐
                    │ PostgreSQL               │
                    │                          │
                    │ Addresses                │
                    │ Restaurants              │
                    │ Delivery Snapshots       │
                    │ Rider Location Events    │
                    │ Orders / Deliveries      │
                    └──────────────────────────┘

Location Module
      ↓
Geographic Facts
      ↓
┌───────────────┬──────────────┬───────────────┐
│ Orderability  │ Dispatch     │ ETA/Tracking  │
└───────────────┴──────────────┴───────────────┘
```

---

# 82. Final Principle

**QuickBite owns the business logic. Maps providers only supply geographic capabilities.**

The architecture must remain:

```text
Provider
   ↓
MapsService
   ↓
Location Module
   ↓
Business Modules
   ↓
Order / Dispatch / Delivery / Customer Experience
```

No map provider may become the source of truth for QuickBite's business state.
