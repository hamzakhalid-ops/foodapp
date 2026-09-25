# QuickBite Admin & Operations Rules

**Document:** `docs/admin/ADMIN_RULES.md`
**Product:** QuickBite
**Phase:** 13 — Admin & Operations
**Status:** V1 Specification
**Authority:** Admin and operational business rules
**Last Updated:** 2026-09-25

---

# 1. Purpose

This document defines the authoritative business rules for the QuickBite Admin & Operations system.

The Admin system provides controlled operational access to:

* Customers
* Restaurants
* Restaurant approvals
* Riders
* Orders
* Payments
* Refunds
* Settlements
* Promotions
* Reviews
* Support
* Trust & Risk
* System configuration
* Audit logs
* Operational reporting

The Admin system must operate on top of the existing QuickBite business engines.

Admin functionality must not create duplicate sources of truth.

---

# 2. Core Principle

The Admin Panel is an **operational control interface**, not a replacement for the platform's domain engines.

The authoritative systems remain:

```text
Orders              → Order system
Cancellations       → Cancellation Rules Engine
Dispatch            → Delivery Dispatch Engine
Risk                → Trust & Risk Engine
Promotions          → Promotions Engine
Reviews             → Reviews module
Payments            → Payment system
Financials           → Financial system
Notifications       → Notification system
Support             → Support system
```

Admin actions must call the appropriate authoritative service/module.

Admin users must never bypass business rules by directly modifying database records.

---

# 3. Admin Roles

QuickBite V1 supports:

* ADMIN
* SUPER_ADMIN

The system must not introduce additional admin roles unless explicitly approved through an ADR.

Permissions must distinguish ordinary operational access from high-sensitivity actions.

---

# 4. ADMIN Role

ADMIN users may receive permissions for operational tasks such as:

* Viewing customers
* Viewing restaurants
* Viewing riders
* Viewing orders
* Managing restaurant applications
* Managing support tickets
* Moderating reviews
* Viewing risk information where authorized
* Managing promotions where authorized
* Performing approved operational actions
* Viewing operational reports
* Viewing appropriate audit information

ADMIN access must always be permission-based.

An ADMIN must not automatically receive every administrative permission.

---

# 5. SUPER_ADMIN Role

SUPER_ADMIN is reserved for highly trusted platform administration.

SUPER_ADMIN may perform high-sensitivity operations where explicitly permitted, including:

* Sensitive system configuration
* High-risk account actions
* Critical operational overrides
* Sensitive financial operations
* Permission administration
* Other restricted administrative actions

SUPER_ADMIN actions must still be:

* Authenticated
* Authorized
* Audited
* Protected by appropriate step-up authentication where required

SUPER_ADMIN is not permission bypass.

---

# 6. Permission Model

Admin authorization follows:

```text
Authentication
→ Identity
→ Admin Role
→ Permission
→ Resource Scope
→ Business Rule
→ Sensitive Action Check
→ Action
→ Audit
```

Frontend visibility is never considered authorization.

Every sensitive backend endpoint must enforce authorization independently.

---

# 7. Resource Scope

Admin access may be scoped by resource.

Examples:

* Customer
* Restaurant
* Rider
* Order
* Payment
* Refund
* Settlement
* Promotion
* Review
* Support ticket
* Risk record
* System configuration

An admin who can view one resource must not automatically receive unrestricted access to all resources.

---

# 8. Customer Management

Admins may:

* Search customers
* View customer profile
* View account status
* View order history where authorized
* View support history where authorized
* View risk status where authorized
* Restrict an account where authorized
* Restore an account where authorized
* Review security events where authorized

Admins must not:

* View passwords
* View authentication secrets
* Modify private information without authorization
* Bypass risk rules
* Permanently ban users through arbitrary database changes

Account restrictions must use the appropriate account/risk mechanism.

---

# 9. Restaurant Management

Admins may:

* Search restaurants
* View restaurant profile
* Review restaurant application
* Approve restaurant application
* Reject restaurant application
* Suspend restaurant where authorized
* Reactivate restaurant where authorized
* Review restaurant operational status
* View orders
* View support history
* Review restaurant documents
* Review risk information where authorized

Restaurant financial information must remain permission-controlled.

---

# 10. Restaurant Owner and Operator Separation

The existing restaurant roles remain:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

