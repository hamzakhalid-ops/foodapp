# QuickBite — Authentication & Authorization Specification

**Version:** 1.0
**Status:** Approved for Implementation
**Phase:** 6
**Product:** QuickBite Food Delivery Platform

---

# 1. Purpose

This document defines the authoritative authentication, authorization, identity, session, verification, and account-security rules for QuickBite.

It applies to:

* Customer App
* Restaurant App
* Rider App
* Admin Panel
* Backend API
* Background workers
* WebSocket/realtime connections
* Administrative operations
* Internal services

This document must be read together with:

```text
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md
docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/DISPATCH_RULES.md
docs/business-rules/RISK_RULES.md
```

---

# 2. Security Principles

QuickBite authentication follows these principles:

1. Authentication verifies identity.
2. Authorization determines what an authenticated identity may do.
3. Backend authorization is authoritative.
4. Frontend route protection is not security.
5. Tokens must not contain unnecessary sensitive information.
6. Passwords must never be stored in plaintext.
7. Refresh tokens must be protected and rotated.
8. Sessions must be revocable.
9. Sensitive operations require stronger security controls.
10. Administrative access requires enhanced protection.
11. Tenant isolation must be enforced server-side.
12. Authentication failures must not leak sensitive account information.
13. Security events must be logged.
14. Rate limiting must protect authentication endpoints.
15. Account recovery must not become an account-takeover mechanism.

---

# 3. Identity Model

QuickBite uses the `users` table as the central identity record.

Each user has:

```text
users.id
users.email
users.phone
users.password_hash
users.status
users.email_verified_at
users.phone_verified_at
users.last_login_at
users.created_at
users.updated_at
```

A user may have one or more roles through:

```text
user_roles
```

---

# 4. Supported Roles

The authoritative QuickBite roles are:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
ADMIN
SUPER_ADMIN
```

No other role may be introduced without updating the architecture and authorization specification.

---

# 5. Authentication vs Authorization

Authentication answers:

> Who is this user?

Authorization answers:

> What is this user allowed to do?

These must remain separate.

Example:

A valid JWT proves that a user is authenticated.

It does not automatically allow the user to:

* Access another customer's order
* Access another restaurant
* Assign themselves a delivery
* Issue refunds
* Modify risk rules
* Access admin endpoints

---

# 6. User Status

User account status must be authoritative on the backend.

Recommended statuses:

```text
ACTIVE
PENDING_VERIFICATION
SUSPENDED
DISABLED
```

The exact database enum/string implementation must remain consistent with the database specification.

---

# 7. Account Creation

Registration must:

1. Validate request data.
2. Normalize email/phone.
3. Check uniqueness.
4. Validate password.
5. Create user.
6. Hash password.
7. Assign the appropriate initial role.
8. Create required profile record.
9. Create verification challenge where applicable.
10. Create security/audit event.
11. Return an authenticated or verification-required response according to the product flow.

Passwords must never be stored directly.

---

# 8. Password Storage

Passwords must be stored using a modern adaptive password hashing algorithm.

Preferred approach:

```text
Argon2id
```

If Argon2id is unavailable in the selected production stack, a strong bcrypt configuration may be used as a documented fallback.

Never use:

```text
MD5
SHA-1
plain SHA-256
plaintext
reversible encryption
```

for password storage.

---

# 9. Password Requirements

The password policy must enforce a minimum security standard.

V1 should require:

* Minimum length: configurable
* Maximum length: reasonable upper bound
* No silently truncated passwords
* Common/breached password rejection where supported
* Password confirmation during registration/reset where applicable

The exact password length policy must be centralized rather than duplicated across clients.

---

# 10. Password Authentication

Login requires:

* Email or phone identifier
* Password

The backend:

1. Locates the account.
2. Verifies account status.
3. Verifies password hash.
4. Applies authentication rate limits.
5. Applies relevant security checks.
6. Creates a session.
7. Records successful login.
8. Returns authentication credentials according to the session strategy.

---

# 11. Authentication Failure Response

Login failures must avoid revealing whether an account exists.

Prefer a generic response such as:

```text
INVALID_CREDENTIALS
```

Do not expose:

```text
EMAIL_NOT_FOUND
PHONE_NOT_FOUND
PASSWORD_WRONG
```

in a way that enables account enumeration.

---

# 12. Email Normalization

Email addresses must be normalized consistently before:

* Registration
* Login
* Password reset
* Email verification
* Account lookup

The system must use one canonical normalization strategy.

---

# 13. Phone Normalization

Phone numbers must be normalized into a consistent international representation.

The backend must not treat formatting differences as different accounts.

Example:

```text
+92XXXXXXXXXX
```

The exact supported country/region rules are configuration.

---

# 14. Email Verification

Email verification must use a secure, short-lived verification challenge.

Verification tokens must:

* Be unpredictable
* Expire
* Be single-use
* Be invalidated after successful use
* Not expose sensitive account information

After successful verification:

```text
email_verified_at
```

must be recorded.

---

# 15. Phone Verification

Phone verification uses a one-time verification code.

The verification system must enforce:

* Expiration
* Attempt limits
* Request rate limits
* Single-use behavior
* Abuse protection

Successful verification records:

```text
phone_verified_at
```

---

# 16. OTP Rules

OTP codes must:

* Be cryptographically generated
* Have a short configurable lifetime
* Be single-use
* Have limited verification attempts
* Have request rate limits
* Be invalidated after successful verification

The plaintext OTP should not be stored unnecessarily.

Where practical, store a secure hash of the OTP.

---

# 17. OTP Brute-Force Protection

The backend must limit:

* OTP requests
* OTP verification attempts
* Requests per account
* Requests per phone number
* Requests per IP/device where appropriate

Repeated failures may trigger temporary security controls.

---

# 18. Login Rate Limiting

Authentication endpoints must be rate limited.

Protection should apply to:

* Login
* Registration
* Password reset
* OTP request
* OTP verification
* Email verification
* Token refresh
* MFA verification

Rate limits must be configurable.

---

# 19. Rate-Limit Response

When a rate limit is exceeded:

```text
RATE_LIMITED
```

should be returned.

Where appropriate, the response may include retry timing.

The backend must not reveal sensitive internal rate-limit logic.

---

# 20. Session Architecture

QuickBite uses a server-controlled session model based on short-lived access credentials and refresh credentials.

Recommended architecture:

```text
Access Token
+
Refresh Token
+
Server-side session record
```

The server-side session remains authoritative for revocation.

---

# 21. Access Tokens

Access tokens should be short-lived.

They may contain:

```text
sub
session_id
token_type
issued_at
expiration
```

Optional role/permission claims may be included for performance, but backend authorization must not rely solely on stale client-provided claims.

---

# 22. Access Token Lifetime

The exact lifetime must be configured centrally.

V1 should use a relatively short access-token lifetime.

Example configuration concept:

```text
ACCESS_TOKEN_TTL
```

Do not hard-code the lifetime independently in each application.

---

# 23. Refresh Tokens

Refresh tokens provide longer-lived session continuity.

Refresh tokens must:

* Be cryptographically random
* Be associated with a server-side session
* Have expiration
* Be revocable
* Be rotated after successful use
* Not contain sensitive personal data

---

# 24. Refresh Token Rotation

Every successful refresh should rotate the refresh token.

Conceptually:

```text
Old Refresh Token
        ↓
