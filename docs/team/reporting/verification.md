# Verification Log

## Run 1 — Historic Local Full-Stack Captures (2026-11-22)

**Baseline:** `0ef7004ebef1c59130101fa0a56c95a50ca31900`

| Command / check | Result | Evidence |
| --- | --- | --- |
| `pnpm test:api` (initial pre-dedup 34 cases) | PASS: 34 outcomes against live PostgreSQL/API | Historic API snapshot |
| `pnpm test:e2e --reporter=line` (initial 3 tests) | PASS: 3/3 W1, W2, viewer/curator checks | Baseline Playwright/RBAC run |
| `axe-core` & Lighthouse (`/exhibits` before -> after UI fixes) | PASS: 0 axe violations; Lighthouse a11y `0.88 -> 1.00` | `docs/team/evidence/accessibility/axe-*.json` |
| Grafana `k6` authenticated GET (1 VU & 5 VUs × 2, 60s each) | PASS: p95 `16.40–28.16 ms`; 0.00% HTTP errors | `docs/team/evidence/performance/k6-*.json` |
| SonarQube 9.9.8 initial baseline (`0ef7004`) | `alert_status: ERROR` (3 bugs, 0 vuln, 3 open hotspots, 177 smells) | `docs/team/evidence/static-analysis/sonar-baseline.json` |
| `pnpm audit --prod` | 26 advisories (1 critical, 14 high, 8 moderate, 3 low) | `docs/team/evidence/security/dependency-audit.json` |

---

## Run 2 — Mid-Project CI & Feature Verification (2026-11-24)

- GitHub Actions `main` run `45264536403` PASS (2m 39s), Blocked PR `#4` (`45265194998`, `mergeStateStatus: BLOCKED`), Issues `#1`–`#3` closed, and Documented Fix PR `#5` (`45265228384` failed before fix, merged `e80d194` after fix).

---

## Run 3 — Comprehensive Audit Remediation & Live Rerun (2026-11-26 – 2026-11-27)

**Target:** Remediated working tree prior to / under PR `#6` (`fix/sqe-audit-remediation`). Every evidence file below comes directly from genuine live command execution without backdating or manual JSON edits.

| Command / check | Result | Observed Details & Evidence Path |
| --- | --- | --- |
| `pnpm lint` & `pnpm build` | **PASS** | `0` ESLint errors (`1` pre-existing warning in `wikidata-enrich.tsx`); all `7` workspace packages compiled cleanly (exit `0`). |
| `pnpm --filter @museumos/api exec vitest run test/team --coverage` | **PASS (`46/46`)** | `exhibit-workflow.ts` (`39/39` stmts, `30/30` branches, `5/5` funcs) & `permission.guard.ts` (`24/24` stmts, `11/11` branches, `2/2` funcs) both **100.00%** across all 4 metrics. |
| `pnpm test:coverage:all` | **PASS (`46/46`, `100%` branch gate)** | `--coverage.thresholds.branches=100` enforced across all 4 business-logic files (`53.86%` stmts, `100.00%` branches, `45.83%` funcs; `docs/team/evidence/coverage/coverage-all-business-logic.json` + `lifecycle-workflow.lcov`). |
| `pnpm test:mutation:custom` | **PASS (`4/4 KILLED`, `100.00%`)** | Live source mutation on `exhibit-workflow.ts` evaluated against real Vitest suite (`exhibit-workflow.test.ts` + `exhibit-contracts.test.ts`); `docs/team/evidence/mutation/custom-mutators.json`. |
| `pnpm test:mutation` (StrykerJS 10.1.1) | **PASS (`98.97%`)** | Widened to 3 files (`exhibit-workflow.ts`, `permission.guard.ts`, `exhibits.controller.ts:183-310`): `190` Killed + `2` Timeout (`192/194`), `2` equivalent survivors (`exhibit-workflow.ts:50-51`), `0` NoCov; `docs/team/evidence/mutation/mutation-final.json`. |
| `pnpm test:data:constraints` | **PASS (`4` constraint shifts)** | Mutated `year` range (`1800..2100 -> 1810..2090`), `exhibitName.maxLength` (`500 -> 120`), `collectiblePrice.type` (`number -> integer`), `sortOrder.enum` (`['asc','desc'] -> ['asc','desc','relevance']`); `docs/team/evidence/api/constraint-change/change-summary.json`. |
| `pnpm test:api` (live `museumos_sqe_test`) | **PASS (`93/93` HTTP outcomes)** | Run `SQE-1795721698365` (`2026-11-26T19:35:14Z`): 9-row `endpoint x method x status x parameter` coverage matrix; read-back verified after every `POST`/`PATCH` rejection; `docs/team/evidence/api/api-run.json`. |
| `pnpm test:recovery:db` & `pnpm test:recovery:outage` | **PASS (both modes)** | (1) `P2003` FK injection preserved `year=1980, recordsWithId=1` then updated `year=2024` (`db-recovery-run.json`). (2) Real `docker stop museumos-db` -> `PATCH` `500` -> `docker start` -> `2` reconnect attempts (`year=1980, 1` row) -> retry `[2024, 2024]` -> `year=2024, 1` row (`db-outage-recovery-run.json`). |
| `pnpm test:e2e --workers=1` (Chromium 1248) | **PASS (`30/30` discrete specs)** | 1 flow per test across `UC-01`..`UC-06`; UI assertions on `UC-03`/`UC-04`; `11/11` RBAC checks with read-back after every `401`/`403` (`access-checks.json`); cookie check (`cookie-security-check.json`); `0` axe violations on Create/Detail/Publish (`45/32/34` passes); `docs/team/evidence/e2e/playwright-report.html`. |
| `node scripts/team/run-lighthouse-audit.mjs` | **PASS (3 screens)** | Catalogue `/exhibits`, Create modal `/exhibits?new=1`, Detail `/exhibits/:id` all scored **1.00 A11y / 1.00 BP / 0.82 SEO** (`lighthouse-multi-screen.json`). |
| `scripts/team/run-zap-passive.ps1` (`zaproxy:stable`) | **PASS (prod preview + API)** | Proxied compiled `vite preview` (`:4173`, 30 E2E tests) + direct NestJS API (`:3000/api`); `104` instances (`0 High`, `3` Medium header/SRI on preview, `1` Low `nosniff`, `3` Info rules; API `:3000` returned `0` Medium/Low header alerts); `zap-passive-report.{html,json}`. |
| Ephemeral Docker SonarQube 9.9.8 overall-code gate (`sqe-sonar-final`) | **PASS (`status: OK`, `ignoredConditions: false`)** | Overall quality gate `MuseumOS-SQE-Overall` with LCOV (`2026-11-26T23:09:15Z`): `0` bugs, `0` vuln, `178` smells, `1,203 min` debt, `A/A/A` ratings, `2.2%` dup, `3` hotspots Safe (`100%`), `exhibit-workflow.ts` `100%` line/branch & `complexity=22`, repo `coverage=9.6%` (`branch_coverage=100%`); `sonar-final*.json`. |
| GitHub Branch Protection & Mandatory CI (`quality.yml`) | **PASS locally; PR `#6` CI pending push** | Captured live GitHub API ruleset (`docs/team/evidence/ci/branch-protection.json`: `strict: true`, `contexts: ["quality"]`, `enforce_admins: true`); replaced optional `vars.SONAR_ENABLED` gate with mandatory `scripts/team/ci-sonar-gate.sh` + downstream `release-check` job. |