Admin operations must not create a new restaurant operational role.

The Operator role remains the consolidated operational role.

Owner-only permissions remain owner-controlled unless an explicit architecture decision changes them.

---

# 11. Restaurant Approval

Restaurant approval must be controlled by Admin permissions.

Approval may require verification of:

* Restaurant identity
* Required documents
* Operational information
* Payment information where required
* Service area
* Other onboarding requirements defined by the restaurant onboarding system

Approval/rejection must be audited.

Admin must provide a reason for rejection where required by the workflow.

---

# 12. Rider Management

Admins may:

* Search riders
* View rider profile
* Review rider documents
* Review rider status
* Review delivery history where authorized
* Review support history
* Review risk information
* Restrict rider account where authorized
* Reactivate rider where authorized

Admin must not manually manipulate rider location state.

Dispatch remains authoritative for rider assignment.

---

# 13. Order Operations

Admin may inspect:

* Order details
* Order status
* Order history
* Customer
* Restaurant
* Rider
* Payment status
* Delivery status
* Cancellation information
* Support tickets

Admin operational actions must use the Order and related business engines.

Admin must not directly modify:

* Order status
* Payment status
* Delivery status
* Rider assignment

unless an authorized operational service explicitly supports the action.

---

# 14. Order Cancellation

Admin cancellation is permitted only where authorized.

Examples:

* Restaurant cannot fulfill order
* Restaurant closure
* Payment problem
* Safety problem
* Duplicate order
* Platform error
* Legitimate support intervention

Admin cancellation must:

* Invoke the Cancellation Rules Engine
* Apply payment/refund rules
* Record the actor
* Record the reason
* Create audit records
* Trigger required notifications
* Apply financial consequences correctly

---

# 15. Dispatch Operations

Admin may inspect dispatch information.

Admin may perform operational intervention only through an authorized dispatch capability.

Admin must not:

* Directly assign riders in the database
* Bypass rider eligibility
* Ignore rider account restrictions
* Ignore vehicle requirements
* Ignore risk restrictions

Any supported dispatch override must be explicitly authorized and audited.

---

# 16. Payment Operations

Admin may inspect:

* Payment status
* Payment method
* Payment attempts
* Payment failure information
* Refund status

Sensitive payment actions require explicit permissions.

Admins must never directly modify payment state.

---

# 17. Refund Operations

Authorized admins may initiate refunds through the existing refund system.

Refunds require:

* Permission
* Valid refund reason
* Payment/order validation
* Idempotency
* Audit logging
* Existing refund rules
* Provider handling where applicable

A support/admin UI must never simulate a refund by changing database records.

---

# 18. Financial Operations

Admin may inspect:

* Restaurant earnings
* Rider earnings
* Settlements
* Payouts
* Invoices
* Reconciliation information

Financial records must remain owned by the financial subsystem.

Manual financial adjustments require explicit authorization and auditability.

---

# 19. Settlement Operations

Authorized admins may:

* Review settlements
* Review settlement items
* Investigate discrepancies
* Review settlement status
* Trigger approved settlement workflows

Admin must not arbitrarily modify settlement totals.

Any adjustment must use an approved financial mechanism.

---

# 20. Promotion Management

Admin may:

* Search promotions
* View promotion details
* Create promotions where authorized
* Activate promotions
* Pause promotions
* Disable promotions
* Review promotion usage
* Investigate promotion abuse

Promotion validation and redemption remain controlled by the Promotions Engine.

Admin must not directly manipulate promotion usage to bypass limits.

---

# 21. Review Moderation

Admin may:

* View reported reviews
* Review moderation status
* Hide reviews
* Remove reviews
* Restore reviews where supported
* Review reports
* Review moderation history

Review moderation must follow the Reviews module rules.

Admin must not create rider ratings or other review functionality excluded from V1.

---

# 22. Support Operations

Admin/support permissions may include:

* View tickets
* Search tickets
* Assign tickets
* Reassign tickets
* Change priority
* Change category
* Add internal notes
* Respond
* Escalate
* Resolve
* Close
* Reopen

Support operations must follow:

`docs/support/SUPPORT_RULES.md`

Support remains its own authoritative module.

---

# 23. Risk Operations

Authorized admins may:

* View risk flags
* View risk events
* Review restrictions
* Investigate suspicious activity
* Apply supported risk actions

Risk decisions must remain inside the Trust & Risk Engine.

Admin must not hard-code permanent bans outside the risk system.

---

# 24. Risk Restrictions

Possible actions include existing risk actions:

```text
NORMAL
MONITORED
COD_RESTRICTED
ADDITIONAL_VERIFICATION
ORDER_RESTRICTED
ACCOUNT_RESTRICTED
```

Admin may trigger a risk action only through authorized risk functionality.

---

# 25. System Configuration

Admin configuration may include approved operational settings such as:

* Dispatch settings
* Risk thresholds
* Promotion configuration
* Support configuration
* Notification settings
* Operational limits

Sensitive configuration changes require:

* Permission
* Validation
* Audit
* Previous value
* New value
* Reason

---

# 26. Configuration Safety

Configuration changes must:

* Be validated server-side
* Use allowed value ranges
* Avoid invalid states
* Be auditable
* Avoid direct unrestricted database modification

Critical configuration should require step-up authentication.

---

# 27. Audit Logs

Admin actions must be auditable.

Audit information should include:

* Actor
* Role
* Permission/action
* Resource
* Resource ID
* Previous state where relevant
* New state where relevant
* Reason
* Timestamp
* Correlation/request ID where available

Audit records must not be editable by ordinary admins.

---

# 28. Sensitive Actions

Sensitive actions include:

* Account restriction
* Account restoration
* Restaurant suspension
* Rider suspension
* Order cancellation override
* Refund
* Financial adjustment
* Settlement intervention
* Risk restriction
* Security changes
* Permission changes
* System configuration
* Access to highly sensitive information

Sensitive actions require explicit permissions.

---

# 29. Step-Up Authentication

Step-up authentication should be required for high-impact operations.

Examples:

* Large/high-risk refund
* Financial adjustment
* Permission change
* Security configuration change
* High-impact account restriction
* Critical system configuration

The exact threshold/configuration must be centrally defined.

Step-up authentication must be enforced server-side.

---

# 30. MFA

Admin accounts must support strong authentication.

MFA should be required for administrative access where supported by the authentication architecture.

SUPER_ADMIN accounts must use stronger authentication controls than ordinary consumer accounts.

MFA status must not be trusted from the client.

---

# 31. Bulk Actions

Bulk actions may be supported for safe operational tasks.

Examples:

* Bulk status review
* Bulk assignment
* Bulk moderation review
* Bulk notification actions where appropriate

Bulk actions must:

* Validate every target
* Enforce permissions for every target
* Record the operation
* Avoid partial silent failure
* Produce an audit trail
* Use safe transaction/batch behavior

High-risk bulk actions should be disabled unless explicitly approved.

---

# 32. Search

Admin search must be:

* Authenticated
* Permission-aware
* Paginated
* Rate-limited
* Audited where sensitive

Search must not become a way to bypass resource authorization.

---

# 33. Filtering

Operational lists should support appropriate filtering.

Examples:

* Status
* Date
* Category
* Priority
* Role
* Restaurant
* Rider
* Customer
* Risk status
* Payment state
* Settlement state
* Support state

Backend controls maximum page size and query complexity.

---

# 34. Data Export

Administrative exports are sensitive.

Any export capability must:

* Require explicit permission
* Limit fields
* Log the export
* Protect downloaded data
* Avoid unnecessary personal information

Bulk export should not be enabled merely because an admin can view the underlying records.

---

# 35. Privacy

Admins should receive only the information necessary for their role.

Do not expose:

* Passwords
* Authentication secrets
* Full payment credentials
* Unnecessary private addresses
* Unnecessary identity documents
* Internal risk details to unauthorized admins
* Internal support notes to unauthorized users

---

# 36. Admin API Security

All admin APIs require:

```text
Authentication
→ Admin Role
→ Permission
→ Resource Authorization
→ Business Rule
→ Sensitive Action Check
→ Audit
```

Frontend route protection is insufficient.

---

# 37. Admin Session Security

Administrative sessions should have stronger controls than customer sessions.

Controls should include:

* Session expiration
* Secure cookies/tokens
* Reauthentication for sensitive actions
* MFA
* Rate limiting
* Login monitoring
* Suspicious-session detection

---

# 38. Rate Limiting