Validate
        ↓
Invalidate Old Token
        ↓
Issue New Refresh Token
        ↓
Issue New Access Token
```

The old refresh token must not remain reusable indefinitely.

---

# 25. Refresh Token Reuse Detection

If a previously rotated refresh token is used again, the system should treat it as a potential token compromise.

The server may:

1. Revoke the affected session.
2. Revoke the refresh-token family.
3. Require the user to authenticate again.
4. Record a security event.
5. Alert security/admin systems where appropriate.

---

# 26. Session Record

The authentication system should maintain server-side session information.

Recommended information:

```text
session_id
user_id
refresh_token_hash
created_at
last_used_at
expires_at
revoked_at
ip_address
user_agent
device metadata where appropriate
```

Sensitive token values must not be logged.

---

# 27. Session Revocation

A session can be revoked because of:

* Logout
* Password reset
* Password change
* Security incident
* Account suspension
* Refresh-token reuse
* Admin security action
* User request

A revoked session must not be refreshable.

---

# 28. Logout

Logout must invalidate the relevant session.

The client must also clear locally stored authentication state.

Logout should not require the server to invalidate every other active session unless the user selects a global logout operation.

---

# 29. Logout All Sessions

QuickBite should support:

```text
Logout all sessions
```

This invalidates all active sessions belonging to the user.

Use cases:

* Suspected account compromise
* Password reset
* Security settings
* Lost device

---

# 30. Password Change

Changing a password requires:

* Authenticated session
* Current password where appropriate
* New password validation
* Secure password hashing

After a successful password change:

* Current session may remain active according to security policy.
* Other sessions should normally be revoked.
* Refresh-token families should be invalidated where appropriate.
* Security event must be recorded.

---

# 31. Password Reset

Password reset must use a secure, short-lived reset token.

Flow:

```text
Request reset
↓
Create reset challenge
↓
Send verification through approved channel
↓
Verify challenge
↓
Set new password
↓
Invalidate reset token
↓
Revoke relevant sessions
↓
Record security event
```

---

# 32. Password Reset Enumeration Protection

Password reset requests should return a generic response even if the account does not exist.

Example:

```text
If the account exists, a password reset message will be sent.
```

The API must not reveal whether the email or phone belongs to a registered user.

---

# 33. Password Reset Token Security

Reset tokens must:

* Be cryptographically random
* Be single-use
* Expire
* Be stored securely
* Never appear in application logs
* Never be exposed through analytics
* Be invalidated after successful reset

---

# 34. Multi-Factor Authentication

MFA should be supported for privileged users and sensitive operations.

At minimum, MFA should be available for:

```text
ADMIN
SUPER_ADMIN
```

Additional roles may be required to use MFA depending on security configuration.

---

# 35. MFA Methods

The implementation should prioritize secure authenticator-based MFA.

Potential methods:

```text
TOTP
WebAuthn/passkeys
```

SMS may be used only where required and should not be treated as equivalent to stronger phishing-resistant methods.

---

# 36. Admin MFA

Admin accounts must require MFA before access to privileged administrative functionality.

An admin must not bypass MFA by simply calling an API directly.

The backend must enforce MFA state.

---

# 37. Step-Up Authentication

Sensitive operations may require recent authentication or MFA even when the user already has an active session.

Examples:

* Changing payout information
* Changing sensitive account credentials
* Financial configuration
* High-risk administrative actions
* Risk-rule changes
* Manual refunds
* Settlement changes
* Permission changes

---

# 38. Authentication Freshness

For sensitive operations the backend may require:

```text
recent_authentication
```

or:

```text
recent_mfa
```

The exact freshness window is configurable.

---

# 39. Role-Based Access Control

QuickBite uses RBAC.

Roles:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
ADMIN
SUPER_ADMIN
```

