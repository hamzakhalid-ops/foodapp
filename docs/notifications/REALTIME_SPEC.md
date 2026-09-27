# QuickBite — Realtime Specification

**File:** `docs/notifications/REALTIME_SPEC.md`
**Version:** 1.0
**Status:** Specification
**Phase:** 7 — Notifications & Realtime

---

# 1. Purpose

This document defines QuickBite's realtime communication architecture.

Realtime functionality is required for time-sensitive updates across:

* Customer App
* Restaurant App
* Rider App
* Admin Panel

Realtime communication provides fast UI updates but does not replace backend APIs or durable database state.

The backend remains authoritative.

---

# 2. Core Principle

Realtime is an optimization for responsiveness.

It is not the source of truth.

The architecture is:

```text
PostgreSQL / Backend State
        ↓
Domain Event
        ↓
Outbox / Event Processing
        ↓
Realtime Event
        ↓
WebSocket
        ↓
Client UI
```

If realtime delivery fails:

```text
Client reconnects
        ↓
Fetches authoritative API state
        ↓
Reconciles local state
```

---

# 3. Realtime Transport

V1 should use:

```text
WebSockets
```

for bidirectional realtime communication.

HTTP APIs remain responsible for:

* Initial data loading
* Mutations
* Historical data
* Pagination
* Recovery
* State synchronization

WebSockets are responsible for:

* Event delivery
* Presence
* Time-sensitive updates
* Dispatch offers
* Order status updates
* Operational notifications

---

# 4. Architecture

Recommended architecture:

```text
Customer App
      │
Restaurant App
      │
Rider App
      │
Admin Panel
      │
      ▼
WebSocket Gateway
      │
      ▼
Realtime Authorization
      │
      ▼
Realtime Event Router
      │
      ├── Order events
      ├── Delivery events
      ├── Dispatch events
      ├── Notification events
      ├── Support events
      └── Admin events
      │
      ▼
Backend Event System
```

---

# 5. WebSocket Authentication

Every WebSocket connection must be authenticated.

Recommended flow:

```text
User authenticates through HTTP
        ↓
Access token/session established
        ↓
WebSocket connection
        ↓
Authentication
        ↓
Identity established
        ↓
Authorization
        ↓
Subscriptions allowed
```

Unauthenticated clients must not access protected realtime channels.

---

# 6. Authentication Requirements

The WebSocket layer must validate:

* Token/session validity
* User identity
* User status
* Session validity
* Token expiration
* Account suspension
* Role
* Required permissions

A revoked session must not continue receiving protected events.

---

# 7. Authorization

WebSocket authorization must follow the same security chain as HTTP APIs:

```text
Authentication
    ↓
Identity
    ↓
Role
    ↓
Permission
    ↓
Resource ownership
    ↓
Tenant isolation
    ↓
Business rule
    ↓
Subscription
```

Frontend subscription requests must never be treated as proof of authorization.

---

# 8. Tenant Isolation

Restaurant data requires strict tenant isolation.

Example:

```text
Restaurant A
    ↓
restaurant:A
```

must not be accessible by:

```text
Restaurant B
```

A restaurant operator may subscribe only to channels belonging to restaurants they are authorized to operate.

---

# 9. Channel Model

Realtime channels should be scoped.

Examples:

```text
user:{user_id}

restaurant:{restaurant_id}

restaurant:{restaurant_id}:orders

restaurant:{restaurant_id}:operations

rider:{rider_id}

order:{order_id}

delivery:{delivery_id}

support_ticket:{ticket_id}

admin:operations
```

Channel naming must remain consistent across all applications.

---

# 10. Subscription Rules

Clients may request subscriptions.

Example:

```text
SUBSCRIBE
channel: order:123
```

The server must validate authorization before accepting the subscription.

Invalid subscriptions must return an authorization error.

The client must never receive data from unauthorized channels.

---

# 11. Customer Subscriptions

Customers may subscribe to:

