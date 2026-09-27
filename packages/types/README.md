# @quickbite/types

Shared, dependency-free vocabulary used by every QuickBite application:

- frozen roles (`CLAUDE.md` §5)
- order, payment, promotion and review state names
- API envelope types, standard headers and error codes (`docs/api/API_SPEC.md` §8–15)

This package contains **names and shapes only**. It must never contain business
rules (state transitions, eligibility, pricing). The backend remains authoritative.
