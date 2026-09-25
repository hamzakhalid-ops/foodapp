# QuickBite Support & Customer Service Rules

**Document:** `docs/support/SUPPORT_RULES.md`
**Product:** QuickBite
**Phase:** 12 — Support & Customer Service
**Status:** V1 Specification
**Authority:** Support business rules
**Last Updated:** 2026-09-25

---

## 1. Purpose

This document defines the authoritative business rules for QuickBite Support & Customer Service.

It governs:

* Customer support
* Restaurant support
* Rider support
* Admin/support-agent operations
* Support tickets
* Support conversations
* Ticket categories
* Ticket priorities
* SLA handling
* Ticket assignment
* Ticket status lifecycle
* Attachments
* Escalation
* Order-related support
* Payment-related support
* Refund-related support
* Delivery issues
* Restaurant issues
* Rider issues
* Customer complaints
* Abuse reports
* Internal notes
* Support notifications
* Realtime support updates
* Support authorization
* Support auditability
* Privacy
* Rate limiting
* Abuse prevention
* Support-related testing

The support system must remain simple enough for V1 while providing sufficient controls for real operational use.

---

# 2. Architectural Principles

## 2.1 Backend Authority

The backend is authoritative for:

* Ticket ownership
* Ticket visibility
* Ticket status
* Ticket priority
* Ticket category
* Assignment
* Escalation
* SLA timestamps
* Internal notes
* Attachment authorization
* Support-related order information
* Refund/support actions
* Customer eligibility
* Restaurant eligibility
* Rider eligibility
* Support permissions

Clients must never be trusted to determine whether an operation is permitted.

---

## 2.2 Support Is Not a Second Order Engine

Support must not duplicate the core order lifecycle.

The order system remains authoritative for:

* Order status
* Cancellation rules
* Payment state
* Refund state
* Delivery state
* Restaurant state
* Rider assignment
* Financial state

Support can initiate authorized actions through the existing business engines and APIs.

Support must not directly mutate critical order/payment/financial state without going through the authoritative business rules.

---

## 2.3 Support Must Be Auditable

Important support actions must be recorded.

Examples:

* Ticket creation
* Assignment
* Reassignment
* Priority changes
* Status changes
* Internal notes
* Customer-visible messages
* Admin actions
* Escalation
* Refund initiation
* Cancellation initiated by support
* Account restrictions
* Attachment actions
* Ticket closure
* Ticket reopening

Sensitive actions must contain enough audit information to determine:

* Who performed the action
* What action was performed
* Which ticket was affected
* When it happened
* Relevant order/payment/resource identifiers
* Previous state where applicable
* New state where applicable

---

# 3. Supported Actors

The support system supports:

### CUSTOMER

Can:

* Create support tickets
* View own tickets
* View own support conversations
* Send messages
* Upload permitted attachments
* View ticket status
* View ticket priority where exposed
* Respond to support requests
* Reopen eligible resolved tickets
* Report abuse or safety concerns

Cannot:

* View internal notes
* View another customer's tickets
* Modify support assignment
* Modify SLA
* Change ticket category without backend validation
* Change ticket status arbitrarily

---

### RESTAURANT_OWNER

Can:

* Create support tickets for authorized restaurant matters
* View restaurant support tickets
* Send messages
* Upload permitted attachments
* Respond to support requests
* View support conversation history
* Report restaurant operational problems

The owner may access restaurant-level support information according to restaurant authorization.

---

### RESTAURANT_OPERATOR

Can:

* Create operational support tickets where authorized
* View authorized restaurant support tickets
* Send support messages
* Upload permitted attachments
* Respond to support requests
* Report operational problems

The operator must not gain access to owner-only financial/account permissions merely because they can contact support.

---

### RIDER

Can:

* Create support tickets
* View own tickets
* Send messages
* Upload permitted attachments
* Report delivery issues
* Report customer issues
* Report restaurant issues
* Report safety/security concerns
* Respond to support requests

---

### ADMIN

Can, according to assigned permissions:

* View support tickets
* Search tickets
* Filter tickets
* Assign tickets
* Reassign tickets
* Change priority
* Change category
* Add internal notes
* Send customer-visible messages
* Escalate tickets
* Resolve tickets
* Close tickets
* Reopen tickets where authorized
* Perform authorized operational actions
* Review support audit history

