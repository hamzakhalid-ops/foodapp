# QuickBite — Reviews & Ratings Rules

**Path:** `docs/reviews/REVIEW_RULES.md`
**Status:** Frozen Specification
**Phase:** 11 — Reviews & Ratings
**Product:** QuickBite Food Delivery Platform

---

## 1. Purpose

This document defines the authoritative business rules for Reviews & Ratings across QuickBite.

It governs:

* Review eligibility
* Rating values
* Review ownership
* Review creation
* Review editing
* Review deletion/removal
* Review visibility
* Restaurant responses
* Review reporting
* Review moderation
* Fake/manipulated review prevention
* Review aggregation
* Notifications
* Auditability
* Trust & Risk integration
* Administrative intervention

The backend is authoritative for all review eligibility, ownership, status, visibility, moderation, and rating calculations.

Frontend applications must never be trusted to enforce these rules.

---

# 2. Authoritative Principles

The backend is authoritative for:

* Whether an order is eligible for review
* Whether the customer owns the order
* Whether the order was delivered
* Whether a review already exists
* Rating value
* Review status
* Review visibility
* Restaurant response permissions
* Report eligibility
* Moderation decisions
* Review aggregation
* Review-related risk controls

The client must never be able to:

* Review an order that was not delivered
* Review another customer's order
* Create multiple reviews for the same eligible order
* Change the review author
* Change the linked order
* Set review status
* Approve its own review
* Modify aggregate ratings
* Bypass moderation
* Create a review through direct database access

---

# 3. V1 Review Model

QuickBite V1 supports customer reviews of restaurants.

A review is permanently linked to:

* Customer
* Delivered order
* Restaurant
* Rating
* Optional written comment

The order relationship is authoritative.

A review cannot exist independently of an eligible delivered order.

---

# 4. Rating Scale

V1 uses a five-point rating scale:

| Rating | Meaning   |
| ------ | --------- |
| 1      | Very poor |
| 2      | Poor      |
| 3      | Average   |
| 4      | Good      |
| 5      | Excellent |

Valid values are only:

```text
1
2
3
4
5
```

The backend must reject:

* 0
* Negative values
* Values greater than 5
* Decimal ratings
* Strings or malformed values

---

# 5. Review Eligibility

A customer becomes eligible to review an order only after the order reaches:

```text
DELIVERED
```

The following states are not review-eligible:

```text
PENDING
RESTAURANT_ACCEPTED
PREPARING
READY_FOR_PICKUP
RIDER_ASSIGNED
PICKED_UP
OUT_FOR_DELIVERY
CANCELLED_BY_CUSTOMER
CANCELLED_BY_RESTAURANT
CANCELLED_BY_ADMIN
```

A cancelled order cannot normally receive a customer review.

---

# 6. Customer Ownership

Only the customer associated with the delivered order may create its review.

Authorization must verify:

```text
Authenticated User
        ↓
Customer Role
        ↓
Order Ownership
        ↓
Order Status = DELIVERED
        ↓
Review Does Not Already Exist
        ↓
Create Review
```

A customer cannot review:

* Another customer's order
* A restaurant they did not order from
* An order they did not receive
* A cancelled order

---

# 7. One Review Per Order

V1 allows one restaurant review per eligible order.

The database must enforce this invariant.

Conceptually:

```text
UNIQUE(order_id)
```

The application must also perform an eligibility check before creation.

Database uniqueness remains the final protection against concurrent duplicate submissions.

---

# 8. Review Creation

A valid review request contains:

```text
order_id
rating
comment
```

The backend derives:

```text
customer_id
restaurant_id
```

from the authenticated user and authoritative order record.

The client must not be allowed to choose the restaurant independently.

Review creation must occur transactionally.

The transaction should:

1. Authenticate the customer.
2. Authorize the customer.
3. Load the order.
4. Verify customer ownership.
5. Verify order status is `DELIVERED`.
6. Verify the order is review-eligible.
7. Verify no existing review exists.
8. Validate rating.
9. Validate comment.
10. Create the review.
11. Create required audit/event records.
12. Commit.

---

# 9. Written Comments

Written comments are optional.

A review may contain:

* Rating only
* Rating + written comment

Comments must be validated for:

* Maximum length
* UTF-8 validity
* Excessive control characters
* Malformed input
* Security-sensitive payloads

The exact maximum length must be implemented as a centralized configuration value rather than scattered through frontend code.

The backend must sanitize/validate input according to the application's content-safety strategy.

---

# 10. Content Moderation

