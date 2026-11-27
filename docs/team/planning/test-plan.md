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

## Exit criteria (Risk-Linked)

1. **EC-1 (Tied to Risk P1 [Score 25] & Risk P2 [Score 20]):** 100% statement, branch, function, and line coverage on `exhibit-workflow.ts` & `permission.guard.ts`, plus **100% branch coverage** gated across all 4 scoped business-logic modules (`exhibit-workflow.ts`, `permission.guard.ts`, `exhibits.controller.ts`, `exhibits.service.ts`).
2. **EC-2 (Tied to Risk P2 [Score 20] & Risk P3 [Score 16]):** OpenAPI-generated cases covering every endpoint × method × status × parameter in scope, post-rejection read-back on every mutating error, and all 11 live RBAC checks pass (`access-checks.json`).
3. **EC-3 (Tied to Risk P7 [Score 12] & Risk P8 [Score 12]):** `p95 <= 500 ms` and `< 1%` HTTP failure rate on authenticated exhibit read workload (`1` and `5` VUs); `0` confirmed critical `axe-core` findings and Lighthouse Accessibility `>= 0.90` across all 3 workflow screens.
4. **EC-4 (Tied to Risk Q1 [Score 20] & Risk P1 [Score 25]):** Mandatory overall-code SonarQube quality gate **OK** (`ignoredConditions: false`), `0` ESLint errors, Stryker mutation score `>= 80%`, `4/4` real-Vitest custom mutators killed, and strict GitHub Actions CI + downstream `release-check` green with branch protection.
5. **EC-5 (Tied to Risk P4 [Score 15] & Risk P6 [Score 15]):** Real PostgreSQL `P2003` and Docker `stop`/`start` outage recovery restore the same single exhibit record cleanly with retry and zero duplicates.

## Roles and ownership

- Member 1: static analysis, cyclomatic complexity, mutation, CI.
- Member 2: API testing and OpenAPI test generation.
- Member 3: browser use cases, accessibility, security, performance, and recovery.

## Three-point estimates and reconstructed actuals

Planning estimates are person-hours; PERT expected time is `(O + 4M + P) / 6`.  
**Actual Hours Reconstruction Method:** No live stopwatch or timesheet tool was used during Weeks 1–3; therefore, replacing earlier rounded estimates, team actuals were reconstructed by combining Nov 24 member-reported package logs with objective git commit windows (`2026-11-21 20:13–20:15`, `2026-11-22` capture timestamps, `2026-11-24 01:50–02:30` `0.67 h` CI fix burst) plus timed `2026-11-26/27` remediation runs (`PR #6` / split Playwright / outage recovery / widened Stryker / SonarQube). Reconstructed totals: **Burhan Ahmed: 7.25 h**, **Syed Ali Akbar Naqvi: 14.75 h**, **Huzaifa Ali: 9.25 h** (**Team Total: 31.25 h** vs. **31.2 h** PERT, variance **+0.05 h / +0.2%**).

| Work package | Owner | Optimistic | Most likely | Pessimistic | PERT | Reconstructed Actual | Variance |
|---|---|---:|---:|---:|---:|---:|---|
| Scope, requirements, risk, traceability | Burhan | 2 | 3 | 5 | 3.2 | 2.25 | -0.95 h |
| Complexity, white-box, MC/DC, mutation, CI | Burhan | 4 | 6 | 10 | 6.3 | 5.00 | -1.30 h |
| API partitions, OpenAPI generator, API matrix runs | Ali | 4 | 6 | 9 | 6.2 | 8.75 | +2.55 h |
| Browser scenarios, accessibility, security (ZAP/RBAC) | Huzaifa | 5 | 7 | 11 | 7.3 | 7.25 | -0.05 h |
| Performance, DB outage recovery, remediation, report | Shared (Ali 6.00 h, Huzaifa 2.00 h) | 5 | 8 | 12 | 8.2 | 8.00 | -0.20 h |
| **Total** | **Team** | **20** | **30** | **47** | **31.2** | **31.25** | **+0.05 h (+0.2%)** |

## Exit evidence and current status (2026-11-27)

