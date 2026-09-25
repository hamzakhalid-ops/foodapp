# QUICKBITE RESTAURANT APP — SCREEN IMPLEMENTATION PLAN

## 1. PURPOSE

This document controls frontend screen implementation for the QuickBite Restaurant App.

Claude Code must follow:

```text
CLAUDE.md
```

plus the relevant QuickBite specifications and Stitch design references.

The Restaurant App is a separate application from:

```text
apps/customer
apps/rider
apps/admin
```

---

# 2. RESTAURANT ROLE MODEL

The Restaurant App supports:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

Do not create separate:

```text
MANAGER
ORDER_STAFF
KITCHEN_STAFF
```

roles.

The Restaurant Operator represents the consolidated day-to-day restaurant operational role.

Sensitive owner-only functionality must follow the authorization specification.

---

# 3. DESIGN SOURCE

Visual references are stored under:

```text
apps/restaurant/design/stitch/
```

The Stitch designs control visual presentation.

The QuickBite specifications control:

* business behavior
* permissions
* API behavior
* order states
* financial behavior
* restaurant state
* menu rules
* dispatch behavior
* risk
* notifications
* support

Do not allow a visual mockup to override a backend business rule.

---

# 4. IMPLEMENTATION WORKFLOW

Implement the Restaurant App using:

```text
One Batch
    ↓
Implement
    ↓
Validate
    ↓
User Review
    ↓
Approval
    ↓
Next Batch
```

Default:

```text
4 screens per batch
```

Claude must stop after every batch.

---

# 5. SCREEN STATUS

Allowed:

```text
TODO
IN_PROGRESS
REVIEW
APPROVED
BLOCKED
```

Claude can move screens to:

```text
IN_PROGRESS
REVIEW
BLOCKED
```

The user/reviewer controls:

```text
APPROVED
```

---

# 6. BATCH 01 — AUTHENTICATION

Status:

```text
TODO
```

Screens:

```text
1. Splash
2. Welcome
3. Login
4. Create Account
```

Only these four screens may be implemented in Batch 01.

Do not implement onboarding or dashboard screens yet.

### Requirements

Implement:

* splash
* welcome
* login
* create account
* navigation
* form validation
* loading states
* error states
* authentication integration where available
* Stitch visual fidelity

Validate:

```text
Lint
Typecheck
Tests
Build
```

Then:

```text
Status → REVIEW
STOP
```

---

# 7. BATCH 02 — ACCOUNT VERIFICATION

Status:

```text
TODO
```

Screens:

```text
5. Phone Verification
6. Email Verification
7. Forgot Password
8. Reset Password
```

Implement only after Batch 01 approval.

Follow authentication/security/API specifications.

---

# 8. BATCH 03 — RESTAURANT APPLICATION / ONBOARDING

Status:

```text
TODO
```

Initial scope:

```text
Restaurant Registration
Restaurant Information
Restaurant Documents
Restaurant Application Status
```

Use the exact approved Stitch screen names before implementation.

Follow:

```text
restaurant_applications
restaurant_documents
restaurants
```

and the restaurant onboarding specifications.

Do not allow the frontend to approve a restaurant.

Admin approval remains backend-controlled.

---

# 9. BATCH 04 — RESTAURANT SETUP

Status:

```text
TODO
```

Scope:

```text
Restaurant Profile
Operating Hours
Delivery Settings
Restaurant Configuration
```

Use the restaurant configuration rules.

---

# 10. BATCH 05 — RESTAURANT DASHBOARD

Status:

```text
TODO
```

Initial scope:

```text
Dashboard
Orders Summary
Restaurant Status
Operational Summary
```

Restaurant availability/online state must follow backend rules.

Do not make the frontend authoritative for restaurant availability.

---

# 11. BATCH 06 — RESTAURANT ORDERS

Status:

```text
TODO
```

Scope:

```text
Incoming Orders
Order Details
Accept Order
Reject Order
Order Preparation
```

Follow the authoritative lifecycle:

```text
PENDING
    ↓
RESTAURANT_ACCEPTED
    ↓
PREPARING
    ↓
READY_FOR_PICKUP
```

Do not invent additional order states.

---

# 12. BATCH 07 — ORDER OPERATIONS

Status:

```text
TODO
```

Scope:

```text
Preparing Orders
Ready for Pickup
Order Completion / Handoff
Cancellation where permitted
```

Cancellation must use the backend cancellation rules.

---

# 13. BATCH 08 — MENU

Status:

```text
TODO
```

Scope:

```text
Menu
Categories
Menu Items
Item Details
```

Use:

```text
menu_categories
menu_items
```

Do not duplicate menu data structures in the frontend.

---

# 14. BATCH 09 — MENU OPTIONS

Status:

```text
TODO
```

Scope:

```text
Item Variations
Add-ons
Availability
Pricing
```

Use:

```text
item_variations
item_add_ons
```

Prices must remain backend-authoritative.

---

# 15. BATCH 10 — PROMOTIONS

Status:

```text
TODO
```

Scope:

```text
Promotions
Create Promotion
Edit Promotion
Pause Promotion
Promotion Details
```

V1 promotion types:

```text
PERCENTAGE
FIXED_AMOUNT
```

Statuses:

```text
DRAFT
ACTIVE
PAUSED
EXPIRED
DISABLED
```