QuickBite must not assume every submitted review is appropriate.

Potentially problematic content may include:

* Threats
* Harassment
* Hate or abusive content
* Personal information
* Fraudulent claims
* Spam
* Advertising
* External payment requests
* Malicious links
* Repeated promotional content
* Review manipulation
* Extortion attempts

V1 should use a moderation workflow rather than automatically deleting every potentially problematic review.

Possible moderation statuses:

```text
PUBLISHED
PENDING_MODERATION
HIDDEN
REMOVED
```

The exact moderation trigger may include:

* User report
* Automated content signal
* Trust & Risk signal
* Administrator action

---

# 11. Review Status

V1 review statuses:

```text
PUBLISHED
PENDING_MODERATION
HIDDEN
REMOVED
```

### PUBLISHED

Visible to authorized public/customer-facing restaurant surfaces.

### PENDING_MODERATION

Submitted but awaiting moderation.

Visibility follows the moderation policy.

### HIDDEN

Temporarily unavailable to normal public display while retained for moderation/audit purposes.

### REMOVED

Removed from normal display because it violated review/content rules or was otherwise administratively removed.

Removed reviews must not be physically deleted merely to hide historical moderation activity.

---

# 12. Review Editing

V1 should allow a customer to edit their own review subject to platform rules.

An edit must verify:

```text
Authenticated Customer
        ↓
Review Ownership
        ↓
Review Still Editable
        ↓
Validate New Content
        ↓
Update Review
```

The customer cannot change:

* Review ID
* Order ID
* Customer ID
* Restaurant ID

The customer may change:

* Rating
* Comment

---

# 13. Review Edit Policy

V1 review editing is allowed while the review remains an active customer-owned review.

However, editing must not be used to bypass moderation.

If a review was removed or restricted by moderation, the customer must not be able to modify it in a way that silently restores visibility.

A future ADR may introduce a fixed editing window if product requirements later require it.

Until then, the backend remains responsible for enforcing the active edit policy.

---

# 14. Review Deletion

V1 should avoid destructive deletion of review records.

Where the customer requests removal, the platform should use a controlled removal state rather than physically deleting historical records.

This preserves:

* Auditability
* Fraud investigation capability
* Moderation history
* Rating reconciliation
* Regulatory/operational records where applicable

Any customer-facing "delete review" operation therefore means removal from normal display, subject to applicable retention requirements.

---

# 15. Restaurant Responses

A restaurant may respond to a customer review associated with that restaurant.

Restaurant response authorization must verify:

```text
Authenticated User
        ↓
Restaurant Owner or Operator
        ↓
Restaurant Membership
        ↓
Review belongs to that Restaurant
        ↓
Review response allowed
```

A restaurant must never be able to respond to another restaurant's review.

The backend must enforce restaurant tenant isolation.

---

# 16. Restaurant Response Rules

A restaurant response:

* Is associated with exactly one review.
* Must be authored by an authorized restaurant user.
* Must remain linked to the restaurant through the review.
* Must pass content validation.
* Must be auditable.

Restaurant responses must not allow:

* Customer impersonation
* Editing the original customer review
* Changing the rating
* Changing the order
* Changing the review author

---

# 17. Response Editing

The restaurant author may edit its response subject to the active response policy.

The response author cannot change:

* Review ID
* Restaurant ID
* Author identity

Administrative moderation may hide or remove an inappropriate response.

---

# 18. Review Reporting

Customers and authorized users may report reviews where appropriate.

A report should include:

```text
review_id
reason
optional description
```

Possible report reasons:

```text
ABUSIVE_CONTENT
HARASSMENT
SPAM
PERSONAL_INFORMATION
FRAUDULENT_CONTENT
THREAT
PROMOTIONAL_CONTENT
OTHER
```

Reports must be stored separately from the review itself.

A report does not automatically mean the review is invalid.

---

# 19. Reporting Authorization

The system must prevent unauthorized users from manipulating review moderation.

The backend must validate:

* Authenticated reporter
* Valid review
* Valid report reason
* Duplicate/report frequency limits
* Applicable reporting permissions

Repeated abusive reporting may itself become a Trust & Risk signal.

---

# 20. Fake Review & Manipulation Protection

QuickBite must treat review manipulation as a Trust & Risk concern.

Potential signals include:

```text
REPEATED_REVIEW_MANIPULATION
ABNORMAL_REVIEW_FREQUENCY
SUSPICIOUS_REVIEW_PATTERN
COORDINATED_REVIEW_ACTIVITY
REPEATED_FALSE_REVIEW_REPORT
```