```text
user:{user_id}
order:{owned_order_id}
delivery:{owned_delivery_id}
support_ticket:{owned_ticket_id}
```

Customers cannot subscribe to another customer's order.

---

# 12. Restaurant Subscriptions

Restaurant Owners and authorized Operators may subscribe to:

```text
restaurant:{restaurant_id}
restaurant:{restaurant_id}:orders
restaurant:{restaurant_id}:operations
```

They may receive:

* New order events
* Order status events
* Cancellation events
* Restaurant operational events
* Relevant payment/order events
* Support events

---

# 13. Rider Subscriptions

A rider may subscribe to:

```text
rider:{rider_id}
delivery:{assigned_delivery_id}
```

An available rider may receive delivery offers through their authenticated user/rider channel.

A rider must not receive another rider's delivery data.

---

# 14. Admin Subscriptions

Admins may access administrative channels according to permissions.

Examples:

```text
admin:operations
admin:orders
admin:dispatch
admin:risk
admin:support
```

Permissions must be checked independently.

Super Admin access must not be assumed merely because the user is authenticated.

---

# 15. Realtime Event Envelope

All realtime events should use a consistent envelope.

Example:

```json
{
  "event_id": "evt_123",
  "event_type": "ORDER_STATUS_CHANGED",
  "version": 1,
  "timestamp": "2026-09-25T12:00:00Z",
  "resource_type": "order",
  "resource_id": "order_123",
  "channel": "order:order_123",
  "sequence": 42,
  "data": {}
}
```

---

# 16. Event ID

Every realtime event must have a unique:

```text
event_id
```

This supports:

* Deduplication
* Debugging
* Logging
* Client reconciliation
* Incident investigation

---

# 17. Event Version

Events should include:

```text
version
```

Example:

```text
ORDER_STATUS_CHANGED v1
```

Breaking payload changes should use a new event version.

Clients should not silently assume future payloads remain identical.

---

# 18. Event Timestamp

Events must contain a server-generated UTC timestamp.

Clients must not provide the authoritative event timestamp.

---

# 19. Event Sequence

Events may include a sequence number for channels/resources where ordering matters.

Example:

```text
order:123

sequence 10
sequence 11
sequence 12
```

If a client detects a gap:

```text
10
11
13
```

it must resynchronize through the API.

The client must not invent event 12.

---

# 20. Event Ordering

Ordering should be guaranteed where practical for a single resource stream.

Important streams include:

```text
Order lifecycle
Delivery lifecycle
Dispatch offer lifecycle
Support conversation
```

Global ordering across all QuickBite events is not required.

---

# 21. Duplicate Events

Clients must tolerate duplicate realtime events.

Each client should maintain a short-lived deduplication mechanism using:

```text
event_id
```

Duplicates must not cause:

* Duplicate orders
* Duplicate payments
* Duplicate assignments
* Duplicate status transitions

Client handling is display/state synchronization only.

Business mutations remain backend-controlled.

---

# 22. Reconnection

Clients must automatically attempt reconnection after unexpected disconnects.

Recommended strategy:

```text
Immediate attempt
    ↓
Short backoff
    ↓
Increasing backoff
    ↓
Maximum retry interval
```

Exact values should be configurable.

---

# 23. Reconnection Authentication

After reconnection:

```text
Authenticate
        ↓
Validate session
        ↓
Re-authorize subscriptions
        ↓
Synchronize state
```

The client must not assume previous subscriptions remain valid.

---

# 24. State Resynchronization

After reconnect:

```text
WebSocket reconnect
        ↓
GET current user/session state
        ↓
GET active orders/deliveries
        ↓
GET unread notifications
        ↓
Restore subscriptions
```

The exact API calls depend on application.

---

# 25. Offline Behavior

When offline:

* Local UI may display cached state.
* No client-side business state should be treated as authoritative.
* Mutations must be retried through safe API mechanisms.
* Idempotency must protect retryable mutations.

