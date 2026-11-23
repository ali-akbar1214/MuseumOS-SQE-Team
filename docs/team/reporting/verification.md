# Verification Log

## Run 1 — Historic Local Full-Stack Captures (2026-11-22)

**Baseline:** `0ef7004ebef1c59130101fa0a56c95a50ca31900`

| Command / check | Result | Evidence |
| --- | --- | --- |
| `pnpm test:api` (pre-dedup 34 cases) | PASS: 34 outcomes against live PostgreSQL/API | Historic `evidence/api-run.json` |
| `pnpm test:e2e --reporter=line` (initial 3 tests) | PASS: 3/3 W1, W2, viewer/curator checks | `evidence/access-checks.json` |
| axe-core & Lighthouse (exhibits list) | PASS: 0 axe violations; Lighthouse a11y `0.88 -> 1.00` | `evidence/axe-*.json`, `evidence/lighthouse-*.json` |
| k6 authenticated GET (1 VU & 5 VUs × 2, 60s each) | PASS: p95 `16.40–28.16 ms`; 0% HTTP errors | `evidence/k6-*.json` |
| SonarQube 9.9.8 baseline & final | PASS: Quality Gate OK; lifecycle complexity = 22 (manual = 22); 0 bugs, 0 vulnerabilities, 183 smells, 1,271 min debt, 3 Safe hotspots | `evidence/sonar-*.json` |
| `pnpm audit --prod` | 26 advisories (1 critical, 14 high, 8 moderate, 3 low) | `evidence/dependency-audit.json`, `dependency-triage.md` |

---

## Run 2 — Current Local Verification (2026-11-24)

**Target:** Local working tree with expanded unit suite, full 6-UC Playwright suite, 2-constraint generator, fixed workspace ESLint/TS build, and regenerated charts/PDF.

| Command / check | Result | Evidence / Notes |
| --- | --- | --- |
| `pnpm --filter @museumos/api exec vitest run test/team --coverage` | **PASS (45/45 tests across 5 files)** | `exhibit-workflow.ts` 100% stmts/branches/funcs/lines; `docs/team/evidence/coverage/coverage-summary.json` |
| `pnpm test:coverage:all` | **PASS (45/45 tests)** | `permission.guard.ts` 100% all metrics; `exhibits.controller.ts` 92.00% branches; `exhibits.service.ts` 97.67% branches (`97.24%` scoped branch total); `docs/team/evidence/coverage/coverage-all-business-logic.json` |
| `pnpm test:data:constraints` | **PASS (28 unique EP/BVA values)** | Two constraints modified (`year` 1800..2100 -> 1810..2090; `exhibitName.maxLength` 500 -> 120); `docs/team/evidence/api/constraint-change/change-summary.json` |
| `pnpm test:mutation:custom` | **PASS (4/4 killed, 100.00%)** | `docs/team/evidence/mutation/custom-mutators.json` |
| `pnpm test:mutation` | **PASS (91/93 killed, 97.85%, 2 equivalent survivors, 0 no coverage)** | `reports/mutation/mutation.html` |
| `pnpm lint` | **PASS (0 errors, 1 minor warning)** | Fixed `no-undef` TS config and 69 legacy lint issues across `apps/api`, `apps/web`, `apps/pwa` |
| `pnpm build` | **PASS (exit 0 across all 7 workspace builds)** | Clean `nest build` and `tsc -b && vite build` |
| `pnpm test:api` (live Postgres `museumos_sqe_test`) | **PASS (62/62 HTTP API outcomes)** | Run `SQE-1795464551761`: EP & 3-pt BVA on POST + PATCH with read-back, `401/403/404`, lifecycle rejections, idempotent repeat publish; `docs/team/evidence/api/api-run.json` |
| `pnpm test:recovery:db` (live Postgres `museumos_sqe_test`) | **PASS (`P2003` FK injection)** | Failed write preserved `year=1980` (`1` row); retry updated `year=2024` (`1` row); `docs/team/evidence/api/db-recovery-run.json` |
| `pnpm test:e2e --workers=1` (live Chromium 1248) | **PASS (8/8 tests across 3 spec files)** | All UC-01..UC-06 flows passed; `0` axe-core violations on Create/Detail/Publish (`45/32/34` passes); `7/7` RBAC checks; cookie `httpOnly`/`SameSite=Lax`; HTML report archived at `docs/team/evidence/e2e/playwright-report.html` |
| `node scripts/team/run-lighthouse-audit.mjs` | **PASS (multi-screen authenticated CLI run)** | Exhibits list & detail: Accessibility **1.00**, Best Practices **1.00**, SEO **0.82**; `docs/team/evidence/accessibility/lighthouse-multi-screen.json` |
| `scripts/team/run-zap-passive.ps1` (`zaproxy:stable`) | **PASS (8/8 Playwright tests proxied through ZAP)** | 9 unique alerts / 153 instances (`0 High`, `3 Medium`, `2 Low`, `4 Info`); `docs/team/evidence/security/zap-passive-report.{html,json}` |
| `python -B docs/team/generators/generate-charts.py` | **PASS** | Generated 5 PNG diagrams in `docs/team/evidence/charts/` |
| Public GitHub repo, per-member commits, Issues, Blocked PR + Fix PR | **PENDING TEAM ACTION** | Remote still points to upstream `akolit/MuseumOS.git` (`gh auth` not logged in) |
