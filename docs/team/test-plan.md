# Test Plan

## Scope

The team scope is the Exhibits catalogue, with two linked workflows: create an exhibit and validate/publish it. The API, shared Zod contracts, PostgreSQL state, browser UI, RBAC, accessibility, and state-change recovery are in scope. Marketing, eBay, Wikidata, and social integrations are excluded.

## Risk-based approach

High-risk: lifecycle state corruption, unauthorized changes, invalid boundaries, persistence loss. Use unit, state-transition, API, browser, and recovery tests.

Medium-risk: browser usability, duplicate reads/writes, slow response. Use E2E, axe/Lighthouse, EP/BVA, and k6.

Low-risk: text localization and presentation. Use smoke and Lighthouse checks.

## Environment

Docker PostgreSQL 16, NestJS API on port 3000, Vite web app on port 5173, synthetic seed accounts and records. Reset with `docker compose down -v`, `docker compose up -d postgres`, migrate, and seed.

## Entry criteria

- Database migrations and seed complete.
- API health endpoint returns `{"status":"ok","service":"museumos-api"}`.
- Test account can authenticate.

## Exit criteria

1. 100% statement and branch coverage of the critical exhibit-workflow module.
2. All high-risk API cases pass and no unexpected 5xx response occurs in 100 smoke requests.
3. `p95 <= 500 ms` and unexpected failure rate `< 1%` for the selected exhibit read workload.
4. No critical accessibility violation on key workflow screens.
5. Recovery restores the same single exhibit record after one failed write and one retry.

## Roles and ownership

- Member 1: static analysis, cyclomatic complexity, mutation, CI.
- Member 2: API testing and OpenAPI test generation.
- Member 3: browser use cases, accessibility, security, performance, and recovery.

## Schedule

Week 1 baseline and scope. Week 2 unit/API automation. Week 3 browser/accessibility/security. Week 4 performance, mutation, CI, report, viva rehearsal.

## Suspension/resumption

Suspend when database/API startup fails, migration is inconsistent, or evidence is not reproducible. Resume after reset and a passing health check.
