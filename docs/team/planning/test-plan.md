# Test Plan

## Scope

The team scope is the Exhibits catalogue, with two linked workflows: create an exhibit and validate/publish it. The API, shared Zod contracts, PostgreSQL state, browser UI, RBAC, accessibility, and state-change recovery are in scope. Marketing, eBay, Wikidata, and social integrations are excluded.

## Risk-based approach

High-risk: lifecycle state corruption, unauthorized changes, invalid boundaries, persistence loss. Use unit, state-transition, API, browser, and recovery tests.

Medium-risk: browser usability, duplicate reads/writes, slow response. Use E2E, axe/Lighthouse, EP/BVA, and k6.

Low-risk: text localization and presentation. Use smoke and Lighthouse checks.

## Environment

Docker PostgreSQL 16, NestJS API on port 3000, Vite web app on port 5173, synthetic seed accounts and records. Reproducible setup (preserves the existing PostgreSQL volume): `docker compose up -d postgres`, `pnpm db:generate`, `pnpm --filter @museumos/db migrate:deploy`, `pnpm db:seed`. Do not use `docker compose down -v` against the team's working volume.

## Test data reset and cleanup

The API integration runner creates synthetic records and soft-deletes its own fixtures. For a complete reset, use only a dedicated database named `museumos_sqe_test`, never the team's `museumos` database. Set `DATABASE_URL` to that isolated database, then run `pnpm test:reset:db`. The PowerShell script checks the parsed database name before invoking Prisma reset and seed, and refuses any other database. Start a disposable PostgreSQL instance separately; the repository compose file hard-codes container names and cannot be duplicated safely under another compose project name. Do not run a reset against data containing team work.

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

## Three-point estimates and actuals

Planning estimates are person-hours; PERT expected time is `(O + 4M + P) / 6`. Member totals reported: **Burhan Ahmed: 7.0 h**, **Syed Ali Akbar Naqvi: 13.0 h**, **Huzaifa Ali: 9.0 h** (**Team Total: 29.0 h** vs. **31.2 h** PERT, variance **-2.2 h / -7.1%**).

| Work package | Owner | Optimistic | Most likely | Pessimistic | PERT | Actual | Variance |
|---|---|---:|---:|---:|---:|---:|---:|
| Scope, requirements, risk, traceability | Burhan | 2 | 3 | 5 | 3.2 | 2.5 | -0.7 h |
| Complexity, white-box, MC/DC, mutation, CI | Burhan | 4 | 6 | 10 | 6.3 | 4.5 | -1.8 h |
| API partitions, OpenAPI generator, API runs | Ali | 4 | 6 | 9 | 6.2 | 8.0 | +1.8 h |
| Browser scenarios, accessibility, security | Huzaifa | 5 | 7 | 11 | 7.3 | 7.0 | -0.3 h |
| Performance, recovery, evidence, report, viva | Shared (Ali 5.0 h, Huzaifa 2.0 h) | 5 | 8 | 12 | 8.2 | 7.0 | -1.2 h |
| **Total** | **Team** | **20** | **30** | **47** | **31.2** | **29.0** | **-2.2 h (-7.1%)** |

## Exit evidence and current status (2026-11-24)

| Criterion | Target | Current evidence/status |
|---|---|---|
| Lifecycle unit statement and branch coverage | 100% | Met: 45 passing unit tests across 5 files; `exhibit-workflow.ts` & `permission.guard.ts` 100% all metrics; `exhibits.service.ts` 97.67% branches; `exhibits.controller.ts` 92.00% branches. |
| API generated EP/BVA suite | Every declared input; plus 2-constraint proof | Met: 28 unique EP/3-pt BVA cases, 2-constraint regeneration proof passing, and 62/62 live HTTP API outcomes passing against `museumos_sqe_test` (`api-run.json`). |
| Browser workflows and role decisions | UC-01..UC-06 flows, persisted state, allow/deny | Met: 8/8 Playwright E2E specs pass across UC-01..UC-06 (`playwright-report.html`); 7/7 live RBAC checks pass (`access-checks.json`). |
| axe key screens & Lighthouse | No critical/high findings; Before/After comparison | Met: 0 axe violations on Create, Detail, and Publish; multi-screen Lighthouse scored **1.00 A11y / 1.00 BP / 0.82 SEO** on both `/exhibits` and `/exhibits/:id` (up from 0.88 A11y baseline). |
| Mutation & CI | Gate >=80%; custom mutators; 0 lint | Locally met: Stryker **97.85%** (91/93 killed, 2 equivalent survivors, 0 no-coverage), custom mutators **4/4 (100%)**, `pnpm lint` 0 errors, `pnpm build` exit 0. Hosted GitHub blocked PR + fix PR pending repo push. |
| SonarQube metrics/complexity | Analyze baseline and final | Met: baseline/final scans captured; target module Sonar complexity 22 matches manual 22; Final Sonar Way quality gate OK. |
| k6 & DB recovery | Two 60s runs at 1 VU and 5 VU; real recovery check | Met: 4 × 60s k6 runs p95 `16.40–28.16 ms` (`0%` fail); live Docker PostgreSQL `P2003` recovery test (`db-recovery-run.json`) and browser `UC-06` PASS. |
| OWASP ZAP & dependency audit | Passive scan + dependency triage | Met: OWASP ZAP passive scan (`zaproxy:stable`) proxied 8/8 E2E workflows (`zap-passive-report.{html,json}` — 0 High, 3 Medium headers/SRI, 2 Low, 4 Info); 26 audit advisories triaged. |
| Team commits, actual hours & viva | Actual hours logged + member commits + viva | Actual hours recorded (`29.0 h`: Burhan `7.0 h`, Ali `13.0 h`, Huzaifa `9.0 h`). Authentic member commits, GitHub Issues, PR proofs, and live viva defense pending GitHub repo push. |

## Schedule

Week 1 baseline and scope. Week 2 unit/API automation. Week 3 browser/accessibility/security. Week 4 performance, mutation, CI, report, viva rehearsal.

## Suspension/resumption

Suspend when database/API startup fails, migration is inconsistent, or evidence is not reproducible. Resume after reset and a passing health check.