The Trust & Risk Engine may flag:

* Customer accounts
* Restaurant accounts
* Other relevant actors

QuickBite must not create a separate competing fraud engine for reviews.

Review risk belongs to the existing Trust & Risk Engine.

---

# 21. Review Incentives

V1 must not assume that reviews are eligible for rewards.

No review incentive, cashback, loyalty reward, or promotional payment should be implemented unless explicitly defined by a future business rule.

This prevents developers from accidentally creating paid or manipulated reviews.

---

# 22. Rating Aggregation

Restaurant rating aggregates must be derived from eligible reviews.

Core metrics include:

* Average rating
* Total published review count
* Rating distribution

Example:

```text
5-star count
4-star count
3-star count
2-star count
1-star count
Average rating
Total review count
```

Only reviews eligible for public aggregation should contribute to the restaurant's public rating.

Reviews with statuses such as:

```text
HIDDEN
REMOVED
```

must not contribute to the public aggregate unless explicitly configured otherwise.

---

# 23. Rating Calculation

The conceptual average is:

```text
average_rating =
    sum(published_review_ratings)
    /
    published_review_count
```

The backend must perform the calculation using exact numeric handling.

Floating-point arithmetic must not create inconsistent persisted financial-style calculations.

The displayed precision must be centrally configured.

For example:

```text
4.6
```

rather than exposing excessive decimal precision.

---

# 24. Historical Integrity

A review must retain its relationship to the original order.

Changes to:

* Restaurant name
* Restaurant profile
* Menu
* Customer profile
* Current restaurant rating

must not change the historical identity of the review.

The review remains associated with the restaurant that fulfilled the original order.

---

# 25. Order Requirement

The review must reference an actual QuickBite order.

The system must reject attempts to:

* Create reviews with arbitrary order IDs
* Review manually fabricated orders
* Review orders belonging to another customer
* Review orders that never reached delivery

---

# 26. Cancellation Interaction

Cancelled orders normally cannot be reviewed.

If an administrator cancels an order after an operational issue, the order remains non-reviewable unless a future explicit business rule defines an exception.

Support staff must not bypass review eligibility through direct database changes.

---

# 27. Refund Interaction

A refund does not automatically remove an otherwise valid delivered-order review.

Review eligibility is primarily determined by the order lifecycle.

However, an administrative investigation may flag a review if there is evidence of abuse or manipulation.

Such intervention must be:

* Authorized
* Audited
* Traceable

---

# 28. Notification Rules

Review-related notifications may include:

### Customer

* Review reminder
* Review successfully submitted
* Restaurant response received
* Review moderation action

### Restaurant

* New review received
* New review response opportunity
* Review reported/moderated

### Admin

* Review moderation queue
* Review manipulation signal
* Review report requiring action

Notifications must follow:

```text
docs/notifications/NOTIFICATION_RULES.md
```

Notification delivery must not be coupled directly to the database transaction in a way that causes the transaction to fail because a notification provider is unavailable.

Use the existing outbox/event architecture.

---

# 29. Realtime Integration

Realtime review events may include:

```text
review.created
review.updated
review.response.created
review.moderated
review.removed
```

Realtime delivery must follow:

```text
docs/notifications/REALTIME_SPEC.md
```

WebSocket events are informational.

The API/database remains authoritative.

---

# 30. Authorization

Review authorization follows:

```text
Authentication
        ↓
Identity
        ↓
Role
        ↓
Permission
        ↓
Resource Ownership / Restaurant Membership
        ↓
Review Business Rules
        ↓
Action
```

Never rely on frontend route visibility.

---

# 31. Customer Permissions

Customers may:

* View reviews
* Create reviews for eligible orders
* Edit their own eligible reviews
* Request removal of their own review according to policy
* Report inappropriate reviews

Customers may not:

* Modify another customer's review
* Modify restaurant responses
* Moderate reviews
* Change aggregate ratings

---

# 32. Restaurant Owner Permissions

Restaurant Owners may:

* View reviews for their restaurant
* Respond to reviews
* Edit their own responses
* Report inappropriate reviews
* View review analytics for their restaurant

Restaurant Owners may not:

* Change customer ratings
* Delete customer reviews directly
* Moderate their own reviews
* Access another restaurant's reviews

---

# 33. Restaurant Operator Permissions

Restaurant Operators may:

* View restaurant reviews
* Respond if granted the review-response permission
* Edit their own responses if permitted
* Report inappropriate reviews

Financial or administrative permissions must not be inferred from review access.

---

