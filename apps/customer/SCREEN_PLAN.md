# QUICKBITE CUSTOMER APP — SCREEN IMPLEMENTATION PLAN

## 1. PURPOSE

This document controls frontend screen implementation for the QuickBite Customer App.

Claude Code must use this document together with:

```text
CLAUDE.md
```

and the relevant product/API/business/security specifications.

The Customer App is implemented independently from:

```text
apps/restaurant
apps/rider
apps/admin
```

Do not implement screens belonging to another application in this app.

---

# 2. DESIGN SOURCE

Visual reference:

```text
apps/customer/design/stitch/
```

The Stitch designs are the visual source of truth for:

* layout
* spacing
* typography
* colors
* components
* navigation presentation
* forms
* cards
* buttons
* visual states
* responsive presentation

The specifications remain authoritative for:

* business behavior
* authorization
* API behavior
* order states
* payments
* cancellations
* promotions
* reviews
* risk
* notifications

If Stitch and a business rule conflict:

```text
Business rule wins for behavior.
Stitch remains the visual reference.
```

---

# 3. IMPLEMENTATION RULE

Never implement the entire Customer App in one task.

Use:

```text
APP
 ↓
BATCH
 ↓
IMPLEMENT
 ↓
VALIDATE
 ↓
USER REVIEW
 ↓
APPROVAL
 ↓
NEXT BATCH
```

Default batch size:

```text
4 screens
```

Claude must stop after each batch.

---

# 4. SCREEN STATUS

Allowed statuses:

```text
TODO
IN_PROGRESS
REVIEW
APPROVED
BLOCKED
```

Only the user/reviewer can mark a screen:

```text
APPROVED
```

Claude may mark:

```text
TODO → IN_PROGRESS → REVIEW
```

or:

```text
TODO → BLOCKED
```

when necessary.

---

# 5. BATCH 01 — AUTHENTICATION FOUNDATION

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

Claude may implement ONLY these four screens during Batch 01.

Do not implement:

* Phone Verification
* Email Verification
* Forgot Password
* Reset Password
* Home
* Restaurant Discovery
* Restaurant Details
* Menu
* Cart
* Checkout
* future screens

### Batch 01 goals

Implement:

* application launch presentation
* welcome presentation
* login UI
* create account UI
* navigation between these screens
* form validation presentation
* loading states where applicable
* error states where applicable
* authentication integration where backend/API is available
* correct responsive behavior
* Stitch visual fidelity

### Validation

Before stopping:

```text
Lint
Typecheck
Relevant tests
Build
```

Then mark the screens:

```text
REVIEW
```

Do not continue to Batch 02 automatically.

---

# 6. BATCH 02 — ACCOUNT VERIFICATION

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

Implement only after Batch 01 has been reviewed/approved.

### Goals

Implement:

* verification code input
* resend behavior
* verification states
* invalid code state
* expired code state
* forgot-password flow
* reset-password flow
* loading states
* error states
* successful states

Follow the authentication/API/security specifications.

---

# 7. BATCH 03 — CUSTOMER HOME & DISCOVERY

Status:

```text
TODO
```

Screens should be finalized against the approved Customer UI inventory and Stitch designs before implementation.

Initial scope:

```text
Home
Restaurant Discovery
Search
Restaurant Listing / Results
```

Do not invent additional screens if they are not present in the approved design inventory.

---

# 8. BATCH 04 — RESTAURANT BROWSING

Status:

```text
TODO
```

Candidate scope:

```text
Restaurant Details
Menu
Menu Category Browsing
Item Details
```

Use the actual approved Stitch screen names before implementation.

---

# 9. BATCH 05 — CART

Status:

```text
TODO
```

Scope:

```text
Cart
Cart Item Editing
Variation / Add-on Selection
Cart Validation
```

All prices and totals must be backend-authoritative.

Do not trust client-calculated totals.

---

# 10. BATCH 06 — CHECKOUT

Status:

```text
TODO
```

Scope:

```text
Address Selection
Delivery Details
Promotion Selection / Entry
Payment Method
Order Review
```

Backend must recalculate authoritative totals.

---

# 11. BATCH 07 — ORDER CREATION

Status:

```text
TODO
```

Scope:

```text
Checkout Confirmation
Order Placed
Payment Processing
Order Creation Errors
```

Implement according to the payment and order specifications.

Do not create fake successful orders.

---

# 12. BATCH 08 — ORDER TRACKING

Status:

```text
TODO
```

Scope:

```text
Active Order
Order Status
Restaurant Preparation
Rider Assignment
Pickup
Out for Delivery
Delivery Completion
```

Use the backend order lifecycle.

Never invent frontend-only order states.

---

# 13. BATCH 09 — ORDER HISTORY

Status:

```text
TODO
```

Scope:

```text
Order History
Order Details
Past Order
Receipt / Invoice Presentation where applicable
```

---

# 14. BATCH 10 — REVIEWS

Status:

```text
TODO
```

Scope:

```text
Review Eligibility
Restaurant Rating
Review Submission
Submitted Review
```

Follow the review specification.

V1:

```text
CUSTOMER → RESTAURANT
```

Rating:

```text
1–5
```

Only eligible delivered orders can be reviewed.

---

# 15. BATCH 11 — CUSTOMER PROFILE

Status:

```text
TODO
```

Scope:

```text
Profile
Edit Profile
Phone / Email Account Information
```

---

# 16. BATCH 12 — ADDRESSES

Status:

```text
TODO
```

Scope:

```text
Address List
Add Address
Edit Address
Delete Address
Address Selection
```

Use the maps/location specification where applicable.

---

# 17. BATCH 13 — NOTIFICATIONS

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

Follow notification and realtime specifications.

---

# 18. BATCH 14 — SUPPORT

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

# 19. BATCH 15 — SETTINGS

Status:

```text
TODO
```

Scope:

```text
Settings
Privacy / Account Controls
Logout
```

Do not add settings that are not supported by the product specification.

---

# 20. BATCH 16+ — REMAINING APPROVED SCREENS

Any remaining Customer App screens must be added here before implementation.

Do not allow Claude to invent future screen scope.

For every new batch:

```text
BATCH XX

Screens:
1. ...
2. ...
3. ...
4. ...

Status:
TODO
```

---

# 21. ACTIVE BATCH RULE

At any moment there must be only one active Customer App batch.

Example:

```text
ACTIVE BATCH:

BATCH 01
```

Claude must not implement:

```text
BATCH 02
BATCH 03
```

until Batch 01 is reviewed and explicitly approved.

---

# 22. STITCH FILE NAMING

Recommended:

```text
apps/customer/design/stitch/

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
```

If Stitch exports screenshots, place them in the relevant screen directory.

If Stitch exports code/assets, preserve them as references but do not blindly copy generated code if it conflicts with the project's architecture.

---

# 23. SCREEN IMPLEMENTATION CHECKLIST

For every screen:

### Visual

* [ ] Stitch reference reviewed
* [ ] Layout matches
* [ ] Spacing matches
* [ ] Typography matches
* [ ] Colors match
* [ ] Components match
* [ ] Icons match
* [ ] Cards/buttons match
* [ ] Navigation presentation matches

### Functional

* [ ] Navigation works
* [ ] Inputs work
* [ ] Validation works
* [ ] Loading state works
* [ ] Error state works
* [ ] Empty state exists where applicable
* [ ] API integration works where applicable

### Engineering

* [ ] Authorization correct
* [ ] Backend remains authoritative
* [ ] No fake production logic
* [ ] No unrelated files changed
* [ ] Tests added/updated
* [ ] Lint passes
* [ ] Typecheck passes
* [ ] Build passes

---

# 24. BATCH COMPLETION FORMAT

When Claude finishes a batch, report:

```text
Customer App — Batch XX Complete

Implemented:
- Screen 1
- Screen 2
- Screen 3
- Screen 4

Validation:
- Lint: PASS/FAIL
- Typecheck: PASS/FAIL
- Tests: PASS/FAIL
- Build: PASS/FAIL

Known Issues:
- ...

Status:
REVIEW

Waiting for approval before starting the next batch.
```

---

# 25. DO NOT AUTO-CONTINUE

This is mandatory.

After completing a batch:

```text
STOP.
```

Do not automatically implement the next batch.

The next batch begins only after explicit user instruction.

---

# 26. CUSTOMER APP DEFINITION OF DONE

The Customer App is complete only when:

* all approved screens are implemented
* all approved Stitch designs are reproduced
* navigation works
* API integration is complete
* backend-authoritative behavior is respected
* authentication works
* authorization works
* loading/error/empty states are handled
* payments follow the payment specification
* orders follow the order specification
* cancellations follow cancellation rules
* promotions follow promotion rules
* reviews follow review rules
* support follows support rules
* notifications/realtime work where required
* tests pass
* lint passes
* typecheck passes
* production build passes
* no known critical defects remain