When connection returns:

```text
API synchronization
+
WebSocket synchronization
```

must reconcile state.

---

# 26. Customer Realtime Events

Customer events include:

```text
ORDER_CREATED
ORDER_ACCEPTED
ORDER_REJECTED
ORDER_PREPARING
ORDER_READY
ORDER_RIDER_ASSIGNED
ORDER_PICKED_UP
ORDER_OUT_FOR_DELIVERY
ORDER_DELIVERED
ORDER_CANCELLED

PAYMENT_UPDATED

DELIVERY_LOCATION_UPDATED

NOTIFICATION_CREATED

SUPPORT_MESSAGE_CREATED
```

Only events relevant to the authenticated customer may be delivered.

---

# 27. Restaurant Realtime Events

Restaurant events include:

```text
RESTAURANT_ORDER_CREATED
RESTAURANT_ORDER_CANCELLED

ORDER_STATUS_CHANGED

PAYMENT_STATUS_CHANGED

RIDER_ASSIGNED
RIDER_ARRIVING
RIDER_PICKED_UP

RESTAURANT_STATUS_CHANGED

MENU_AVAILABILITY_CHANGED

NEW_REVIEW

SUPPORT_MESSAGE_CREATED
```

---

# 28. Rider Realtime Events

Rider events include:

```text
DELIVERY_OFFER_CREATED
DELIVERY_OFFER_EXPIRED
DELIVERY_OFFER_CANCELLED

DELIVERY_ASSIGNED

DELIVERY_UPDATED

ORDER_READY

CUSTOMER_ORDER_CANCELLED

EARNINGS_UPDATED

SUPPORT_MESSAGE_CREATED
```

---

# 29. Admin Realtime Events

Admin events may include:

```text
NEW_RESTAURANT_APPLICATION
NEW_RIDER_APPLICATION

ORDER_OPERATIONAL_ALERT

PAYMENT_OPERATIONAL_ALERT

DISPATCH_ALERT

RISK_ALERT

SUPPORT_ESCALATION

SYSTEM_ALERT
```

Access depends on admin permission.

---

# 30. Order Lifecycle Realtime

Order events must correspond to valid backend transitions.

Example:

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

Each state transition may generate a realtime event.

Invalid client-generated transitions are never accepted.

---

# 31. Dispatch Realtime Flow

Dispatch is particularly time-sensitive.

Flow:

```text
Restaurant marks READY
        ↓
Dispatch Engine
        ↓
Eligible riders
        ↓
Delivery offer created
        ↓
Realtime offer
        +
Push notification
        ↓
Rider accepts/rejects/expires
        ↓
Backend validates response
        ↓
Assignment created
        ↓
Realtime assignment
```

The realtime message is not the authoritative assignment.

The backend assignment record is authoritative.

---

# 32. Rider Offer Race Conditions

Multiple riders may potentially receive sequential offers.

If a rider attempts to accept an offer after it is no longer available:

```text
Backend checks offer
        ↓
Offer unavailable
        ↓
Reject request
```

The client must not assume that displaying an offer means the offer remains valid.

---

# 33. Delivery Location Updates

Rider location may be communicated in realtime to authorized recipients.

Possible recipients:

* Customer with active order
* Restaurant where operationally relevant
* Authorized support/admin personnel

Location access must be limited to active delivery contexts.

Historical location data must not be exposed unnecessarily.

---

# 34. Location Frequency

Location updates must be rate controlled.

The rider application should not send unlimited location events.

The backend should enforce:

* Frequency limits
* Payload validation
* Coordinate validation
* Authentication
* Authorization
* Abuse protection

Exact intervals may be configurable based on operational requirements.

---

# 35. Location Accuracy

Location payloads may include:

```text
latitude
longitude
accuracy
timestamp
```

Invalid coordinates must be rejected.

Examples:

```text
latitude < -90 or > 90
longitude < -180 or > 180
```

must fail validation.

---

# 36. Redis Usage

