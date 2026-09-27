# @quickbite/validation

Shared [Zod](https://zod.dev) schemas.

Scope:

- parsing the standard API envelope and error body (`docs/api/API_SPEC.md` §8–11)
- schemas for frozen vocabulary values returned by the backend
- (per slice) form **input shape** schemas used with React Hook Form

Out of scope — these live only in the backend:

- business rules, eligibility, transitions, pricing, totals, permissions

Client-side validation improves UX. It never replaces server-side validation.
