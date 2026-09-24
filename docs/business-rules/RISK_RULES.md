# QuickBite — Trust & Risk Business Rules

**Version:** 1.0
**Status:** Approved for Implementation

---

## 1. Purpose

This document defines the QuickBite Trust & Risk Engine.

The system is designed to detect and manage:

* Fraud
* Abuse
* Repeated failed deliveries
* Excessive cancellations
* Payment abuse
* COD abuse
* Suspicious account behavior
* Suspicious restaurant activity
* Suspicious rider activity

The system should prefer proportional restrictions over unnecessary permanent account bans.

---

# 2. Core Architecture

Risk evaluation follows:

```text
Customer / Restaurant / Rider
            ↓
       Behavior/Event
            ↓
        Risk Event
            ↓
        Risk Rules
            ↓
        Risk Flags
            ↓
      Risk Evaluation
            ↓
      Risk Restriction
```

---

# 3. Risk Subjects

Risk can apply to:

```text
CUSTOMER
RESTAURANT
RIDER
```

Every risk event must identify:

* Subject type
* Subject ID
* Event type
* Severity
* Metadata
* Timestamp

---

# 4. Risk Events

V1 supported risk signals include:

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

The event list may be extended through documented changes.

---

# 5. Risk Rules

A risk rule contains:

```text
name
subject_type
event_type
threshold
window_seconds
action
severity
enabled
```

Example conceptual rule:

```text
Event:
COD_NON_RECEIPT

Threshold:
Configured number of events

Window:
Configured period

Action:
COD_RESTRICTED
```

The exact threshold must be configuration-driven.

---

# 6. No Hard-Coded Thresholds

Business thresholds must not be hard-coded into application logic.

Examples:

Do not write:

```text
if cod_failures >= 3
```

as permanent business logic.

Instead, retrieve the active risk rule configuration.

This allows legitimate operational changes without rewriting application code.

---

# 7. Risk Severity

Risk rules may classify events by severity.

Example:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Severity is an operational signal and must not automatically imply account termination.

---

# 8. Risk Actions

Supported actions include:

```text
NORMAL
MONITORED
COD_RESTRICTED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

---

# 9. Proportional Controls

The system should apply the least restrictive action appropriate to the configured risk rule.

Example:

Repeated COD non-receipt may result in:

```text
COD_RESTRICTED
```

rather than automatically blocking the entire account.

---

# 10. Customer Risk

Customer risk signals may include:

* COD non-receipt
* Repeated cancellations
* Payment failures
* Failed deliveries
* Excessive refunds
* Abnormal order frequency
* Suspicious account activity
* Repeated false complaints

---

# 11. Restaurant Risk

Restaurant risk signals may include:

* Excessive restaurant cancellations
* Repeated order rejection
* Suspicious refund patterns
* Abnormal order behavior
* Repeated customer complaints
* Operational anomalies

Restaurant risk restrictions must not be applied solely from one ordinary negative event unless a specific rule requires it.

---

# 12. Rider Risk

Rider risk signals may include:

* Repeated failed deliveries
* Suspicious delivery completion patterns
* Abnormal location behavior
* Repeated customer complaints
* Suspicious pickup behavior
* Unusual delivery activity

Risk rules must distinguish between genuine operational failures and suspicious patterns.

---

# 13. Risk Events Are Immutable

A risk event should be treated as historical evidence.

Do not silently rewrite historical risk events.

If an event was incorrectly created, it should be resolved, dismissed, or corrected through an auditable workflow.

---

# 14. Risk Flags

Risk flags represent an evaluated concern.

Statuses:

```text
ACTIVE
RESOLVED
DISMISSED
EXPIRED
```

A risk flag should reference the applicable risk rule where possible.

---

# 15. Risk Restrictions

Restrictions are stored independently from risk events.

Supported V1 restrictions:

```text
COD_RESTRICTED
ORDER_RESTRICTED
ADDITIONAL_VERIFICATION
ACCOUNT_RESTRICTED
```

Each restriction should include:

* Subject type
* Subject ID
* Restriction type
* Status
* Start time
* Expiration time if applicable
* Reason
* Created by
* Timestamp

---

# 16. Restriction Enforcement

Restrictions must be enforced by the backend.

Examples:

### COD restriction

Customer cannot select COD.

### Order restriction

Customer cannot create new orders.

### Additional verification

Customer must complete configured verification.

### Account restriction

Access to relevant platform functionality is restricted.

---

# 17. Client Trust

The client must never be trusted to report:

```text
risk status
restriction status
risk score
```

The backend must load authoritative restrictions.

---

# 18. COD Restriction

If a customer has:

```text
COD_RESTRICTED
```

the checkout backend must reject COD orders.

The customer may still use other supported payment methods if not otherwise restricted.

---

# 19. Risk During Checkout

Before final order creation:

1. Authenticate customer.
2. Load current restrictions.
3. Evaluate applicable checkout rules.
4. Validate payment method.
5. Apply promotion rules.
6. Calculate totals.
7. Create order if permitted.

Risk checks must occur on the backend.

---

# 20. Risk During Order Processing

Risk may be evaluated at relevant lifecycle events.

Examples:

```text
order.created
payment.failed
order.cancelled
delivery.failed
refund.created
complaint.created
```

Risk evaluation should not unnecessarily delay normal order processing.

Background processing may be used where appropriate.

---

# 21. Risk Score

A risk score may be calculated internally if required.

If implemented, the score must not become an undocumented business rule.

The system should retain the underlying signals/rules that contributed to the decision.

---

# 22. Explainability

Administrative users should be able to understand why a restriction exists.

Risk records should expose:

* Triggering event
* Applicable rule
* Threshold
* Time window
* Severity
* Resulting action
* Creation time
* Expiration time
* Override history

---

# 23. False Positives

Risk controls may produce incorrect flags.

Therefore the system must support:

```text
RESOLVED
DISMISSED
```

and authorized administrative review.

A dismissed flag should not continue enforcing an active restriction unless another valid restriction exists.

---

# 24. Admin Review

Authorized administrators may review:

* Risk events
* Risk flags
* Restrictions
* Rule configuration
* Subject history
* Administrative overrides

Sensitive risk operations must be audited.

---

# 25. Admin Override

An authorized administrator may override a restriction where legitimate.

The override must record:

* Admin ID
* Subject
* Previous restriction
* New state
* Reason
* Timestamp

Admin overrides must not erase historical risk events.

---

# 26. Risk Rule Changes

Changing a risk rule must not rewrite historical events.

Example:

If the threshold changes from one value to another, old events remain unchanged.

New evaluations use the current active rule.

---

# 27. Rule Activation

Each risk rule has:

```text
enabled = true/false
```

Disabled rules must not generate new enforcement actions.

Historical flags remain preserved.

---

# 28. Time Windows

Risk rules may use configurable windows.

Example:

```text
event_count
within window_seconds
```

The system must use consistent UTC timestamps.

Boundary conditions must be tested.

---

# 29. Repeated Events

Repeated events should be evaluated according to the active rule.

The system must not assume that every repeated event is malicious.

The configured rule determines when action is taken.

---

# 30. Restaurant Risk Restrictions

If a restaurant receives a risk restriction:

The restriction may affect:

* Order acceptance
* Restaurant availability
* Restaurant operations
* Promotions
* Account functionality

Only explicitly configured restrictions should be enforced.

---

# 31. Rider Risk Restrictions

Rider restrictions may affect:

* Going online
* Receiving dispatch offers
* Accepting deliveries
* Completing deliveries
* Account access

Dispatch must consult active rider restrictions.

---

# 32. Dispatch Integration

The Dispatch Engine must check relevant rider restrictions before creating/accepting an offer.

Example:

```text
Rider approved
AND online
AND available
AND within radius
AND not restricted
```

Only then may the rider be eligible.

---

# 33. Payment Integration

Payment failures may generate:

```text
REPEATED_PAYMENT_FAILURE
```

Risk evaluation should be based on configured thresholds rather than a single failed payment unless specifically configured.

---

# 34. Refund Integration

Refund behavior may generate:

```text
EXCESSIVE_REFUNDS
```

Risk rules should distinguish between:

* Legitimate platform refunds
* Restaurant-caused refunds
* Payment-provider failures
* Customer-requested refunds
* Suspicious repeated refunds

The risk system should retain relevant metadata.

---

# 35. Cancellation Integration

Repeated cancellations may generate:

```text
REPEATED_ORDER_CANCELLATION
```

Cancellation itself is not automatically proof of abuse.

The Risk Engine determines whether configured thresholds have been reached.

---

# 36. Failed Delivery Integration

Repeated delivery failures may generate:

```text
MULTIPLE_FAILED_DELIVERIES
```

The system should retain enough information to distinguish customer-related, restaurant-related, rider-related, and platform-related failures.

---

# 37. Complaint Integration

Repeated false complaints may generate:

```text
REPEATED_FALSE_COMPLAINT
```

This should only be created through an appropriate reviewed/validated workflow.

A single customer complaint must not automatically be classified as false.

---

# 38. Suspicious Account Activity

Potential signals may include:

* Unusual login behavior
* Repeated verification failures
* Abnormal account changes
* Unusual order behavior
* Other configured security events

Security detection and business risk detection may share events but should remain logically separated where appropriate.

---

# 39. Risk Data Privacy

Risk data is sensitive operational information.

Access must be restricted to authorized personnel.

Do not expose internal risk rules or sensitive detection information unnecessarily to customers, restaurants, or riders.

---

# 40. Risk Logging

Important risk operations must be logged:

* Risk event creation
* Rule evaluation
* Flag creation
* Restriction creation
* Restriction resolution
* Restriction dismissal
* Admin override
* Rule changes

---

# 41. Risk Audit

Administrative risk actions must create audit records.

Examples:

```text
RISK_RESTRICTION_CREATED
RISK_RESTRICTION_RESOLVED
RISK_RESTRICTION_OVERRIDDEN
RISK_RULE_UPDATED
RISK_FLAG_DISMISSED
```

---

# 42. Concurrency

Risk restrictions must be concurrency-safe.

Example:

Two workers detect the same qualifying event.

The system must prevent duplicate contradictory restrictions.

Idempotent processing should be used where appropriate.

---

# 43. Background Processing

Risk evaluation may run asynchronously through background workers when immediate enforcement is not required.

For actions that must be enforced before checkout or dispatch, the backend must perform a current authoritative restriction check.

---

# 44. Event Processing

Risk events should be safely retryable.

If processing fails:

```text
retry
↓
backoff
↓
dead-letter / operational alert
```

where appropriate.

Duplicate event processing must not produce inconsistent restrictions.

---

# 45. Risk and Account Suspension

Account restrictions must be separate from ordinary risk events.

A risk event does not automatically suspend an account unless the active configured rule explicitly produces an account restriction.

---

# 46. No Permanent Hard-Coded Ban

The Risk Engine must not contain a permanent rule such as:

```text
N violations = permanently banned
```

unless such a rule is explicitly approved and documented.

V1 favors configurable restrictions and review.

---

# 47. Configuration Safety

Risk configuration changes require:

* Authorization
* Validation
* Audit
* Version/history where appropriate

Administrators must not be able to create invalid configurations that could disable essential platform safeguards.

---

# 48. Risk Rule Testing

Every active rule should have tests covering:

* Below threshold
* Exactly at threshold
* Above threshold
* Window boundary
* Expired event
* Disabled rule
* Multiple events
* Duplicate event
* Concurrent evaluation
* Restriction creation
* Restriction expiration
* Admin override

---

# 49. Security Testing

Test that users cannot:

* Modify their own risk status
* Remove their own restriction
* Read another user's risk information
* Change risk thresholds without permission
* Bypass COD restrictions
* Bypass order restrictions
* Bypass dispatch restrictions

---

# 50. Implementation Rule

Claude Code must not invent:

* Risk thresholds
* Risk scores
* New risk actions
* New restriction types
* Automatic permanent bans
* Hidden fraud rules

Any change must first update the authoritative business-rule specification.

---

# 51. Definition of Done

Risk functionality is complete only when:

* Risk event system implemented
* Risk rules implemented
* Configurable thresholds implemented
* Risk flags implemented
* Restrictions implemented
* Checkout integration implemented
* Dispatch integration implemented
* Cancellation integration implemented
* Payment/refund integration implemented
* Admin review implemented
* Override workflow implemented
* Audit logging implemented
* Idempotency implemented
* Concurrency protection implemented
* Unit tests implemented
* Integration tests implemented
* E2E tests implemented
* Security tests implemented
* Documentation synchronized

---

**End of RISK_RULES.md**