# 34. Admin Permissions

Authorized Admin users may:

* View reviews
* View reports
* Moderate reviews
* Hide reviews
* Remove reviews
* Restore reviews where policy permits
* Moderate restaurant responses
* Investigate manipulation
* View moderation history

Every administrative moderation action must be audited.

---

# 35. Super Admin Permissions

Super Admin may perform authorized administrative review operations and manage system-level review configuration.

Super Admin access must still pass:

* Authentication
* Strong authentication/MFA
* Authorization
* Audit logging
* Business rules

Super Admin status must never mean "skip all security."

---

# 36. Audit Requirements

Audit events should include:

* Review created
* Review edited
* Review removal requested
* Review hidden
* Review restored
* Review removed
* Review reported
* Report resolved
* Restaurant response created
* Restaurant response edited
* Response moderated
* Administrative override

Audit records should capture:

```text
actor
action
entity
entity_id
old_values
new_values
reason
timestamp
request/correlation context
```

Use:

```text
audit_logs
```

defined in the database specification.

---

# 37. Tenant Isolation

Restaurant review data is tenant-sensitive.

Every restaurant-scoped operation must verify restaurant membership.

Never trust:

```text
restaurant_id
```

provided by the client without authorization.

The backend should derive or verify restaurant ownership from authenticated identity and the review/order relationship.

---

# 38. Privacy

Public review information may include:

* Rating
* Review text
* Customer display name or configured anonymous representation
* Date
* Restaurant response

Private information must not be exposed through public review APIs.

Never expose:

* Customer phone number
* Customer email
* Delivery address
* Payment details
* Internal risk information
* Internal moderation notes
* Internal audit metadata

---

# 39. Trust & Risk Integration

Review activity may produce risk events.

Example:

```text
Review Created
      ↓
Review Risk Signals
      ↓
Trust & Risk Engine
      ↓
Risk Event / Flag
      ↓
Configured Action
```

Possible actions include:

```text
NORMAL
MONITORED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

Review logic must not hard-code permanent bans.

Use:

```text
docs/business-rules/RISK_RULES.md
```

as the authority for risk behavior.

---

# 40. Performance

Review listing must support:

* Pagination
* Sorting
* Filtering
* Rating filtering where required
* Status-aware visibility

Public restaurant rating should not require recalculating every historical review on every restaurant page request.

Use an appropriate aggregation/cache strategy.

The cache is not the source of truth.

PostgreSQL remains authoritative.

---

# 41. Cache Invalidation

When a published review affects aggregate rating:

```text
Review Change
      ↓
Aggregate Recalculation / Update
      ↓
Cache Invalidation
      ↓
