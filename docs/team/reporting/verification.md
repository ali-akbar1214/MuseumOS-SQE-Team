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
| `pnpm audit --prod` (before `pnpm.overrides`) | 26 advisories (1 critical, 14 high, 8 moderate, 3 low) | `docs/team/evidence/security/dependency-audit.json` |

---

## Run 2 — Mid-Project CI & Feature Verification (2026-11-24)

- GitHub Actions `main` run `45264536403` PASS (2m 39s), Blocked PR `#4` (`45265194998`, `mergeStateStatus: BLOCKED`), Issues `#1`–`#3` closed, and Documented Fix PR `#5` (`45265228384` failed before fix, merged `e80d194` after fix).

---

## Run 3 — Comprehensive Audit Remediation, PR `#6` & Post-Override Verification (2026-11-26 – 2026-11-27)

**Target:** Final remediated repository (`PR #6` merged at `acf476c` + final dependency override & Istanbul coverage pass). Every evidence file below comes directly from genuine live command execution without backdating or manual JSON edits.

| Command / check | Result | Observed Details & Evidence Path |
| --- | --- | --- |
| `pnpm lint` & `pnpm build` | **PASS** | `0` ESLint errors (`1` pre-existing warning in `wikidata-enrich.tsx`); all `7` workspace packages compiled cleanly (exit `0`). |
| `pnpm --filter @museumos/api exec vitest run test/team --coverage` (v8) & `pnpm test:coverage:all` | **PASS (`46/46`)** | `exhibit-workflow.ts` & `permission.guard.ts` **100.00%** across all 4 metrics; `test:coverage:all` (`coverage-all-business-logic.json` + `lifecycle-workflow.lcov`) passes `--coverage.thresholds.branches=100`. |
| `vitest run test/team --coverage --coverage.provider=istanbul` (`@vitest/coverage-istanbul@3.2.4`) | **PASS (`46/46`)** | **W1/W2 In-Scope Methods (`24/24` funcs):** **100.00% statements (`160/160`), 100.00% branches (`152/152`), 100.00% lines (`133/133`)**. **Whole-File Istanbul (incl. 47 uncalled out-of-scope functions):** `exhibit-workflow.ts` `100%`, `permission.guard.ts` `100%`, `exhibits.controller.ts` `37.03%` stmts / `41.50%` branches (`44/106`), `exhibits.service.ts` `36.66%` stmts / `46.05%` branches (`70/152`), Combined 4-file total: `42.55%` stmts / **`51.35%` branches (`152/296`)**; `docs/team/evidence/coverage/coverage-istanbul-all-business-logic.json`. |
| `pnpm test:mutation:custom` | **PASS (`4/4 KILLED`, `100.00%`)** | Live source mutation on `exhibit-workflow.ts` evaluated against real Vitest suite (`exhibit-workflow.test.ts` + `exhibit-contracts.test.ts`); `docs/team/evidence/mutation/custom-mutators.json`. |
| `pnpm test:mutation` (StrykerJS 10.1.1) | **PASS (`98.97%`)** | Widened to 3 files (`exhibit-workflow.ts`, `permission.guard.ts`, `exhibits.controller.ts:183-310`): `190` Killed + `2` Timeout (`192/194`), `2` equivalent survivors (`exhibit-workflow.ts:50-51`), `0` NoCov; `docs/team/evidence/mutation/mutation-final.json`. |
| `pnpm test:data:constraints` | **PASS (`4` constraint shifts)** | Mutated `year` range (`1800..2100 -> 1810..2090`), `exhibitName.maxLength` (`500 -> 120`), `collectiblePrice.type` (`number -> integer`), `sortOrder.enum` (`['asc','desc'] -> ['asc','desc','relevance']`); `docs/team/evidence/api/constraint-change/change-summary.json`. |
| `pnpm test:api` (live `museumos_sqe_test`) | **PASS (`93/93` HTTP outcomes)** | Run `SQE-1795721698365` (`2026-11-26T19:35:14Z`): 9-row `endpoint x method x status x parameter` coverage matrix; read-back verified after every `POST`/`PATCH` rejection; `docs/team/evidence/api/api-run.json`. |
| `pnpm test:recovery:db` & `pnpm test:recovery:outage` | **PASS (both modes)** | (1) `P2003` FK injection preserved `year=1980, recordsWithId=1` then updated `year=2024` (`db-recovery-run.json`). (2) Real `docker stop museumos-db` -> `PATCH` `500` -> `docker start` -> `2` reconnect attempts (`year=1980, 1` row) -> retry `[2024, 2024]` -> `year=2024, 1` row (`db-outage-recovery-run.json`). |
| `pnpm test:e2e --workers=1` (Chromium 1248) | **PASS (`30/30` discrete specs)** | 1 flow per test across `UC-01`..`UC-06`; UI assertions on `UC-03`/`UC-04`; `11/11` RBAC checks with read-back after every `401`/`403` (`access-checks.json`); cookie check (`cookie-security-check.json`); `0` axe violations on Create/Detail/Publish (`45/32/34` passes); `docs/team/evidence/e2e/playwright-report.html`. |
| `node scripts/team/run-lighthouse-audit.mjs` | **PASS (3 screens)** | Catalogue `/exhibits`, Create modal `/exhibits?new=1`, Detail `/exhibits/:id` all scored **1.00 A11y / 1.00 BP / 0.82 SEO** (`lighthouse-multi-screen.json`; SEO `0.82` explained by intentional internal-SPA omission of public `meta-description` and `robots-txt`). |
| `scripts/team/run-zap-passive.ps1` (`zaproxy:stable`) | **PASS (prod preview + API)** | Proxied compiled `vite preview` (`:4173`, 30 E2E tests) + direct NestJS API (`:3000/api`); `104` instances (`0 High`, `3` Medium header/SRI on preview, `1` Low `nosniff`, `3` Info rules; API `:3000` returned `0` Medium/Low header alerts); `zap-passive-report.{html,json}`. |
| `pnpm audit --prod` after `pnpm.overrides` | **PASS (`26 -> 7` advisories, `0` Critical)** | Pinned `proxy-addr@2.0.8`, `body-parser@2.4.0`, `qs@6.17.1`, `multer@2.5.0`, `react-router@7.18.7`, `source-map-js@1.2.4`; eliminated `19/26` advisories (`1 -> 0` Critical, `14 -> 6` High, `8 -> 1` Mod, `3 -> 0` Low); `docs/team/evidence/security/dependency-audit-after.json`. |
| Local & CI Run #15 (`45911609511`) Docker SonarQube 9.9.8 overall-code gate | **PASS (`status: OK`, `ignoredConditions: false`)** | CI Run #15 caught 6 upstream `typescript:S6439` JSX bugs (fixed in `465760f`), then passed with `0` bugs, `0` vuln, `196` CI / `178` local smells, `A/A/A` ratings, `2.2%` dup, `3` hotspots reviewed Safe with per-hotspot rationales (`100%`), `branch_coverage >= 80%` & `coverage >= 9%` gated; `sonar-ci-run15.json` & `sonar-final*.json`. |
| GitHub Branch Protection & Mandatory CI (`quality.yml`) | **PASS (`RELEASE`)** | `docs/team/evidence/ci/branch-protection.json` (`strict: true`, `contexts: ["quality"]`, `enforce_admins: true`); PR `#6` run #15 (`45911609511`) passed both `quality` (`5m45s`) and `release-check` (`8s`). |