---

### SUPER_ADMIN

Has all support capabilities available to ADMIN plus authorized high-sensitivity operational controls.

SUPER_ADMIN access must still be permission-checked and audited.

---

# 4. Ticket Ownership and Visibility

## 4.1 Customer Tickets

A customer can only access tickets belonging to that customer.

A customer must not be able to access another customer's:

* Ticket
* Messages
* Attachments
* Internal notes
* Order support information

---

## 4.2 Restaurant Tickets

Restaurant support tickets must be tenant-isolated.

A restaurant user may only access tickets associated with restaurants for which the user has valid authorization.

Restaurant users must not be able to access:

* Other restaurants' tickets
* Other restaurants' conversations
* Other restaurants' attachments
* Internal support notes

---

## 4.3 Rider Tickets

Riders may only access their own support tickets.

---

## 4.4 Admin Access

Admin access is permission-based.

Having an ADMIN role does not automatically mean every admin may perform every support operation.

Sensitive operations require explicit permissions.

---

# 5. Ticket Categories

V1 supports structured categories.

## Customer Categories

* ORDER_PROBLEM
* PAYMENT_PROBLEM
* REFUND_PROBLEM
* DELIVERY_PROBLEM
* RESTAURANT_PROBLEM
* RIDER_PROBLEM
* PROMOTION_PROBLEM
* ACCOUNT_PROBLEM
* APP_PROBLEM
* ABUSE_REPORT
* SAFETY_REPORT
* OTHER

---

## Restaurant Categories

* ORDER_PROBLEM
* CUSTOMER_PROBLEM
* RIDER_PROBLEM
* PAYMENT_PROBLEM
* SETTLEMENT_PROBLEM
* MENU_PROBLEM
* RESTAURANT_ACCOUNT_PROBLEM
* PROMOTION_PROBLEM
* APP_PROBLEM
* ABUSE_REPORT
* SAFETY_REPORT
* OTHER

---

## Rider Categories

* DELIVERY_PROBLEM
* ORDER_PROBLEM
* RESTAURANT_PROBLEM
* CUSTOMER_PROBLEM
* PAYMENT_PROBLEM
* EARNINGS_PROBLEM
* ACCOUNT_PROBLEM
* APP_PROBLEM
* ABUSE_REPORT
* SAFETY_REPORT
* OTHER

---

## Admin/Operational Categories

Support staff may use operational classifications including:

* ORDER_OPERATIONS
* PAYMENT_OPERATIONS
* REFUND_OPERATIONS
* DELIVERY_OPERATIONS
* RESTAURANT_OPERATIONS
* RIDER_OPERATIONS
* CUSTOMER_OPERATIONS
* RISK_AND_ABUSE
* ACCOUNT_SECURITY
* TECHNICAL_PROBLEM
* FINANCIAL_OPERATIONS
* OTHER

---

# 6. Ticket Priority

V1 priorities:

* LOW
* NORMAL
* HIGH
* URGENT

## LOW

General questions or non-blocking issues.

Examples:

* General information
* Non-critical account questions
* Minor application issues

---

## NORMAL

Standard support requests requiring normal operational handling.

Examples:

* Typical order issue
* Standard refund question
* Restaurant operational issue
* Rider earnings question

---

## HIGH

Issues requiring faster attention.

Examples:

* Significant delivery problem
* Payment problem affecting an active order
* Repeated operational failure
* Customer unable to resolve an active issue

---

## URGENT

Issues requiring immediate operational attention.

Examples:

* Safety issue
* Serious abuse report
* Security incident
* Active order issue with significant operational impact
* Critical financial/payment problem requiring immediate intervention

Priority must be assigned based on documented support rules.

Clients cannot arbitrarily set a ticket to URGENT and bypass backend validation.

---

# 7. Ticket Status Lifecycle

V1 ticket statuses:

```text
OPEN
IN_PROGRESS
WAITING_FOR_CUSTOMER
WAITING_FOR_INTERNAL
RESOLVED
CLOSED
REOPENED
```

## OPEN

Ticket has been created and requires support handling.

---

## IN_PROGRESS

Support has accepted/started work on the ticket.

---

## WAITING_FOR_CUSTOMER

Support requires information or action from the customer, restaurant, or rider who opened the ticket.

---

