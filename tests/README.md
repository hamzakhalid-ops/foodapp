# Cross-system tests

This directory is reserved for test suites that span **more than one deployable**
(`docs/testing/TESTING_SPEC.md` §3, §50–52):

```text
tests/
├── e2e/          # Golden E2E flow (docs/flows/GOLDEN_E2E_FLOW.md) — added in Slice 12
├── smoke/        # post-deployment smoke tests (DEVOPS_SPEC §35) — added with deployment pipelines
└── performance/  # load scenarios (TESTING_SPEC §47–49) — added when required
```

Suites that belong to a single package live next to that package:

| Suite                                    | Location                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| Backend unit                             | `backend/src/**/*.spec.ts`                           |
| Backend API (Supertest, no services)     | `backend/test/api/`                                  |
| Backend integration (PostgreSQL + Redis) | `backend/test/integration/`                          |
| Shared package unit tests                | `packages/*/src/**/*.test.ts`                        |
| Mobile component tests                   | `apps/{customer,restaurant,rider}/src/**/*.test.tsx` |
| Admin E2E (Playwright)                   | `apps/admin/e2e/`                                    |

Rules: no production data (TESTING_SPEC §71), no fake production behavior, deterministic
test clocks for time-based rules (TESTING_SPEC §69).

No cross-system suite exists yet. This directory is intentionally empty of code until the first
slice that needs it.