Admin APIs must be rate-limited.

Particularly sensitive endpoints require stricter limits:

* Login
* MFA
* Search
* Bulk operations
* Refund
* Account restriction
* Configuration changes
* Export
* Permission management

---

# 39. Error Handling

Admin APIs must not expose unnecessary internal information.

Errors should use structured codes.

Examples:

```text
ADMIN_ACCESS_DENIED
ADMIN_PERMISSION_DENIED
ADMIN_RESOURCE_NOT_FOUND
ADMIN_INVALID_ACTION
ADMIN_SENSITIVE_ACTION_REQUIRES_STEP_UP
ADMIN_INVALID_CONFIGURATION
ADMIN_BULK_OPERATION_FAILED
ADMIN_EXPORT_NOT_ALLOWED
```

---

# 40. Operational Overrides

Operational overrides must be rare and explicit.

An override must:

* Have a defined purpose
* Require permission
* Validate the current state
* Record reason
* Record actor
* Record previous/new state where applicable
* Generate audit information
* Trigger relevant notifications/events

Overrides must not become a generic bypass mechanism.

---

# 41. Notification Rules

Administrative actions that affect users should generate appropriate notifications.

Examples:

* Account restriction
* Restaurant suspension
* Rider suspension
* Order cancellation
* Refund
* Support response
* Promotion change affecting users

Notifications use the existing Notification system.

---

# 42. Realtime Rules

Admin operational screens may use realtime events for:

* New orders
* Order status changes
* Dispatch changes
* Support updates
* Risk events
* Payment updates

Realtime access must be permission-controlled.

---

# 43. Concurrency

Admin operations must handle concurrent actions.

Examples:

* Two admins attempt to refund the same payment
* Two admins attempt to suspend a restaurant
* Two admins modify the same configuration
* Two admins assign the same support ticket

The backend must use appropriate:

* Transactions
* Row locking
* Optimistic concurrency
* Idempotency

according to the operation.

---

# 44. Financial Safety

No admin action may bypass:

* Payment rules
* Refund rules
* Earnings rules
* Settlement rules
* Payout rules
* Reconciliation rules

Financial changes must originate from the financial subsystem.

---

# 45. Risk Safety

Admin operations must integrate with the Trust & Risk Engine.

No permanent risk policy may be created through undocumented admin behavior.

---

# 46. Testing

Admin functionality requires:

### Authorization tests

* Admin permission denied
* Super Admin permission
* Resource isolation
* Sensitive action protection

### Business tests

* Order cancellation
* Refund
* Restaurant approval
* Rider restriction
* Customer restriction
* Review moderation
* Promotion management
* Risk actions

### Security tests

* IDOR prevention
* Privilege escalation prevention
* MFA/step-up
* Session security
* Export protection

### Concurrency tests

* Duplicate refund
* Concurrent suspension
* Configuration conflict
* Bulk action conflict

---

# 47. Claude Code Rules

Claude Code must:

1. Read `CLAUDE.md`.
2. Read `ADMIN_RULES.md`.
3. Read `ADMIN_SPEC.md`.
4. Read all relevant authoritative domain specifications.
5. Never invent admin permissions silently.
6. Never bypass business engines.
7. Never directly modify critical financial/order/risk records.
8. Use server-side authorization.
9. Use transactions for critical operations.
10. Use idempotency for repeatable sensitive operations.
11. Audit sensitive actions.
12. Add security tests.
13. Add concurrency tests.
14. Add integration tests.
15. Update documentation when approved behavior changes.
16. Stop if a conflict with an existing frozen specification is discovered.

---

# 48. V1 Exclusions

V1 does not require:

* AI admin assistant
* AI operational decisions
* Fully automated operations
* Complex workforce management
* Multi-level enterprise admin hierarchy
* Advanced BI platform
* Elasticsearch-based admin search
* Distributed microservices
* Automated financial adjustment engine
* Complex approval workflows beyond required operational approvals

These require separate decisions.

---

# 49. Core Admin Principle

```text
Admin has authority to operate the platform,
but Admin does not replace the platform's authoritative engines.
```

Every administrative action must remain:

* Authorized
* Validated
* Auditable
* Secure
* Idempotent where required
* Consistent with existing business rules
* Consistent with financial integrity
* Consistent with risk controls