## WAITING_FOR_INTERNAL

Support requires action or information from another internal team or operational process.

---

## RESOLVED

The support issue has been addressed or an appropriate resolution has been provided.

A resolved ticket may remain available for a limited reopening window according to configured rules.

---

## CLOSED

Ticket is completed and no further normal interaction is expected.

---

## REOPENED

A previously resolved/closed ticket has been reopened because the issue remains unresolved or a new relevant response requires additional handling.

---

# 8. Valid Status Transitions

The backend must enforce valid status transitions.

Recommended V1 transition model:

```text
OPEN
  → IN_PROGRESS
  → WAITING_FOR_CUSTOMER
  → WAITING_FOR_INTERNAL
  → RESOLVED
  → CLOSED

IN_PROGRESS
  → WAITING_FOR_CUSTOMER
  → WAITING_FOR_INTERNAL
  → RESOLVED

WAITING_FOR_CUSTOMER
  → IN_PROGRESS
  → RESOLVED

WAITING_FOR_INTERNAL
  → IN_PROGRESS
  → RESOLVED

RESOLVED
  → CLOSED
  → REOPENED

CLOSED
  → REOPENED

REOPENED
  → IN_PROGRESS
  → WAITING_FOR_CUSTOMER
  → WAITING_FOR_INTERNAL
  → RESOLVED
```

A client must never directly force an invalid transition.

---

# 9. Ticket Creation Rules

A ticket must contain:

* Requesting actor
* Category
* Initial message
* Creation timestamp
* Initial status
* Initial priority
* Relevant resource references where applicable

Relevant resources may include:

* Order
* Payment
* Refund
* Delivery
* Restaurant
* Rider
* Customer

A support ticket may exist without an order reference for account, technical, or general support.

---

# 10. Order-Related Support

When a ticket references an order:

* Backend must verify the requester is authorized to reference that order.
* Support may display relevant order information according to permissions.
* Support must not trust order identifiers supplied by the client without authorization checks.
* Support actions affecting the order must invoke the existing order/business engines.

Examples:

* Cancellation → Cancellation Rules Engine
* Refund → Payment/Refund rules
* Delivery issue → Delivery/Dispatch rules
* Risk issue → Trust & Risk Engine

---

# 11. Payment and Refund Support

Support may investigate:

* Payment failures
* Payment status
* Duplicate payment concerns
* Refund status
* Missing refund concerns
* COD-related payment problems

Support must not manually alter payment state through arbitrary database updates.

Refunds must use the existing payment/refund system.

Financial actions require:

* Authorization
* Idempotency where applicable
* Audit logging
* Existing financial rules
* Existing payment provider rules

---

# 12. Delivery Support

Delivery support may concern:

* Late delivery
* Rider unable to locate customer
* Restaurant pickup issue
* Customer unavailable
* Incorrect delivery status
* Rider issue
* Delivery safety issue

Support must not manually assign riders by bypassing the Delivery Dispatch Engine unless an explicitly authorized operational override exists.

Any operational override must be audited.

---

# 13. Restaurant Support

Restaurant support may include:

* Restaurant account problems
* Menu problems
* Order problems
* Rider pickup problems
* Settlement questions
* Promotion problems
* Technical issues
* Customer complaints
* Abuse reports

Restaurant support must preserve restaurant tenant isolation.

---

# 14. Rider Support

Rider support may include:

* Delivery problems
* Earnings problems
* Restaurant problems
* Customer problems
* Account problems
* App problems
* Safety concerns
* Abuse reports

Rider support must not expose customer private information beyond what is operationally required.

---

# 15. Customer Complaints

Customer complaints must be recorded through support.

Where a complaint concerns:

* Restaurant behavior
* Rider behavior
* Delivery
* Payment
* Product/service quality
* Abuse

the ticket should be categorized appropriately.

Repeated or suspicious complaints may be passed to the Trust & Risk Engine.

Support must not independently create permanent risk restrictions outside the risk system.

---

# 16. Abuse and Safety Reports

Abuse and safety reports receive special handling.

Support may escalate reports involving:

* Threats
* Harassment
* Violence
* Fraud
* Repeated abuse
* Account compromise
* Safety concerns
* Serious misconduct

Sensitive reports must have restricted visibility according to support permissions.

Relevant risk actions must go through the Trust & Risk Engine.

