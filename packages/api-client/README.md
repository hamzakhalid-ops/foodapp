# @quickbite/api-client

Typed HTTP transport for `/api/v1`, shared by the Customer, Restaurant, Rider and Admin apps.

Provides:

- `/api/v1` base path, `X-Request-ID` on every request, `Authorization: Bearer` when a token provider is set
- `Idempotency-Key` support for retry-sensitive operations (`docs/api/API_SPEC.md` §15)
- parsing of the standard success/error envelope; failures surface as `ApiError` (with `code` and `requestId`) or `ApiTransportError`

Endpoint functions are **not** defined yet. They are added slice by slice, strictly following
`docs/api/API_SPEC.md`. Do not add endpoints that the API specification does not define.

Apps wrap calls in TanStack Query hooks; this package stays framework-agnostic.