Permissions should be represented separately from role names where practical.

---

# 40. Permission Model

A permission should follow:

```text
RESOURCE + ACTION
```

Examples:

```text
orders.read
orders.create
orders.cancel
orders.accept
orders.update_status

menu.read
menu.create
menu.update
menu.delete

payments.read
payments.refund

restaurants.read
restaurants.update
restaurants.approve

riders.read
riders.assign
riders.suspend

risk.read
risk.manage

settings.read
settings.manage
```

The final permission registry must be centralized.

---

# 41. Customer Permissions

Customers may:

* Manage their own profile
* Manage their own addresses
* Browse restaurants
* Browse menus
* Create their own orders
* View their own orders
* Cancel their own orders where allowed
* View their own payments
* Submit reviews for eligible orders
* Create support tickets
* Manage their own notifications
* Manage their own security settings

Customers may not:

* Access another customer's information
* Modify restaurant data
* Assign riders
* Modify financial records
* Modify risk rules
* Access admin functions

---

# 42. Restaurant Owner Permissions

Restaurant Owners may manage their own restaurant.

Typical permissions:

```text
restaurant.read
restaurant.update
restaurant.manage_hours
restaurant.manage_delivery
menu.read
menu.create
menu.update
menu.delete
orders.read
orders.accept
orders.reject
orders.update_status
promotions.manage
staff.read
staff.manage
earnings.read
settlements.read
reviews.read
reviews.respond
notifications.read
support.create
settings.manage
```

Sensitive financial/account permissions remain owner-controlled unless explicitly configured otherwise.

---

# 43. Restaurant Operator Permissions

Restaurant Operators handle daily restaurant operations.

They may generally:

* View restaurant orders
* Accept orders
* Reject orders
* Update preparation status
* Mark orders ready
* Manage menu operational availability
* View operational dashboard
* Manage day-to-day restaurant tasks

They should not automatically receive:

* Sensitive payout-account control
* Ownership transfer
* Critical financial configuration
* Owner-only security actions

---

# 44. Rider Permissions

Riders may:

* Manage their own profile
* View their own verification status
* Upload permitted documents
* Go online/offline
* View their own dispatch offers
* Accept/reject their own offers
* View assigned deliveries
* Update their own delivery status
* Confirm pickup
* Confirm delivery
* View their own earnings
* View their own notifications
* Contact support

Riders may not:

* Assign themselves arbitrary deliveries
* Access other riders' deliveries
* Access customer financial data
* Access restaurant administrative settings
* Modify dispatch configuration

---

# 45. Admin Permissions

Admin permissions should be granular.

Examples:

```text
users.read
users.manage

restaurants.read
restaurants.review
restaurants.approve
restaurants.suspend

riders.read
riders.review
riders.approve
riders.suspend
riders.assign

orders.read
orders.manage
orders.cancel

payments.read
payments.refund

settlements.read
settlements.manage

promotions.manage

reviews.manage

support.manage

risk.read
risk.manage

reports.read

audit.read

system_settings.read
system_settings.manage
```

Not every admin needs every permission.

---

# 46. Super Admin

SUPER_ADMIN has the highest application-level administrative privileges.

Super Admin access should be tightly controlled.

High-risk operations should still require:

* MFA
* Recent authentication
* Audit logging
* Explicit authorization

SUPER_ADMIN must not bypass audit logging.

---

# 47. Authorization Chain

Every protected backend request should conceptually follow:

```text
Authentication
↓
Identity
↓
Role
↓
Permission
↓
Resource Ownership / Tenant
↓
Business Rule
↓
Action
```

Passing one layer does not automatically pass the others.

---

# 48. Resource Ownership

Example:

Customer requests:

```text
GET /orders/{orderId}
```

The backend must verify:

```text
order.customer_id == authenticated_user.id
```

A valid token alone is insufficient.

---

# 49. Restaurant Tenant Isolation

Restaurant data must be isolated by restaurant ID.

For a restaurant user:

```text
authenticated_user
        ↓
restaurant_staff
        ↓
restaurant_id
        ↓
resource.restaurant_id
```

must match.

A restaurant operator from Restaurant A must never access Restaurant B.

---

# 50. Owner/Operator Isolation

The system must distinguish:

```text
RESTAURANT_OWNER
RESTAURANT_OPERATOR
```

even if both belong to the same restaurant.

Sensitive owner-only operations must verify the user's specific role/permission.

---

# 51. Rider Resource Isolation

Riders may access:

* Their own rider profile
* Their own offers
* Their own delivery assignments
* Their own earnings

A rider must not query another rider's private data by changing an ID in the request.

---

# 52. Admin Resource Access

Admin access must be permission-based.

Do not use:

```text
if role == ADMIN
```

as the only authorization model for every administrative endpoint.

Use explicit permissions.

---

# 53. WebSocket Authorization

WebSocket connections must authenticate.

The server must authorize subscriptions.

A customer may subscribe only to permitted customer resources.

A restaurant user may subscribe only to their restaurant resources.

A rider may subscribe only to their own permitted delivery events.

---

# 54. WebSocket Reconnection

After reconnecting:

1. Authenticate again.
2. Validate current session.
3. Re-check authorization.
4. Resubscribe only to authorized resources.
5. Refresh state from the API where necessary.

The client must not assume that a previous authorization state remains valid forever.

---

# 55. Token Storage

For browser-based applications, sensitive long-lived authentication credentials should not be exposed unnecessarily to JavaScript.

Where the architecture supports it, refresh credentials should use secure cookie mechanisms with appropriate:

```text
HttpOnly
Secure
SameSite
```

settings.

The final storage mechanism must be consistent across the selected frontend architecture.

---

# 56. CSRF Protection

If authentication uses cookies, state-changing requests must be protected against CSRF.

Appropriate protection may include:

* SameSite cookies
* CSRF tokens
* Origin validation
* Secure server-side request validation

Do not assume CORS alone prevents CSRF.

---

# 57. CORS

CORS must use explicit allowed origins.

Do not use unrestricted production configuration such as:

```text
Access-Control-Allow-Origin: *
```

for authenticated APIs where credentials are involved.

---

# 58. API Authentication

Protected APIs must require valid authentication credentials.

Public endpoints may include:

* Registration
* Login
* Password reset request
* Verification request
* Restaurant discovery
* Public menu discovery

Public endpoints must still be rate limited where abuse is possible.

---

# 59. Authentication Middleware

Authentication middleware should:

1. Extract credentials.
2. Validate token/session.
3. Verify expiration.
4. Verify session status.
5. Load identity.
6. Attach authenticated identity to request context.
7. Pass request to authorization middleware.

---

# 60. Authorization Middleware

Authorization middleware should verify:

* Required permission
* Role
* Resource access
* Tenant
* Business-state requirements

Business-specific authorization should remain in the relevant domain service.

---

# 61. Authentication Event Logging

Record security events such as:

```text
LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT
PASSWORD_CHANGED
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
EMAIL_VERIFIED
PHONE_VERIFIED
MFA_ENABLED
MFA_DISABLED
MFA_FAILED
SESSION_REVOKED
REFRESH_TOKEN_REUSE_DETECTED
ACCOUNT_SUSPENDED
```

Do not log plaintext passwords, OTPs, refresh tokens, or reset tokens.

---

# 62. Suspicious Login Detection

The system may record:

* IP address
* User agent
* Device metadata
* Login time
* Failed attempts
* Approximate location derived from security telemetry where appropriate

Security telemetry must follow privacy and retention requirements.

---

# 63. Account Lockout

QuickBite should avoid permanent lockouts triggered solely by repeated password failures.

Instead use configurable temporary controls such as:

```text
rate limiting
temporary authentication delay
temporary login restriction
additional verification
```

The exact policy must be configurable.

---

# 64. Brute-Force Protection

Authentication must be protected against:

* Password spraying
* Credential stuffing
* OTP brute force
* Verification abuse
* Reset-token guessing
* Session abuse

Use:

* Rate limits
* Short-lived tokens
* Attempt limits
* Monitoring
* Temporary controls
* Strong credential hashing

---

# 65. Credential Stuffing

Where practical, detect abnormal repeated login attempts across:

* IP ranges
* Accounts
* Devices
* Authentication endpoints

Detection must not automatically permanently ban legitimate users.

---

# 66. Device Sessions

If device/session management is implemented, users may view active sessions.

Session information may include:

* Device
* Browser/app
* Last active time
* Approximate location where appropriate

Users may revoke individual sessions.

---

# 67. Session Expiration

Sessions must have configurable maximum lifetime.

Refresh tokens must expire.

An expired session cannot be silently extended forever.

---

# 68. Account Suspension

If an account becomes suspended:

* Existing authorization must be rechecked.
* Active sessions should be revoked where appropriate.
* Refresh attempts must fail.
* Sensitive realtime connections must be terminated or invalidated.

---

# 69. Role Changes

If a user's role changes:

* Existing sessions must not retain elevated permissions indefinitely.
* Authorization should use current backend role/permission state.
* High-risk role changes should invalidate active sessions where appropriate.
* Audit the role change.

---

# 70. Permission Changes

Permission changes must be reflected server-side immediately or within the defined authorization cache lifetime.

Security-sensitive permissions should not rely on long-lived cached authorization data.

---

# 71. Restaurant Staff Removal

When a restaurant operator is removed:

* Their restaurant membership becomes inactive.
* They lose restaurant access.
* Relevant sessions/authorization state must be invalidated.
* Existing realtime subscriptions must be reauthorized.
* The action must be audited.

---

# 72. Owner Transfer

Restaurant ownership transfer is a sensitive operation.

It must require:

* Appropriate authorization
* Recent authentication
* Strong verification
* Audit logging

The implementation must not silently change `owner_user_id`.

---

# 73. Financial Security

Sensitive financial operations should require stronger authorization.

Examples:

* Bank/payout account changes
* Payout configuration
* Settlement adjustments
* Refunds
* Financial overrides

Owner/Admin permissions must be checked explicitly.

---

# 74. Administrative Security

Admin endpoints require:

* Authentication
* Admin role
* Required permission
* MFA where configured/required
* Resource authorization
* Audit logging for sensitive actions

---

# 75. Super Admin Security

Super Admin accounts should have:

* Mandatory MFA
* Strong session controls
* Shorter session limits where appropriate
* Enhanced audit logging
* Restricted administrative access
* Security monitoring

---

# 76. Sensitive Data

Authentication systems must never expose:

* Password hashes
* Refresh token values
* Reset tokens
* OTP values
* MFA secrets
* Payment credentials
* Private document URLs where unauthorized

API responses should return only required fields.

---

# 77. Secrets Management

Secrets must not be stored in source code.

Examples:

```text
JWT signing secrets
database passwords
payment provider secrets
SMS provider credentials
email provider credentials
MFA encryption keys
storage credentials
```

must come from secure environment/secret management.

---

# 78. JWT Signing

If JWT access tokens are used:

* Use a secure signing algorithm.
* Store signing keys securely.
* Rotate keys through a documented mechanism.
* Validate issuer/audience where configured.
* Validate expiration.
* Reject malformed or incorrectly signed tokens.

Do not accept arbitrary JWT algorithms from clients.

---

# 79. JWT Claims

Only necessary claims should be included.

Avoid putting:

* Password information
* Sensitive profile data
* Payment information
* Internal risk data
* Private documents

inside tokens.

---

# 80. JWT Key Rotation

Production signing keys should support controlled rotation.

Key rotation must not cause unnecessary global outages.

The backend should support a controlled transition between current and previous verification keys where required.

---

# 81. API Error Handling

Authentication errors must use stable error codes.

Examples:

```text
UNAUTHENTICATED
INVALID_CREDENTIALS
TOKEN_EXPIRED
TOKEN_INVALID
SESSION_REVOKED
MFA_REQUIRED
MFA_INVALID
VERIFICATION_REQUIRED
ACCOUNT_SUSPENDED
ACCOUNT_DISABLED
RATE_LIMITED
FORBIDDEN
INSUFFICIENT_PERMISSION
RESOURCE_FORBIDDEN
```

---

# 82. 401 vs 403

Use:

```text
401 Unauthorized
```

when authentication is missing or invalid.

Use:

```text
403 Forbidden
```

when the identity is authenticated but not authorized to perform the action.

---

# 83. API Enumeration Protection

Endpoints must not leak whether private resources exist when the requester is unauthorized.

For sensitive resources, return appropriate authorization errors without exposing unnecessary information.

---

# 84. File Upload Authorization

Authentication and authorization must also apply to document uploads.

Examples:

* Restaurant documents
* Rider documents
* Profile images

Users may upload only files they are authorized to manage.

Private documents must not be publicly accessible by predictable URLs.

---

# 85. Document Access

Restaurant documents and rider verification documents are sensitive.

Access must verify:

```text
authenticated user
+
required permission
+
correct restaurant/rider ownership
```

Admin access must also be permission-controlled.

---

# 86. Account Deletion

Account deletion must be treated as a security-sensitive operation.

The backend must:

* Authenticate user
* Require appropriate confirmation
* Verify outstanding obligations
* Apply retention requirements
* Preserve legally/financially required records
* Revoke sessions
* Disable authentication

Historical financial/order records must not be deleted merely because the account is closed.

---

# 87. Data Retention

Authentication/security records must follow the platform's retention policy.

Potentially retained:

* Audit logs
* Security events
* Financial records
* Order records
* Required verification records

Retention periods must be defined operationally and must comply with applicable legal requirements.

---

# 88. Security Headers

Production applications should use appropriate security headers, including where applicable:

```text
Content-Security-Policy
Strict-Transport-Security
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

The exact policy must be tested against the frontend applications.

---

# 89. HTTPS

Production authentication must use HTTPS.

Credentials, tokens, OTPs, and sensitive information must never be transmitted over plaintext HTTP.

HTTP should redirect to HTTPS where appropriate.

---

# 90. Internal Service Authentication

Background workers and internal services must authenticate to protected internal APIs where such communication exists.

Do not assume that an internal network automatically makes requests trusted.

---

# 91. Background Jobs

Background workers must not blindly trust user-provided identity information from queued jobs.

Jobs should contain authoritative identifiers and re-check required state before performing sensitive actions.

---

# 92. Authentication and Risk Integration

Authentication security events may feed the Trust & Risk Engine.

Examples:

```text
repeated login failures
suspicious account activity
verification abuse
refresh token reuse
```

Risk enforcement must remain governed by:

```text
docs/business-rules/RISK_RULES.md
```

---

# 93. Authentication and Audit Integration

Security-sensitive operations must create audit/security events.

The system must distinguish:

```text
security event
audit record
business event
```

where appropriate.

---

# 94. Authentication Event Flow

A typical login flow:

```text
Client
 ↓
POST /auth/login
 ↓
Rate limit
 ↓
Validate request
 ↓
Find user
 ↓
Verify password
 ↓
Check account status
 ↓
Check MFA requirement
 ↓
Create session
 ↓
Issue access token
 ↓
Issue refresh token
 ↓
Record security event
 ↓
Return response
```

---

# 95. Refresh Flow

```text
Client
 ↓
Refresh request
 ↓
Validate refresh token
 ↓
Find session
 ↓
Check session status
 ↓
Check token family
 ↓
Rotate refresh token
 ↓
Issue new access token
 ↓
Record last-used timestamp
 ↓
Return credentials
```

---

# 96. Password Reset Flow

```text
User
 ↓
Reset request
 ↓
Rate limit
 ↓
Create reset challenge
 ↓
Send verification
 ↓
User verifies challenge
 ↓
Set new password
 ↓
Invalidate reset challenge
 ↓
Revoke sessions
 ↓
Record security event
```

---

# 97. Authorization Decision Flow

Every protected action should conceptually follow:

```text
Request
 ↓
Authenticated?
 ↓
Correct role?
 ↓
Required permission?
 ↓
Correct tenant/resource?
 ↓
Business rule allows action?
 ↓
Perform action
```

---

# 98. No Frontend-Only Authorization

Never rely on:

```text
hidden buttons
disabled buttons
frontend route guards
local role checks
client-side permissions
```

as the only security mechanism.

They are UX controls only.

---

# 99. API Endpoint Security

Every endpoint in `API_SPEC.md` must specify:

* Authentication requirement
* Required role
* Required permission
* Resource ownership/tenant rules
* Rate limits where appropriate
* Sensitive-operation requirements

---

# 100. Authorization Matrix

The implementation must maintain a centralized permission matrix.

Example:

| Capability                   | Customer | Restaurant Owner | Restaurant Operator | Rider |      Admin | Super Admin |
| ---------------------------- | -------: | ---------------: | ------------------: | ----: | ---------: | ----------: |
| Manage own profile           |        ✓ |                ✓ |                   ✓ |     ✓ |          ✓ |           ✓ |
| Customer orders              |        ✓ |                — |                   — |     — | Authorized |  Authorized |
| Restaurant operations        |        — |                ✓ |                   ✓ |     — | Authorized |           ✓ |
| Restaurant sensitive finance |        — |                ✓ |          Restricted |     — | Authorized |           ✓ |
| Rider delivery               |        — |                — |                   — |     ✓ | Authorized |           ✓ |
| User management              |        — |                — |                   — |     — | Permission |           ✓ |
| Restaurant approval          |        — |                — |                   — |     — | Permission |           ✓ |
| Rider approval               |        — |                — |                   — |     — | Permission |           ✓ |
| Refunds                      |        — |       Restricted |                   — |     — | Permission |           ✓ |
| Risk management              |        — |                — |                   — |     — | Permission |           ✓ |
| System configuration         |        — |                — |                   — |     — | Restricted |           ✓ |
| Audit logs                   |        — |                — |                   — |     — | Permission |           ✓ |

The detailed permission registry is authoritative over this high-level table.

---

# 101. Permission Naming

Permissions should use predictable naming.

Recommended:

```text
resource.action
```

Examples:

```text
orders.read
orders.create
orders.cancel
orders.accept
orders.update_status

restaurants.read
restaurants.update
restaurants.approve
restaurants.suspend

riders.read
riders.assign
riders.approve
riders.suspend

payments.read
payments.refund

risk.read
risk.manage