---

# 17. Internal Notes

Internal notes are support-only messages.

Internal notes:

* Are never visible to customers
* Are never visible to restaurants
* Are never visible to riders
* Must be permission-controlled
* Must be audited
* Must remain associated with the ticket

Internal notes may contain operational information necessary for handling the case.

Staff must not place unnecessary sensitive personal information into internal notes.

---

# 18. Customer-Visible Messages

Customer-visible messages may be sent by authorized support staff.

They must:

* Be associated with the ticket
* Be attributable to the sender
* Have a timestamp
* Respect ticket authorization
* Generate required notifications
* Appear in the support conversation

---

# 19. Attachments

Attachments are allowed where required for support.

Examples:

* Screenshots
* Payment evidence
* Order issue evidence
* Delivery evidence
* Restaurant issue evidence

Attachment rules:

* Validate file type
* Validate file size
* Validate ownership/access
* Scan where supported
* Generate controlled storage references
* Do not expose raw private storage locations
* Do not permit arbitrary executable files
* Do not allow unauthorized downloads

Attachment URLs should be temporary/signed where appropriate.

---

# 20. SLA Rules

V1 supports configurable SLA concepts.

SLA information may include:

* First response target
* Resolution target
* Priority
* Category
* Creation timestamp
* First response timestamp
* Resolution timestamp
* Breach timestamp

SLA configuration must be backend-controlled.

SLA timers must not be trusted from clients.

SLA does not automatically imply refunds, cancellation, compensation, or financial liability.

---

# 21. Assignment

Support tickets may be:

* Unassigned
* Assigned to a support/admin user
* Reassigned

Assignment must be authorized.

Every assignment or reassignment must be auditable.

Assignment must not expose private information beyond the assigned support user's authorization.

---

# 22. Escalation

Tickets may be escalated when:

* SLA risk is high
* Customer safety is involved
* Financial impact is significant
* Repeated support attempts failed
* Abuse/risk is involved
* Operational intervention is required
* A support agent lacks required permissions

Escalation must preserve the original ticket and conversation.

Escalation does not create a duplicate customer issue unless explicitly required.

---

# 23. Notifications

Support events may generate:

* In-app notifications
* Push notifications
* Email
* SMS where configured and appropriate

Notifications include events such as:

* Ticket created
* Support response received
* Ticket status changed
* Ticket resolved
* Ticket reopened
* Ticket escalated
* Additional information requested

Notification delivery must use the existing notification architecture and outbox pattern.

---

# 24. Realtime Support

Support conversations should support realtime updates where available.

Realtime must handle:

* New messages
* Ticket status changes
* Assignment changes where visible
* Internal updates for authorized support staff
* Reconnection
* Duplicate events
* Offline recovery

WebSocket authorization must be enforced per ticket.

A user must never subscribe to another user's ticket channel.

---

# 25. Rate Limiting

Support endpoints must be rate-limited.

Controls should cover:

* Ticket creation
* Message creation
* Attachment upload
* Reopening tickets
* Abuse reporting

Repeated abusive requests may be passed to the Trust & Risk Engine.

Rate limits must be backend-controlled.

---

# 26. Duplicate Tickets

The system should detect obvious duplicate support requests where practical.

Duplicate detection must not automatically delete tickets.

Where appropriate, support may:

* Link related tickets
* Mark a ticket as duplicate
* Continue the primary ticket

Any automatic duplicate detection must remain conservative.

---

# 27. Support and Risk Integration

Support is an input into the Trust & Risk Engine.

Possible signals include:

* Repeated false complaints
* Repeated abuse reports
* Suspicious support activity
* Repeated refund requests
* Repeated COD complaints
* Account security concerns

Support must not hard-code permanent bans.

Risk decisions remain governed by the Trust & Risk Engine.

---

# 28. Privacy

Support must follow least-privilege access.

Do not expose:

* Passwords
* Authentication secrets
* Payment credentials
* Unnecessary customer personal information
* Unnecessary rider personal information
* Private restaurant financial information
* Internal risk details to unauthorized users

Sensitive information must only be available to authorized personnel where operationally required.

---

# 29. Audit Requirements

The following must be auditable:

* Ticket creation
* Ticket assignment
* Ticket reassignment
* Ticket status changes
* Priority changes
* Category changes
* Internal notes
* Escalations
* Sensitive support actions
* Refund actions
* Cancellation actions
* Account/security actions
* Ticket closure
* Ticket reopening

Audit logs must be append-oriented and protected from ordinary support-user modification.

---

# 30. Idempotency

Idempotency must be used for support operations where duplicate requests could create harmful effects.

Examples:

* Ticket creation where duplicate submission is possible
* Message submission where retry could duplicate a message
* Support-triggered refund
* Support-triggered cancellation
* Attachment finalization where applicable

Existing `idempotency_keys` infrastructure must be reused.

---

# 31. Transaction Rules

Support database changes that must remain atomic should occur inside database transactions.

Examples:

* Ticket creation + initial message
* Status transition + status history
* Assignment + assignment history
* Resolution + resolution metadata

External providers must not be called inside critical database transactions.

Use the existing outbox architecture for asynchronous external effects.

---

# 32. Financial Safety

Support must never bypass:

* Payment state rules
* Refund rules
* Earnings rules
* Settlement rules
* Payout rules
* Financial audit requirements

Support is an operational interface, not a replacement for the financial subsystem.

---

# 33. Security Rules

All support operations must follow:

```text
Authentication
→ Identity
→ Role
→ Permission
→ Resource Ownership / Tenant
→ Support Rule
→ Action
→ Audit
```

Unauthorized support access must return the appropriate authorization error.

Do not rely on frontend visibility for security.

---

# 34. Testing Requirements

Support must have tests for:

### Authorization

* Customer cannot access another customer's ticket
* Restaurant cannot access another restaurant's ticket
* Rider cannot access another rider's ticket
* Unauthorized admin cannot perform restricted actions
* Internal notes cannot be exposed to customers

### Lifecycle

* Valid status transitions
* Invalid status transitions
* Reopening
* Closing
* Escalation

### Messages

* Customer message creation
* Support message creation
* Internal note visibility
* Duplicate message prevention

### Attachments

* Valid files
* Invalid files
* Oversized files
* Unauthorized attachment access

### Orders

* Authorized order support
* Unauthorized order support
* Correct integration with order rules

### Payments

* Payment investigation
* Refund authorization
* Idempotent refund operations

### Notifications

* Ticket creation notification
* New message notification
* Status notification
* Realtime update

### Abuse/Risk

* Repeated complaints
* Abuse reports
* Risk event creation

### Concurrency

* Simultaneous ticket updates
* Simultaneous assignment
* Simultaneous message submission
* Concurrent resolution/reopening

---

# 35. V1 Scope Exclusions

The following are not required for V1:

* Full call-center/telephony infrastructure
* AI support agents
* AI ticket resolution
* AI sentiment analysis
* Voice support
* Complex workforce scheduling
* Advanced omnichannel contact-center platform
* External CRM synchronization
* Automated compensation engine
* Complex chatbot workflows
* Predictive SLA systems
* Advanced ticket recommendation systems

These require separate architectural decisions if introduced later.

---

# 36. Claude Code Implementation Rules

Claude Code must:

1. Read `CLAUDE.md`.
2. Read this document.
3. Read `docs/support/SUPPORT_SPEC.md`.
4. Read relevant API specifications.
5. Read security/authorization rules.
6. Read order, payment, cancellation, dispatch, risk, notification, and financial rules where relevant.
7. Reuse existing `support_tickets` and `support_messages` architecture.
8. Never invent a conflicting support lifecycle.
9. Never bypass backend authorization.
10. Never directly mutate order/payment/financial state from support UI.
11. Use existing business engines.
12. Use idempotency where required.
13. Use transactions for atomic support state changes.
14. Use outbox events for external notifications.
15. Add audit logging for sensitive operations.
16. Add automated tests.
17. Update documentation when implementation changes an approved rule.
18. Stop and ask for clarification if an existing frozen specification conflicts with Phase 12.

---

# 37. Phase 12 Rule Summary

The core support principle is:

```text
Support provides controlled operational assistance.
Support does not replace the authoritative business engines.
```

Support must be:

* Secure
* Tenant-isolated
* Auditable
* Backend-authoritative
* Idempotent where necessary
* Realtime where useful
* Simple enough for V1
* Integrated with existing order/payment/risk/notification systems
* Explicit enough for production implementation