| Criterion | Target | Current evidence/status |
|---|---|---|
| Business-logic coverage (`EC-1`) | 100% stmt/branch workflow & guard; 100% branch across all 4 files | **Met:** **46/46** unit tests (`test/team`); `exhibit-workflow.ts` & `permission.guard.ts` **100%** all metrics; `test:coverage:all` **100.00% branches** across all 4 files (`53.86%` stmts; out-of-scope lines individually justified). |
| OpenAPI generator & API matrix (`EC-2`) | Every endpoint × method × status × param; 4-constraint proof; read-back | **Met:** 9-row API matrix covering **93/93** live HTTP outcomes against `museumos_sqe_test` (`api-run.json`), read-back after every `POST`/`PATCH` rejection, and 4-constraint regeneration (range, length, type `number→integer`, enum). |
| Browser workflows & RBAC (`EC-2`, `EC-3`) | 1 flow per test; UI assertions on UC-03/04; read-back after 403 | **Met:** **30/30** discrete 1-flow-per-test Playwright E2E specs pass (`playwright-report.html`); **11/11** RBAC + unauthenticated checks with read-back (`access-checks.json`). |
| Accessibility & multi-screen Lighthouse (`EC-3`) | 0 critical axe; all 3 workflow screens audited; deduplicated findings | **Met:** 0 axe violations on Create (`45`), Detail (`32`), Publish (`34`); Lighthouse on `/exhibits`, `/exhibits?new=1` (Create modal), and `/exhibits/:id` all scored **1.00 A11y / 1.00 BP / 0.82 SEO** (`A11Y-01`..`05` counted once). |
| Mutation & mandatory CI (`EC-4`) | Stryker >=80%; real-Vitest custom mutators; 0 lint; mandatory Sonar CI | **Met:** Widened Stryker **98.97%** (`192/194` killed, 2 equivalent survivors, 0 no-cov across 3 files); custom mutators **4/4 (100%)** vs. real Vitest; `pnpm lint` 0 errors; `pnpm build` exit 0; mandatory `ci-sonar-gate.sh` + downstream `release-check` job in `quality.yml`; branch protection verified (`branch-protection.json`). |
| SonarQube overall-code scan (`EC-4`) | Overall quality gate OK (`ignoredConditions: false`) with LCOV | Verified via fresh ephemeral local Docker SonarQube 9.9.8 overall-code scan + `MuseumOS-SQE-Overall` gate (`sonar-final*.json`) and mandatory CI step. |
| Performance & real DB outage recovery (`EC-3`, `EC-5`) | 4×60s k6 runs (`p95 <= 500ms`); real DB stop/start with retry & 0 dupes | **Met:** k6 p95 `16.40–28.16 ms` (`0%` fail, hardware & `sleep(1)` documented); live `docker stop/start museumos-db` outage recovery (`db-outage-recovery-run.json`: `500` -> `2` reconnect attempts -> retry `[2024, 2024]` -> `1` row) + `P2003` FK recovery (`db-recovery-run.json`) PASS. |
| OWASP ZAP & dependency audit | Prod build + API ZAP scan; package versions listed | **Partial / Hardening Open:** ZAP proxied compiled `vite preview` (`:4173`) + direct API (`:3000`) (`0 High`, 3 Medium header/SRI on preview; API `0` header alerts); 26 advisories triaged with exact `.pnpm` versions (`SEC-001` & `SEC-DEP-01` tracked). |
| Team commits, registration, AI & viva | GitHub-linked commits; prompt archive; registration & viva rehearsal | **Open Items Tracked:** PR `#6` authored under `ali-akbar1214`'s GitHub-linked email; full AI prompt archive (`ai-prompts-archive.md`) & honest Nov 24 disclosure (`ai-use.md`); **A2 Google Sheet registration screenshot/link & team live viva rehearsal remain user-owned before submission**. |

## Schedule (Honest Actual Progression)

Weeks 1–2 (before 2026-11-21): offline team coordination and scope selection without contemporaneous weekly logs (documented honestly in `weekly-report.md`). Week 3 (2026-11-21–22): initial baseline/Sonar/k6/Lighthouse/audit captures. Week 4 (2026-11-24–27): full automation expansion, CI + branch protection (`#4`, `#5`), and comprehensive audit remediation + live reruns (`PR #6`).

## Suspension/resumption

Suspend when database/API startup fails, migration is inconsistent, or evidence is not reproducible. Resume after reset and a passing health check.