Redis may support:

* Active WebSocket sessions
* User presence
* Rider online status
* Current rider location
* Geospatial lookup
* Pub/Sub or event fan-out where appropriate
* Short-lived connection state
* Distributed locks where required

Redis is not the durable source of truth for:

* Orders
* Payments
* Settlements
* Financial records
* Permanent audit history
* Final rider assignments

PostgreSQL remains authoritative for durable business state.

---

# 37. Horizontal Scaling

The realtime layer must support multiple application instances.

Example:

```text
WebSocket Server A
WebSocket Server B
WebSocket Server C
```

An event generated on Server A must reach a relevant client connected to Server B.

This requires a shared event distribution mechanism.

Redis may be used for this purpose.

---

# 38. WebSocket Gateway

The WebSocket gateway should handle:

* Connection management
* Authentication
* Authorization
* Subscription management
* Heartbeats
* Disconnect handling
* Event routing
* Rate limiting
* Connection metrics

Business logic should remain in backend domain modules.

---

# 39. Heartbeats

Connections should use heartbeat/ping mechanisms to detect dead connections.

Example:

```text
Server → PING
Client → PONG
```

Dead connections should eventually be terminated.

Heartbeat configuration must be environment configurable.

---

# 40. Connection Limits

Protect the system from excessive connections.

Limits may apply to:

```text
user
device
IP
account
application
```

Exact limits should be configurable.

---

# 41. Realtime Rate Limiting

Protect against:

* Subscription spam
* Connection floods
* Event floods
* Location update abuse
* Repeated subscribe/unsubscribe
* Malformed messages

Rate limiting should be applied at appropriate layers.

---

# 42. Client Message Types

The client may send limited control messages.

Examples:

```text
AUTHENTICATE
SUBSCRIBE
UNSUBSCRIBE
PING
```

Business actions should normally use HTTP APIs rather than arbitrary WebSocket commands.

For example:

```text
Accept delivery offer
```

should use the authoritative backend API unless a documented realtime command is explicitly required.

---

# 43. Realtime Notifications

Notifications may be delivered over realtime channels.

Example:

```text
NOTIFICATION_CREATED
```

The client should then retrieve or use the authorized notification data.

Notification persistence remains in the database.

---

# 44. Realtime and Push Relationship

Realtime and push serve different purposes.

### Realtime

Best when:

```text
App open
Connected
Low-latency update required
```

### Push

Best when:

```text
App backgrounded
App closed
Realtime unavailable
```

### API

Always provides:

```text
Authoritative state
Recovery
History
Synchronization
```

---

# 45. Event Persistence

Realtime events do not need to be stored permanently solely because they were sent.

Durability depends on the underlying business record.

For example:

```text
ORDER_STATUS_CHANGED
```

is represented durably by:

```text
orders
order_status_history
```

The realtime event is simply a delivery mechanism.

---

# 46. Event Recovery

If a client misses realtime events:

```text
Client reconnects
        ↓
Detects missing sequence or uncertain state
        ↓
Calls REST API
        ↓
Receives current authoritative state
        ↓
Updates UI
```

The system does not require every client to receive every historical realtime event.

---

# 47. Event Payload Security

Do not send unnecessary fields.

For example, customer order events should not contain:

* Internal risk score
* Internal fraud signals
* Payment provider credentials
* Admin notes
* Private restaurant financial data
* Other users' personal information

Payloads should be role- and resource-specific.

---

# 48. WebSocket Error Format

Realtime errors should have a consistent structure.

Example:

```json
{
  "type": "ERROR",
  "code": "SUBSCRIPTION_FORBIDDEN",
  "message": "You are not authorized to subscribe to this channel.",
  "request_id": "req_123"
}
```

Do not expose internal stack traces or sensitive implementation details.

---

# 49. Disconnect Reasons

Useful standardized reasons include:

```text
AUTHENTICATION_FAILED
SESSION_EXPIRED
ACCOUNT_SUSPENDED
RATE_LIMITED
SERVER_SHUTDOWN
PROTOCOL_ERROR
POLICY_VIOLATION
IDLE_TIMEOUT
```

Clients should handle expected disconnects differently from transient network failures.

---

# 50. Deployment

Recommended architecture:

```text
Internet
   ↓
CDN / Reverse Proxy
   ↓
Load Balancer
   ↓
WebSocket Gateway
   ↓
Realtime/Event Infrastructure
   ↓
Backend
   ↓
Redis
   ↓
PostgreSQL
```

The infrastructure must support WebSocket upgrade requests.

---

# 51. Security Requirements

WebSocket implementation must enforce:

* TLS in production
* Authentication
* Authorization
* Origin validation
* Rate limiting
* Connection limits
* Payload validation
* Tenant isolation
* Session expiration
* Session revocation
* Abuse protection
* Structured logging
* Security monitoring

---

# 52. CORS and Origin Controls

WebSocket connections must validate allowed origins.

Do not allow unrestricted production origins such as:

```text
*
```

unless there is a documented security reason and compensating control.

Allowed origins should be environment-specific.

---

# 53. Sensitive Admin Realtime Channels

Admin channels require stronger controls.

Examples:

```text
admin:risk
admin:payments
admin:operations
```

Access requires:

```text
Authenticated admin
+
Required permission
+
Active session
+
Account not suspended
```

Sensitive administrative events should be minimized and audited.

---

# 54. Realtime Logging

Log:

```text
connection established
connection closed
authentication failure
subscription attempt
subscription denied
subscription accepted
event published
event delivery failure
rate-limit event
protocol error
```

Do not log sensitive tokens.

---

# 55. Metrics

Monitor:

```text
active_websocket_connections
connections_per_second
connection_failures
authentication_failures
subscription_denials
events_published
events_delivered
event_delivery_latency
event_failures
reconnection_rate
heartbeat_failures
location_update_rate
```

Metrics should be segmented by:

```text
application
environment
event_type
```

---

# 56. Testing Requirements

## Unit Tests

Test:

* Event envelope generation
* Authorization
* Channel naming
* Payload filtering
* Event versioning
* Deduplication
* Sequence handling

## Integration Tests

Test:

```text
Backend event
→ Event router
→ WebSocket gateway
→ Authorized client
```

and:

```text
Unauthorized client
→ Subscription rejected
```

## E2E Tests

Customer:

```text
Order status changes
→ Customer receives realtime update
```

Restaurant:

```text
New order
→ Restaurant receives realtime event
```

Rider:

```text
Delivery offer
→ Rider receives offer
```

Dispatch:

```text
Offer accepted
→ Customer/restaurant receive appropriate assignment update
```

Reconnect:

```text
Disconnect
→ Reconnect
→ API synchronization
→ Current state restored
```

---

# 57. Failure Testing

Test:

* Redis unavailable
* WebSocket server restart
* Backend restart
* Network interruption
* Duplicate events
* Out-of-order events
* Expired sessions
* Revoked sessions
* Unauthorized subscriptions
* High connection volume
* Event backlog
* Slow clients
* Provider failures

The system must fail safely.

---

# 58. Realtime vs Durable State

The following are durable backend records:

```text
Orders
Payments
Deliveries
Assignments
Settlements
Notifications
Support tickets
Audit logs
```

The following may be ephemeral:

```text
Presence
Connection state
Current location cache
Typing indicators
Temporary subscription state
```

Ephemeral state must not replace durable records.

---

# 59. Client Architecture Rules

Each frontend should maintain:

```text
API state
+
Realtime state
+
Connection state
```

Recommended connection states:

```text
DISCONNECTED
CONNECTING
CONNECTED
RECONNECTING
AUTHENTICATION_FAILED
```

UI should clearly handle reconnecting/offline conditions.

---

# 60. Client State Reconciliation

When realtime event arrives:

```text
Validate event
        ↓
Check event type
        ↓
Check resource
        ↓
Check sequence/deduplication
        ↓
Update local state
```

When state is uncertain:

```text
GET authoritative API state
```

Do not perform irreversible business actions based solely on a realtime event.

---

# 61. Business Action Authority

The following must remain backend-controlled:

```text
Order status
Payment status
Refund
Cancellation
Rider assignment
Restaurant availability
Rider eligibility
Risk restrictions
Earnings
Settlements
Permissions
```

Realtime messages only communicate those states.

---

# 62. Event Naming Convention

Use uppercase semantic event names.

Examples:

```text
ORDER_CREATED
ORDER_STATUS_CHANGED
PAYMENT_UPDATED
DELIVERY_ASSIGNED
DELIVERY_LOCATION_UPDATED
DISPATCH_OFFER_CREATED
NOTIFICATION_CREATED
SUPPORT_MESSAGE_CREATED
```

Avoid ambiguous names such as:

```text
UPDATE
CHANGE
DATA
MESSAGE
```

---

# 63. Event Ownership

Domain modules own their events.

Examples:

```text
Orders Module
→ ORDER_CREATED
→ ORDER_STATUS_CHANGED

Payments Module
→ PAYMENT_UPDATED

Dispatch Module
→ DISPATCH_OFFER_CREATED
→ DELIVERY_ASSIGNED

Support Module
→ SUPPORT_MESSAGE_CREATED
```

The realtime layer transports events but should not invent domain events.

---

# 64. Internal Event vs Realtime Event

An internal backend event and a client-facing realtime event are not necessarily identical.

Example:

```text
Internal:
OrderStatusChanged

Realtime:
ORDER_STATUS_CHANGED
```

The realtime event should expose only fields appropriate for the client.

---

# 65. Event Transformation

Flow:

```text
Domain Event
      ↓
Authorization Context
      ↓
Payload Transformer
      ↓
Client-Safe Event
      ↓
WebSocket
```

This prevents accidental exposure of internal fields.

---

# 66. Version Compatibility

During rolling deployments:

```text
Server v1
Server v2
Client v1
Client v2
```

may temporarily coexist.

Realtime event versioning must support backward compatibility where required.

Breaking changes require:

* New event version
* Migration plan
* Client compatibility strategy

---

# 67. Backpressure

If a client cannot consume events quickly enough:

```text
Slow client
    ↓
Queue grows
    ↓
Apply limits
    ↓
Drop/reduce non-critical ephemeral events
    ↓
Force state resynchronization if necessary
```

Critical durable state should be recoverable through APIs.

---

# 68. Location Backpressure

Location updates are inherently high-volume.

The system may:

* Rate-limit updates
* Coalesce updates
* Drop stale intermediate updates
* Keep latest location
* Prioritize current delivery state

The system must not allow location traffic to overwhelm order/dispatch traffic.

---

# 69. Priority of Realtime Events

Recommended priorities:

```text
CRITICAL
HIGH
NORMAL
LOW
```

Examples:

CRITICAL:

```text
Security events
```

HIGH:

```text
Dispatch offer
Order cancellation
Payment failure
```

NORMAL:

```text
Order status update
```

LOW:

```text
Non-critical operational updates
```

---

# 70. Realtime and Notification Integration

Example:

```text
Order accepted
        ↓
Domain event
        ├── Realtime event
        └── Notification event
```

Realtime and notification processing may share the same originating business event while using different delivery systems.

---

# 71. Audit Requirements

Realtime authorization changes must be auditable where security-sensitive.

Examples:

* Admin permission changes
* Security session revocation
* Access to sensitive administrative channels
* Configuration changes

Normal transient subscription events do not necessarily require permanent audit records, but should be logged for observability.

---

# 72. API Recovery Requirements

Every important realtime resource must have a corresponding REST/API recovery mechanism.

Examples:

```text
Order
→ GET /orders/:id

Delivery
→ GET /deliveries/:id

Notifications
→ GET /notifications

Support
→ GET /support/tickets/:id
```

Exact endpoints are defined in:

```text
docs/api/API_SPEC.md
```

---

# 73. Operational Alerts

The realtime system should alert operators when:

```text
connection failure rate increases
event latency increases
event delivery failures increase
Redis becomes unavailable
subscription authorization failures spike
connection count exceeds configured limits
location traffic becomes abnormal
```

---

# 74. Graceful Shutdown

During deployment:

```text
Stop accepting new connections
        ↓
Notify clients where appropriate
        ↓
Allow active processing to finish
        ↓
Close connections
        ↓
Clients reconnect
        ↓
State synchronization
```

Deployments must not corrupt durable business state.

---

# 75. Definition of Done

Realtime functionality is complete only when:

* WebSocket architecture is implemented.
* Authentication is implemented.
* Authorization is implemented.
* Channel model is documented.
* Tenant isolation exists.
* Event envelope exists.
* Event versioning exists.
* Duplicate handling exists.
* Reconnection exists.
* State resynchronization exists.
* Redis/event fan-out is implemented where required.
* Durable state remains in PostgreSQL.
* Location updates are protected.
* Admin channels are protected.
* Rate limiting exists.
* Logging exists.
* Metrics exist.
* Failure handling exists.
* Unit tests exist.
* Integration tests exist.
* E2E tests exist.
* API recovery paths exist.
* Security requirements are tested.

---

# 76. Claude Code Implementation Rules

Before implementing realtime functionality, Claude Code must read:

```text
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md
docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/DISPATCH_RULES.md
docs/business-rules/RISK_RULES.md
docs/security/AUTH_AUTHORIZATION.md
docs/notifications/NOTIFICATION_RULES.md
```

Claude Code must:

1. Keep PostgreSQL as the durable source of truth.
2. Keep Redis as supporting infrastructure.
3. Never use WebSocket messages as authoritative business commands unless explicitly documented.
4. Enforce authorization server-side.
5. Enforce restaurant tenant isolation.
6. Validate every client message.
7. Protect sensitive payloads.
8. Implement reconnection and state synchronization.
9. Handle duplicate and out-of-order events safely.
10. Add tests with each realtime feature.
11. Avoid coupling domain modules directly to WebSocket implementation.
12. Use event abstractions.
13. Preserve existing architecture.
14. Never invent business rules.
15. Ask for clarification when documentation conflicts.

---

# 77. Phase 7 Realtime Completion Criteria

The realtime architecture is considered specified when:

```text
Transport
+
Authentication
+
Authorization
+
Channels
+
Events
+
Event versions
+
Ordering
+
Deduplication
+
Reconnection
+
Recovery
+
Redis scaling
+
Location handling
+
Security
+
Observability
+
Testing
```

are defined and consistent with the rest of the QuickBite architecture.

---

# 78. Phase 7 Final Architecture

The intended Phase 7 architecture is:

```text
                 QUICKBITE BACKEND
                        │
                 Domain Modules
                        │
                  Domain Events
                        │
             ┌──────────┴──────────┐
             │                     │
        Outbox/Event Bus       Realtime Router
             │                     │
      Notification Worker     WebSocket Gateway
             │                     │
      ┌──────┼──────┐          ┌───┼───┐
      │      │      │          │   │   │
     Push   SMS   Email       Customer
                               Restaurant
                               Rider
                               Admin
```

Durable state:

```text
PostgreSQL
```

Supporting realtime infrastructure:

```text
Redis
```

External communication providers:

```text
Push Provider
SMS Provider
Email Provider
```

The complete system follows:

```text
Backend State
      ↓
Domain Event
      ↓
Notification / Realtime
      ↓
Client
      ↓
UI Update
```

Never:

```text
Client
      ↓
Assume State
      ↓
Treat as Backend Truth
```

The backend remains authoritative throughout the QuickBite platform.