audit.read
settings.manage
```

---

# 102. Permission Checks

Permission checks should be reusable.

Avoid copying authorization logic into every controller.

Use centralized authorization utilities/domain services while keeping resource/business checks close to the relevant module.

---

# 103. Authorization Caching

Authorization may be cached for performance, but security-sensitive permission changes must propagate quickly.

Never allow stale authorization to persist longer than the approved security window.

---

# 104. Rate Limiting Categories

Rate limits should be separately configurable for:

```text
authentication
verification
password reset
public API
authenticated API
admin API
file upload
support
search
checkout
order creation
payment operations
```

The exact limits are configuration values, not arbitrary constants scattered throughout code.

---

# 105. Security Configuration

Security settings should be centrally managed.

Examples:

```text
ACCESS_TOKEN_TTL
REFRESH_TOKEN_TTL
OTP_TTL
OTP_MAX_ATTEMPTS
PASSWORD_RESET_TTL
LOGIN_RATE_LIMIT
OTP_RATE_LIMIT
SESSION_MAX_LIFETIME
MFA_RECENT_AUTH_WINDOW
```

Sensitive security settings should not be editable by ordinary users.

---

# 106. Environment Separation

Authentication configuration must be separated by:

```text
Development
Staging
Production
```

Production credentials must never be committed to Git.

---

# 107. Logging Rules

Never log:

```text
password
password_hash
OTP
refresh_token
reset_token
MFA_secret
payment_secret
JWT signing secret
```

Log safe identifiers instead.

---

# 108. Monitoring

Monitor:

* Login failures
* Successful logins
* Password resets
* OTP abuse
* MFA failures
* Refresh-token reuse
* Session revocations
* Admin authentication
* Permission failures
* Suspicious authentication spikes

---

# 109. Alerting

Security alerts may be generated for:

* Large login-failure spikes
* Refresh-token reuse
* Repeated admin authentication failures
* Unusual privileged actions
* Unexpected permission changes
* Repeated MFA failures
* Authentication infrastructure failures

---

# 110. Incident Response

If authentication compromise is suspected, administrators should be able to:

* Revoke sessions
* Disable an account
* Force password reset
* Require MFA
* Revoke refresh-token families
* Review audit/security events

Emergency actions must be audited.

---

# 111. Testing Requirements

Authentication testing must include:

### Registration

* Valid registration
* Duplicate email
* Duplicate phone
* Invalid password
* Verification flow
* Rate limits

### Login

* Valid credentials
* Invalid password
* Unknown account
* Suspended account
* Disabled account
* Rate limiting
* MFA

### Refresh

* Valid refresh
* Expired refresh
* Revoked refresh
* Rotated refresh reuse
* Concurrent refresh requests

### Password Reset

* Valid reset
* Expired token
* Reused token
* Invalid token
* Enumeration protection
* Session revocation

### OTP

* Valid OTP
* Expired OTP
* Incorrect OTP
* Too many attempts
* Rate limiting
* Reuse

### Authorization

* Correct role
* Incorrect role
* Missing permission
* Wrong tenant
* Wrong resource owner
* Admin permission boundaries
* Operator restrictions

---

# 112. Security Testing

The application must test for:

* Broken access control
* IDOR
* Privilege escalation
* Session fixation
* Session hijacking
* Refresh-token reuse
* CSRF
* CORS misconfiguration
* Brute force
* Credential stuffing
* OTP abuse
* Password reset abuse
* JWT validation flaws
* Sensitive data exposure
* Authorization bypass

---

# 113. E2E Authentication Scenarios

At minimum test:

```text
Customer registration
→ phone verification
→ login
→ create session
→ access customer resources
→ logout
```

```text
Restaurant owner registration
→ verification
→ restaurant onboarding
→ owner access
→ operator invitation/access
→ operator permission boundary
```

```text
Rider registration
→ verification
→ approval
→ login
→ delivery access
```

```text
Admin login
→ MFA
→ admin dashboard
→ privileged action
→ audit log
```

---

# 114. Failure Handling

Authentication failures must fail securely.

Examples:

* Redis unavailable
* Database unavailable
* SMS provider unavailable
* Email provider unavailable
* Token signing failure
* Session-store failure

The system must not bypass authentication because a security dependency is temporarily unavailable.

---

# 115. Fail Closed

For authorization and security-sensitive decisions:

```text
unknown
≠ allowed
```

If authorization cannot be verified, deny the protected action.

---

# 116. Database Integrity

Identity relationships must use foreign keys.

Examples:

```text
user_roles.user_id → users.id
customer_profiles.user_id → users.id
restaurant_staff.user_id → users.id
rider_profiles.user_id → users.id
```

---

# 117. Unique Identity Constraints

The database must enforce uniqueness for:

* Email where applicable
* Phone where applicable
* Role/membership relationships as defined

Application-level uniqueness checks are not sufficient by themselves.

---

# 118. Race Conditions

Registration must handle concurrent requests safely.

Example:

Two requests attempt to register the same email simultaneously.

The database unique constraint must prevent duplicate identities.

The API should return a stable conflict response.

---

# 119. Account Linking

V1 should avoid automatic linking of multiple identities unless explicitly verified.

For example, a phone number and email must not automatically be merged into an existing account without an authenticated, verified flow.

---

# 120. Role Assignment

Role assignment must be controlled.

Customers cannot assign themselves:

```text
ADMIN
SUPER_ADMIN
RESTAURANT_OWNER
RESTAURANT_OPERATOR
RIDER
```

through client-provided registration data.

Privileged roles require trusted backend workflows.

---

# 121. Restaurant Owner Creation

Restaurant ownership must be established through the approved restaurant onboarding process.

A user cannot simply submit:

```text
role = RESTAURANT_OWNER
```

and gain ownership of an arbitrary restaurant.

---

# 122. Rider Approval

Rider access to delivery operations requires the appropriate rider approval state.

Authentication alone does not make a user eligible for dispatch.

---

# 123. Admin Creation

Admin accounts must only be created through a privileged administrative workflow.

Public registration must never create ADMIN or SUPER_ADMIN users.

---

# 124. Account Recovery Security

Recovery methods must be based on verified ownership.

Never allow:

```text
name
order number
public profile information
```

alone to recover an account.

---

# 125. Verification Changes

Changing a verified email or phone number should require re-verification.

The previous verified identity should not simply be replaced without an appropriate security workflow.

---

# 126. Sensitive Account Changes

The following should require recent authentication and/or step-up verification:

* Email change
* Phone change
* Password change
* MFA changes
* Payout account changes
* Ownership changes
* High-risk security settings

---

# 127. Reauthentication

When reauthentication is required, the backend must verify current credentials or an approved MFA mechanism.

A stale access token alone is not sufficient for high-risk operations.

---

# 128. Security Notifications

Security-sensitive actions should generate notifications where appropriate.

Examples:

* New login
* Password changed
* Email changed
* Phone changed
* MFA enabled/disabled
* Session revoked
* Account recovery completed

---

# 129. Security Notification Integrity

Security notifications are informational.

Receiving a notification does not itself change account state.

The backend remains authoritative.

---

# 130. API Documentation Requirement

Every authentication/authorization endpoint must be documented in:

```text
docs/api/API_SPEC.md
```

The API specification must reference this document for security behavior rather than redefining contradictory rules.

---

# 131. Architecture Requirement

Authentication implementation must remain modular.

Recommended backend modules:

```text
Auth
Identity
Sessions
Verification
Authorization
Security
```

These modules may share infrastructure but should not duplicate security logic across product applications.

---

# 132. Frontend Requirement

Each application may implement its own authentication UI, but security behavior must come from the backend.

Apps:

```text
apps/customer
apps/restaurant
apps/rider
apps/admin
```

must use the shared API authentication contract.

---

# 133. Shared Authentication Client

Where practical, authentication API handling should be shared through:

```text
packages/api-client
packages/types
packages/validation
```

Frontend applications should not independently invent token formats or authorization rules.

---

# 134. Documentation Authority

The authority hierarchy for authentication is:

```text
PRD
↓
ARCHITECTURE
↓
DATABASE
↓
API_SPEC
↓
AUTH_AUTHORIZATION.md
↓
Implementation
```

If a contradiction exists, it must be resolved before implementation.

---

# 135. Claude Code Implementation Rules

Claude Code must:

1. Read all authoritative QuickBite documentation before modifying authentication.
2. Never invent authentication behavior.
3. Never invent roles.
4. Never invent permissions.
5. Never bypass backend authorization.
6. Never store plaintext passwords.
7. Never expose secrets in logs.
8. Never create admin accounts through public registration.
9. Never trust client-provided roles.
10. Never trust client-provided permissions.
11. Never trust client-provided ownership.
12. Never bypass tenant isolation.
13. Never silently change token/session strategy.
14. Never silently weaken MFA requirements.
15. Never silently change security configuration.
16. Stop and request an approved specification change if documents conflict.

---

# 136. Definition of Done

Authentication and authorization are complete only when:

* Registration implemented
* Login implemented
* Logout implemented
* Session management implemented
* Access tokens implemented
* Refresh tokens implemented
* Refresh-token rotation implemented
* Reuse detection implemented
* Password hashing implemented
* Password reset implemented
* Email verification implemented
* Phone verification implemented
* OTP protection implemented
* Rate limiting implemented
* RBAC implemented
* Permission system implemented
* Resource ownership checks implemented
* Restaurant tenant isolation implemented
* Rider isolation implemented
* Admin authorization implemented
* Super Admin controls implemented
* MFA implemented for privileged accounts
* Step-up authentication implemented where required
* Session revocation implemented
* Security event logging implemented
* Audit integration implemented
* Security monitoring implemented
* Unit tests implemented
* Integration tests implemented
* E2E tests implemented
* Security tests implemented
* API documentation synchronized
* Database migrations implemented
* Production secrets secured
* Documentation synchronized

---

# 137. Phase 6 Completion Criteria

Phase 6 is complete when the repository contains:

```text
docs/security/AUTH_AUTHORIZATION.md
```

and the document is consistent with:

```text
docs/product/PRD.md
docs/architecture/ARCHITECTURE.md
docs/database/DATABASE.md
docs/api/API_SPEC.md
docs/business-rules/ORDER_RULES.md
docs/business-rules/CANCELLATION_RULES.md
docs/business-rules/DISPATCH_RULES.md
docs/business-rules/RISK_RULES.md
```

No implementation should knowingly contradict this specification.

---

**End of AUTH_AUTHORIZATION.md**