Follow the promotion specification.

---

# 16. BATCH 11 — EARNINGS

Status:

```text
TODO
```

Scope:

```text
Restaurant Earnings
Earnings Details
Financial Summary
```

Do not calculate authoritative earnings in the frontend.

Use backend-provided financial values.

---

# 17. BATCH 12 — SETTLEMENTS

Status:

```text
TODO
```

Scope:

```text
Settlements
Settlement Details
Settlement History
```

Follow:

```text
Restaurant Earnings
→ Settlement
→ Payout
→ Invoice
→ Reconciliation
→ Audit
```

---

# 18. BATCH 13 — PAYOUTS / INVOICES

Status:

```text
TODO
```

Scope:

```text
Payouts
Payout Details
Invoices
```

Sensitive financial access must follow Restaurant Owner / Operator permissions.

---

# 19. BATCH 14 — REVIEWS

Status:

```text
TODO
```

Scope:

```text
Restaurant Reviews
Review Details
Review Response
```

Authorized Restaurant Owner and Restaurant Operator may respond according to the review specification.

Do not implement customer or rider review functionality inside this app.

---

# 20. BATCH 15 — NOTIFICATIONS

Status:

```text
TODO
```

Scope:

```text
Notifications
Notification Details
Notification Preferences
```

Follow the notification/realtime specification.

---

# 21. BATCH 16 — SUPPORT

Status:

```text
TODO
```

Scope:

```text
Support
Create Ticket
Ticket Details
Support Messages
```

Follow:

```text
docs/support/SUPPORT_RULES.md
docs/support/SUPPORT_SPEC.md
```

---

# 22. BATCH 17 — STAFF / ACCESS

Status:

```text
TODO
```

Scope:

```text
Staff
Staff Details
Staff Permissions / Access
```

Only implement permissions defined by the authorization specification.

Do not create additional restaurant roles.

---

# 23. BATCH 18 — SETTINGS

Status:

```text
TODO
```

Scope:

```text
Settings
Account
Security
Logout
```

Follow the security specification.

---

# 24. FUTURE BATCHES

If the approved Stitch inventory contains additional Restaurant App screens, add them here before implementation.

Format:

```text
BATCH XX — NAME

Status:
TODO

Screens:
1. ...
2. ...
3. ...
4. ...
```

Do not allow Claude to invent future product scope.

---

# 25. STITCH DIRECTORY

Recommended structure:

```text
apps/restaurant/design/stitch/

batch-01/
├── 01-splash/
├── 02-welcome/
├── 03-login/
└── 04-create-account/

batch-02/
├── 05-phone-verification/
├── 06-email-verification/
├── 07-forgot-password/
└── 08-reset-password/

batch-03/
├── ...
```

Each screen directory can contain:

```text
reference screenshot
Stitch export
assets
design notes
```

Do not place unrelated app designs here.

---

# 26. SCREEN IMPLEMENTATION CHECKLIST

For every Restaurant App screen:

### Visual

* [ ] Stitch reference reviewed
* [ ] Layout matches
* [ ] Spacing matches
* [ ] Typography matches
* [ ] Colors match
* [ ] Components match
* [ ] Buttons match
* [ ] Icons match
* [ ] Navigation matches
* [ ] Responsive presentation checked

### Functional

* [ ] Navigation works
* [ ] Forms work
* [ ] Validation works
* [ ] Loading states work
* [ ] Error states work
* [ ] Empty states work where applicable
* [ ] API integration works
* [ ] Realtime works where required

### Security

* [ ] Role checked server-side
* [ ] Owner/operator permissions respected
* [ ] Resource ownership respected
* [ ] Sensitive financial access protected
* [ ] Client cannot override backend state

### Engineering

* [ ] Tests added/updated
* [ ] Lint passes
* [ ] Typecheck passes
* [ ] Build passes
* [ ] No unrelated screens changed
* [ ] No unrelated architecture changes

---

# 27. ACTIVE BATCH RULE

Only one Restaurant App batch may be active at a time.

Example:

```text
ACTIVE:

BATCH 01
```

Claude must not implement:

```text
BATCH 02
BATCH 03
```

until the active batch is reviewed and explicitly approved.

---

# 28. STOP RULE

When the active batch is complete:

```text
STOP.
```

Claude must report:

```text
Restaurant App — Batch XX Complete

Implemented:
- ...
- ...
- ...
- ...

Validation:
- Lint: PASS/FAIL
- Typecheck: PASS/FAIL
- Tests: PASS/FAIL
- Build: PASS/FAIL

Known Issues:
- ...

Status:
REVIEW

Waiting for approval.
```

Do not automatically begin the next batch.

---

# 29. RESTAURANT APP DEFINITION OF DONE

The Restaurant App is complete only when:

* all approved screens are implemented
* Stitch designs are faithfully reproduced
* Restaurant Owner permissions work
* Restaurant Operator permissions work
* onboarding works
* restaurant configuration works
* menu management works
* order management works
* order state transitions follow backend rules
* promotions work according to specification
* earnings are backend-authoritative
* settlements are backend-authoritative
* payouts are protected
* invoices are correctly presented
* reviews work according to specification
* support works
* notifications/realtime work where required
* tests pass
* lint passes
* typecheck passes
* production build passes
* no known critical defects remain