Updated Public Rating
```

Cache failures must not corrupt the underlying rating data.

---

# 42. Concurrency

The system must handle:

* Double review submission
* Simultaneous review edits
* Simultaneous restaurant responses
* Multiple moderation actions
* Concurrent reports
* Aggregate update races

Database constraints and transactional operations must provide the final consistency guarantee.

---

# 43. Idempotency

Review creation should support idempotency where required by the API architecture.

A repeated client request caused by:

* Network retry
* Double tap
* Mobile reconnect
* Timeout

must not create duplicate reviews.

Use the existing:

```text
idempotency_keys
```

architecture where applicable.

---

# 44. Error Handling

Use the standard QuickBite API error envelope.

Review-specific errors should include clear machine-readable codes.

Examples:

```text
REVIEW_ORDER_NOT_FOUND
REVIEW_ORDER_NOT_DELIVERED
REVIEW_NOT_ELIGIBLE
REVIEW_ALREADY_EXISTS
REVIEW_NOT_OWNER
REVIEW_NOT_FOUND
REVIEW_ACCESS_DENIED
REVIEW_INVALID_RATING
REVIEW_INVALID_CONTENT
REVIEW_ALREADY_REMOVED
REVIEW_RESPONSE_NOT_ALLOWED
REVIEW_REPORT_INVALID
```

Do not expose internal implementation details.

---

# 45. Security Requirements

Review APIs must have:

* Authentication
* Authorization
* Input validation
* Rate limiting
* Tenant isolation
* Abuse protection
* Audit logging
* Secure error handling
* Output filtering
* Content validation

Do not trust:

* Client-generated restaurant IDs
* Client-generated customer IDs
* Client-generated review status
* Client-generated moderation state
* Client-generated aggregate rating
* Client-generated order eligibility

---

# 46. Rate Limiting

Rate limits should protect:

* Review creation
* Review editing
* Review reporting
* Restaurant responses
* Public review queries
* Administrative moderation endpoints

Exact limits must be configuration-driven.

Do not scatter numeric limits throughout application code.

---

# 47. Database Integrity

The database should enforce appropriate constraints including:

* Valid rating range
* Review → order foreign key
* Review → customer foreign key
* Review → restaurant foreign key
* One review per order
* Valid review status
* Review response → review foreign key
* Report → review foreign key

Application validation remains required.

Database constraints are the final integrity layer.

---

# 48. Analytics

Review analytics may include:

* Average rating
* Review count
* Rating distribution
* Rating trend
* Report count
* Response rate
* Moderation count
* Review sentiment/content metrics only if explicitly implemented later

V1 must not require AI sentiment analysis.

---

# 49. V1 Scope

### Included

* Restaurant ratings
* 1–5 rating scale
* Written reviews
* Delivered-order eligibility
* One review per order
* Customer review creation
* Customer review editing
* Review visibility/status
* Restaurant responses
* Review reporting
* Admin moderation
* Rating aggregation
* Audit logs
* Risk integration
* Notifications
* Pagination/filtering
* Security and authorization
* Review analytics basics

### Excluded from V1

* Rider ratings
* Multi-dimensional ratings
* AI sentiment analysis
* AI-generated review summaries
* Review rewards
* Loyalty-linked review incentives
* Verified-purchase badges beyond the order linkage
* Review voting/helpfulness system
* Public customer profiles
* Review photos/videos
* Review reactions
* Review translation
* Advanced reputation scoring
* Paid review programs
* Influencer/review campaigns

Any excluded feature requires an explicit product decision and architecture update.

---

# 50. Future Rider Ratings

Rider ratings are intentionally excluded from V1.

The current review model should not silently be expanded to support rider ratings.

If rider ratings are introduced later, create an explicit ADR covering:

* Review target model
* Database changes
* API changes
* Eligibility
* Visibility
* Rider aggregate rating
* Moderation
* Risk integration
* Privacy
* Notifications

Do not overload the current `restaurant_id`-based model without an approved schema change.

---

# 51. Claude Code Implementation Rules

Before implementing reviews, Claude Code must read:

```text
CLAUDE.md
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md
docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/RISK_RULES.md
docs/security/AUTH_AUTHORIZATION.md
docs/notifications/NOTIFICATION_RULES.md
docs/notifications/REALTIME_SPEC.md
docs/reviews/REVIEW_RULES.md
docs/reviews/REVIEW_SPEC.md
```

Claude Code must not:

* Invent rider reviews
* Invent review rewards
* Change rating scale
* Bypass order eligibility
* Trust client-provided restaurant ownership
* Allow duplicate reviews
* Hard-delete moderation history
* Modify aggregate ratings from the client
* Create a second fraud engine
* Change frozen business rules without approval

---

# 52. Definition of Done

Reviews & Ratings are complete only when:

* Database schema is implemented
* Migrations are version controlled
* Review eligibility works
* Order ownership is enforced
* One-review-per-order constraint works
* Rating validation works
* Comment validation works
* Customer review APIs work
* Restaurant response APIs work
* Reporting works
* Moderation works
* Rating aggregation works
* Tenant isolation works
* Authorization works
* Risk integration works
* Notifications work where required
* Audit logging works
* Idempotency works where required
* Rate limiting works
* Unit tests pass
* Integration tests pass
* E2E review flow passes
* Failure/concurrency tests pass
* Security tests pass
* Documentation remains synchronized

---

# 53. Golden Review Flow

```text
Customer
   ↓
Delivered Order
   ↓
Review Eligibility Check
   ↓
Customer Submits Rating + Optional Comment
   ↓
Backend Validates Ownership
   ↓
Backend Validates Order = DELIVERED
   ↓
Backend Checks Duplicate Review
   ↓
Review Created
   ↓
Moderation / Risk Checks
   ↓
Review Published or Moderated
   ↓
Restaurant Notified
   ↓
Restaurant Responds
   ↓
Customer Notified
   ↓
Rating Aggregate Updated
   ↓
Analytics / Audit Events
```

---

# 54. Final Business Rule

The Reviews & Ratings system exists to provide useful feedback tied to genuine QuickBite delivery experiences while protecting customers, restaurants, and the platform from abuse.

The backend, database constraints, authorization system, Trust & Risk Engine, moderation workflow, and audit system collectively enforce review integrity.

Frontend applications provide the user experience but never become the authority for review eligibility, ownership, status, moderation, or rating aggregation.
