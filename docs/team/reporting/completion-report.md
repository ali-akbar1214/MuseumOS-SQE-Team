## 1. Executive Summary, Scope, and Release Decision

This report documents the automated testing, static analysis, white-box verification, mutation analysis, OpenAPI specification testing, accessibility remediation, defensive security review, performance benchmarking, failure-recovery testing, and CI enforcement for two core workflows in **MuseumOS** (`SE3002` Fall 2026):

1. **W1 — Catalogue an Exhibit (`FR-01`..`FR-05`):** Authenticated curator creates an exhibit with required category UUID and non-blank name plus optional acquisition year (`1800–2100` or `null`) and collectible price (`>= 0` or `null`); API generates a sequential `displayId`, auto-fills `acquiredAt`, persists to PostgreSQL 16, and supports read-back.
2. **W2 — Validate and Publish an Exhibit (`FR-06`..`FR-08`):** Authenticated administrator reviews the exhibit created in W1, validates it (`validated = true`), and publishes it (`published = true`), enforcing prerequisite validation invariants and a terminal published state.

### Release Decision: CONDITIONAL RELEASE (Functional & CI Gates PASS; Production Hardening Pending)

All W1/W2 functional, white-box, mutation, API, 30-flow browser E2E, accessibility, database recovery, and local overall-code SonarQube gates pass cleanly on isolated PostgreSQL 16 (`museumos_sqe_test`). Rather than claiming an unqualified production release, the release decision is stated candidly as **CONDITIONAL RELEASE**:

- **Accepted for W1/W2 Functional & Course SQE Acceptance:** `46/46` unit tests (`100%` branch coverage gated across all 4 business-logic files), `98.97%` widened Stryker score (`192/194` killed), `4/4` real-Vitest custom mutators killed, `0` ESLint errors / clean `7`-package build, local SonarQube `9.9.8` overall quality gate **OK (`ignoredConditions: false`)**, **`93/93`** live HTTP API outcomes (`9`-row matrix with post-rejection read-backs) + **`4`-constraint regeneration proof**, **`30/30`** discrete 1-flow-per-test Playwright E2E specs, **`11/11`** RBAC + unauthenticated checks with read-back, **3-screen** Lighthouse (`1.00 A11y / 1.00 BP / 0.82 SEO`), and real **`docker stop/start` PostgreSQL outage recovery** (`0` duplicates).
- **Open Hardening & External Items Before Unqualified Production / Final LMS Submission:** (1) **`SEC-001`:** Enforce `SESSION_COOKIE_SECURE=true` behind TLS and deploy reverse-proxy CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and self-hosted fonts (`vite preview` currently exposes `3` Medium / `1` Low header alerts); (2) **`SEC-DEP-01`:** Apply `pnpm.overrides` for reachable runtime advisories (`proxy-addr >= 2.0.8` Critical `1241210`, `body-parser >= 2.4.0` High `1243074`, `qs >= 6.16.1`) and re-run `pnpm audit --prod`; (3) **Course Google Sheet Registration Proof (Item 8 / A2):** Team member A2 must insert the Google Sheet registration link or screenshot here before final LMS submission if required; (4) **Live Team Viva Rehearsal (Risk `Q2`):** Team members must rehearse live assertions, rules, and cyclomatic complexity walkthroughs before defense.

### Tested vs. Not Tested & Process Deviations

| Dimension | Covered & Verified Live | Explicitly Excluded / Not Tested or Deviated |
|---|---|---|
| **Application Features** | W1 Create (`POST /exhibits`), W2 Validate/Publish (`PATCH /exhibits/:id`), RBAC guards, Auth (`/auth/login`, `/auth/me`), Categories, Exhibit search/filter (`UC-04`), health check | Excluded by `scope.md`: `export`/CSV, `bulkUpdate`, `stats`, `setTags`, `findSimilar` (`pg_trgm`), multipart image upload/rotate/thumbnails (`multer`/`sharp`), eBay, Wikidata, and social OAuth |
| **Security & Transport** | RBAC allow/deny (`11/11`), `httpOnly`/`SameSite=Lax` cookie inspection, compiled `vite preview` (`:4173`) + direct API (`:3000`) OWASP ZAP passive scan, `26`-advisory dependency triage | Active fuzzing (`zap-full-scan`), live TLS/HSTS certificates, nginx/Caddy production proxy headers, and post-override clean `pnpm audit --prod` rerun |
| **Performance & Resilience** | Single-host Docker 1-VU & 5-VU (`1.04–4.99 req/s`) 60s `k6` reads, PostgreSQL `P2003` FK injection, real `docker stop/start museumos-db` outage recovery | Production horizontal scaling, connection-pool storm testing (`>50–100+` VUs), and multi-AZ Postgres failover |
| **Process & Log Deviations** | All `2026-11-26/27` reruns are genuine live captures (`never edited JSON`); `ai-prompts-archive.md` preserves verbatim session prompts | **Weeks 1–2** lacked contemporaneous weekly logs; **Nov 24 `01:50` commits** pushed bulk changes from one workstation using `@sqe.local` placeholder emails (except Ali); **PR `#5`** bundled CI/throttler adjustments with its boundary fix (PR `#6` resolves remediation cleanly via Ali's GitHub-linked email). |

---

## 2. Requirements, Business Rules, Roles, and Environment

| ID | Workflow | Requirement |
|---|---|---|
| `FR-01` | W1 | An exhibit name is required (`minLength: 1`) and may contain at most 500 characters |
| `FR-02` | W1 | A valid category UUID is required (`categoryId`) |
| `FR-03` | W1 | Acquisition `year` is `null` or an integer from `1800` through `2100` inclusive |
| `FR-04` | W1 | `collectiblePrice` is `null` or a finite non-negative number (`>= 0`) |
| `FR-05` | W1 | Creation auto-fills `acquiredAt`, generates `displayId`, and supports `GET /api/exhibits/:id` read-back |
| `FR-06` | W2 | Only validated exhibits (`validated = true`) may be published |
| `FR-07` | W2 | Publishing requires `validated = true` AND non-blank `exhibitName` AND non-null `categoryId` |
| `FR-08` | W2 | A published exhibit is terminal and cannot move back to `draft` or `validated` |

- **Business Rules & Roles:** Year `null || (int && 1800..2100)`; Price `null || (finite && >= 0)`; Publish `validated && trim(name).length > 0 && categoryId !== null`; Transition `draft -> validated -> published` (`validated -> draft` is intentionally allowed by spec as editorial un-validation when not publishing; `published -> draft/validated` rejected `400`). **Roles:** `viewer` (`exhibit:read` only), `curator` (`exhibit:read`, `exhibit:write`), `admin` (`exhibit:validate` + all permissions).
- **Environment & Safe Isolation:** Windows 11, Node.js `v26.5.0`, pnpm `10.33.2`, Docker Engine `29.8.1`, PostgreSQL `16-alpine` (`museumos_sqe_test`), NestJS `11.1.19`, Prisma `6.19.3`. Setup & reset: `scripts/team/reset-sqe-test-db.ps1` strictly validates target DB name `museumos_sqe_test`.

<!-- PAGEBREAK -->

## 3. Static Analysis (SonarQube Overall-Code Gate) and Complexity

An ephemeral local Docker **SonarQube `9.9.8.100196`** server + `sonar-scanner-cli` (`8.4.0`) scanned the final remediated source (`apps/api/src,apps/web/src,apps/pwa/src,packages/contracts/src`) using normalized `apps/api/coverage/lcov.info` against a custom overall-code quality gate **`MuseumOS-SQE-Overall`** (`ignoredConditions: false`, **OK**).

| Measure | Baseline (`0ef7004`) | Final Overall Scan | Meaning / Interpretation |
|---|---:|---:|---|
| Source lines / `ncloc` | 28,377 / 25,332 | **27,968 / 24,975** | Clean app/contract source scope (`182` indexed files; tests excluded from `ncloc`) |
| Cyclomatic / cognitive complexity | 5,630 / 3,550 | **5,653 / 3,584** | Modest growth from explicit workflow & RBAC guards |
| Duplicated lines density | 2.2% | **2.2%** | Well below 3.0% gate ceiling; shared helper patterns reused |
| Bugs / Vulnerabilities | 3 / 0 | **0 / 0** | All 3 baseline reliability bugs fixed (`alert_status` `ERROR -> OK`) |
| Code smells / Tech debt (`sqale_index`) | 177 | **178 / 1,203 min (20.05 h)** | Estimated remediation time across minor TypeScript maintainability hints |
| Overall Reliability / Security / Maint | C / A / A | **A (1.0) / A (1.0) / A (1.0)** | All 3 overall-code ratings equal **A**, evaluated directly (`ignoredConditions: false`) |
| Security hotspots reviewed | 0% (3 open) | **100.0% (0 open)** | 3 upstream hotspots (`branding.ts` L20, `dashboard.tsx` L39, `not-found.tsx` L13) reviewed Safe |
| Overall Sonar coverage / branch coverage | 0.0% | **9.6% total (`7.5%` line, `100.0%` branch)** | LCOV covers Vitest API business-logic modules; `apps/web`/`apps/pwa` UI is tested by 30 Playwright specs |
| `exhibit-workflow.ts` module metrics | Uncovered | **`100.0%` line & branch (`0` bugs, `1` smell, `55 ncloc`)** | Sonar cyclomatic **`22`** (`cognitive = 16`), matching hand count **`22`** |
| Workspace ESLint (`pnpm lint`) | 345 errors | **0 errors, 1 warning** | All packages pass strict ESLint & `pnpm build` exits `0` |

### Hand-Calculated Cyclomatic Complexity vs. SonarQube (`exhibit-workflow.ts`)

Per-function $V(G)$ ($1$ base + $1$ per `if`, `? :`, `&&`, `||`): `isAcquisitionYearAllowed` = **4** (`1` + `||` + `2× &&`); `isCollectiblePriceAllowed` = **3** (`1` + `||` + `&&`); `getExhibitState` = **3** (`1` + `2× if`); `isPublishAllowed` = **3** (`1` + `2× &&`); `validateExhibitTransition` = **9** (`1` + `4× if` + `2× ?:` + `2× &&`). Total = **`4 + 3 + 3 + 3 + 9 = 22`**, matching SonarQube (`sonar-lifecycle-module.json`) and CFG formula $E - N + 2P = 20 - 13 + 2(1) = 9$ for `validateExhibitTransition`.

![Control-Flow Graph of validateExhibitTransition showing V(G)=9 and Module Total=22](evidence/charts/cfg-validate-transition.png)

<!-- PAGEBREAK -->

## 4. Test Plan, Reconstructed Effort, Risk Register & Residual Risk

### Reconstructed Effort vs. PERT Estimate (`hours = (O + 4M + P) / 6`)

*Reconstruction Method:* Because Weeks 1–3 had no live stopwatch logs, initial rounded estimates (`29.0 h`) were replaced by combining Nov 24 member-reported baseline logs with objective git commit windows (`2026-11-21 20:13–20:15`, `2026-11-22` capture timestamps, `2026-11-24 01:50–02:30` `0.67 h` CI fix burst) and timed `2026-11-26/27` remediation reruns: **Burhan `7.25 h`**, **Ali `14.75 h`**, **Huzaifa `9.25 h`**, **Team Total `31.25 h`** vs. **`31.2 h`** PERT (`+0.05 h / +0.2%`).

| Work Package | Owner | O | M | P | PERT Est. | Reconstructed Actual | Variance |
|---|---|---:|---:|---:|---:|---:|---|
| Scope, requirements, risk, traceability | Burhan Ahmed | 2 | 3 | 5 | 3.2 | **2.25 h** | `-0.95 h` |
| Complexity, white-box, MC/DC, mutation, CI | Burhan Ahmed | 4 | 6 | 10 | 6.3 | **5.00 h** | `-1.30 h` |
| API partitions, OpenAPI spec/generator, API matrix | Syed Ali Akbar Naqvi | 4 | 6 | 9 | 6.2 | **8.75 h** | `+2.55 h` |
| Browser E2E (30 flows), a11y, ZAP/RBAC security | Huzaifa Ali | 5 | 7 | 11 | 7.3 | **7.25 h** | `-0.05 h` |
| Performance, DB outage recovery, remediation, PDF | Shared (Ali 6.00 h, Huzaifa 2.00 h) | 5 | 8 | 12 | 8.2 | **8.00 h** | `-0.20 h` |
| **Total** | **Team** | **20** | **30** | **47** | **31.2** | **31.25 h** | **`+0.05 h (+0.2%)`** |

### Risk Register (12 Risks) & Residual Risk Assessment

| ID | Risk Description | L×I | Mapped Technique, Depth & Linked Exit Criterion | Residual Risk & Open Link |
|---|---|---:|---|---|
| **P1** | Unvalidated exhibit published | **25** | 8-row MCC + 100% branch coverage (`EC-1`), Stryker (`EC-4`), API + `UC-02-E1` | **Low:** Enforced at workflow & controller boundaries (`DEF-001` fixed) |
| **P2** | Unauthorized role changes state | **20** | 100% `PermissionGuard`/`Controller` (`EC-1`), `11/11` RBAC + read-back (`UC-03`) | **Low Functional / Open `SEC-001`:** Hardening needed for prod TLS (`DEF-003`) |
| **Q1** | Evidence not reproducible in CI | **20** | Deterministic scripts, mandatory CI Sonar + `release-check` (`EC-4`), PRs `#4/#5/#6` | **Low (CI & Docker):** Branch protection enforced (`branch-protection.json`) |
| **P3** | Invalid year or price persisted | **16** | Production Zod tests + OpenAPI EP/3-pt BVA + 4-constraint generator (`EC-2`) | **Low:** Validated on `POST`/`PATCH` with read-back after every rejection |
| **P4** | Repeated write creates duplicate | **15** | Idempotent repeat-publish/PATCH API + `UC-02-A2`/`UC-06-A2` single-row checks | **Low:** UUID PK update semantics prevent duplicate rows |
| **P5** | Published returns to draft | **15** | `UT-TERMINAL-01`, widened Stryker 98.97%, API `400` read-back, `UC-02-E2` | **Low:** Terminal guard blocks reverse transitions server-side |
| **P6** | DB data lost/inconsistent on failure | **15** | Mock retry + `P2003` FK + real `docker stop/start` outage recovery (`EC-5`) | **Low Data Loss / Minor Transient:** 1 stale pool socket evicted on restart (`DEF-002`) |
| **Q2** | Member viva & commit attribution | **15** | Full prompt archive, Nov 24 disclosure, PR `#6` GitHub commits, rehearsal | **Medium (Open):** Requires unanimous team viva rehearsal before defense |
| **P7** | Slow exhibit reads under load | **12** | 4×60s `k6` runs (`1` & `5` VUs, `sleep(1)`, `p95<=500ms`, `EC-3`) | **Low `<=5` VUs / Untested `>50` VUs:** Single-host ceiling (`PERF-01`) |
| **P8** | Screen inaccessible to AT/keyboard | **12** | Playwright Tab/Enter, 3-screen `axe-core` & Lighthouse (`EC-3`) | **Low:** `0` axe violations, Lighthouse `1.00`; 1 `incomplete` manual contrast flag |
| **SEC-001** | Cookie `Secure=false` / missing proxy headers | **12** | Cookie check + prod preview (`:4173`) & API (`:3000`) OWASP ZAP scan | **Medium (Open Prod):** Acceptable on HTTP dev; requires TLS & nginx CSP/XFO/SRI |
| **SEC-DEP-01** | 26 production dependency advisories | **15** | `pnpm audit --prod` + `.pnpm` version/reachability audit across W1/W2 | **Medium-High (Open):** `proxy-addr@2.0.7` & `body-parser@2.2.2` need overrides |

![5x5 Product and Project Risk Matrix plotting all 12 risks](evidence/charts/risk-heatmap.png)

<!-- PAGEBREAK -->

## 5. White-Box Testing, 100% Scoped Branches, MCC/MC-DC & Widened Mutation

### 46/46 Unit Tests & Line-by-Line Uncovered Justification (`test:coverage:all`)

Running `pnpm --filter @museumos/api exec vitest run test/team --coverage` (CI gate) and `pnpm test:coverage:all` (`--coverage.thresholds.branches=100`, `46/46` tests across 5 files; `coverage-all-business-logic.json`) hits **100.00% branch coverage across all 4 core files**:
- `exhibit-workflow.ts` (**100%** Stmts `39/39`, **100%** Branch `30/30`, **100%** Funcs `5/5`, **100%** Lines `39/39`) & `permission.guard.ts` (**100%** Stmts `24/24`, **100%** Branch `11/11`, **100%** Funcs `2/2`, **100%** Lines `24/24`).
- `exhibits.controller.ts` (`53.99%` Stmts, **100%** Branch, `28.00%` Funcs) & `exhibits.service.ts` (`46.01%` Stmts, **100%** Branch, `50.00%` Funcs).
- **Line-by-Line Out-of-Scope Justification:** Uncovered statements in `exhibits.controller.ts` (lines `50–181`: `search`, `export`/`toCsv`, `stats`, `manufacturers`, `attributeValues`, `lookup`, `resolveMentions`; lines `312–423`, `439–455`: `setTags`, `bulkUpdate`, `uploadImages`..`deleteImage`) and `exhibits.service.ts` (lines `148–250`: `stats`/`listManufacturers`/`listAttributeValues`/`lookupMany`; `269–364`: `findSimilar`; `421–542`: tags/bulk/attribute JSON filters) belong to excluded out-of-scope endpoints in `scope.md`. Search endpoints are still verified at live API/UI layers (`UC-04` + `api-run.json`).

### Complete MCC (`isPublishAllowed`, 2^3 = 8 rows), MC/DC Pairs & `validated` State Transition Defense

| Case / ID | `C1` (`validated`) | `C2` (`name > 0`) | `C3` (`cat !== null`) | Decision $D$ | Transition Guard (`draft`, `validated`, `published`) |
|---|---:|---:|---:|---:|---|
| `UT-PUBLISH-01` | T | T | T | **T** | `draft -> draft/validated`: allowed unless blank name/null cat (`R1`/`R2`) |
| `UT-PUBLISH-02` | T | T | F | **F** | `draft -> published`: **rejected `400`** (`Must be validated first`) |
| `UT-PUBLISH-03` | T | F | T | **F** | **`validated -> draft`:** *Deliberately allowed* editorial un-validation (`spec`); **invalid `validated -> published`** (simultaneous `validated:false`, blank name, or null cat) **is rejected `400`** (`UT-TRANSITION-VALIDATED-DISALLOWED-01`) |
| `UT-PUBLISH-04..08` | mixed (`F` rows) | — | — | **F** | `published -> draft/validated`: **rejected `400`** (`Terminal state`); `published -> published`: allowed no-op |

- **MC/DC Pairs:** `isPublishAllowed`: $C_1=(01,05), C_2=(01,03), C_3=(01,02)$. **Year** ($n=4$): `Y1` (`null`), `Y9` (`1800`), `Y10` (`2101`), `Y11` (`1799`), `Y13` (`2000.5`), `Y14` (`2100.5`), `Y15` (`1799.5`), `Y16` (`NaN`); MC/DC `(Y1,Y15)`, `(Y9,Y13)`, `(Y9,Y11)`, `(Y9,Y10)`. **Price** ($n=3$): `C1` (`null`), `C5` (`0`), `C6` (`-0.01`), `C7` (`Infinity`), `C8` (`NaN`); MC/DC `(C1,C7)`, `(C5,C7)`, `(C5,C6)`.

### Widened Stryker Mutation (`98.97%`) & Real-Vitest Custom Domain Mutators (`4/4`)

| Run / Scope | Total | Killed | Timeout | Survived | No Cov | Score & Analysis (`mutation-analysis.md`) |
|---|---:|---:|---:|---:|---:|---|
| Initial 7-test baseline (`exhibit-workflow.ts`) | 93 | 75 | 0 | **9** | **9** | `80.65%` (9 genuine survivors incl. L61–62 `#84/#86/#90` + 9 NoCov) |
| **Widened Pre-Kill** (`exhibit-workflow` + `permission.guard` + `exhibits.controller:183-310`) | 194 | 175 | 0 | **17** | **2** | `90.21%` (expanded per Item 10 to surface genuine service/guard/controller survivors) |
| **Widened Final (`mutation-final.json`)** | **194** | **190** | **2** | **2** | **0** | **`98.97%`** (`permission.guard` `100%`, `controller` `100%`, `workflow` `97.85%`; only 2 equivalent string literals `'validated'`/`'draft'` at L50–51 survive) |
| **Custom Mutators vs. Real Vitest** | **4** | **4** | — | **0** | — | **`100.00%`** (`PRICE-INCLUSIVE-ZERO`, `YEAR-INCLUSIVE-LOWER`, `YEAR-INCLUSIVE-UPPER`, `PUBLISH-AND-OR` evaluated directly against real `vitest`) |

<!-- PAGEBREAK -->

## 6. OpenAPI Specification, 4-Constraint Regeneration & 9-Row API Matrix

`docs/team/planning/openapi.yaml` now specifies every endpoint tested (`/auth/login`, `/auth/me`, `/categories`, `/health`, `/exhibits` GET/POST, `/exhibits/{id}` GET/PATCH/DELETE). Running `pnpm test:data:constraints` verified live regeneration across **4 schema constraint types**: (1) `year` range `1800..2100 -> 1810..2090`, (2) `exhibitName.maxLength` `500 -> 120`, (3) `collectiblePrice.type` `number -> integer` (`0.01` replaced with `0.5` invalid integer boundary), and (4) `sortOrder.enum` `['asc','desc'] -> ['asc','desc','relevance']`. Live `pnpm test:api` (`SQE-1795721698365`, `api-run.json`) executed **93/93 outcomes** and read records back after **every `POST`/`PATCH` rejection**:

| Method | Endpoint | Status Codes Tested | Parameters Covered | Executed Cases |
|---|---|---|---|---:|
| `POST` | `/auth/login` | `200`, `401` | `identifier/password` | 2 |
| `GET` | `/auth/me` | `200`, `401` | session cookie | 2 |
| `GET` | `/categories` | `200`, `401` | category list lookup | 2 |
| `GET` | `/exhibits` | `200`, `400`, `401` | `limit`, `sortOrder`, `yearFrom` | 15 |
| `POST` | `/exhibits` | `201`, `400`, `401`, `403` | `categoryId`, `collectiblePrice`, `exhibitName`, `role`, `year` | 31 |
| `GET` | `/health` | `200` | service health | 1 |
| `GET` | `/exhibits/{id}` | `200`, `401`, `404` | `id` | 3 |
| `PATCH` | `/exhibits/{id}` | `200`, `400`, `401`, `403`, `404` | `categoryId`, `collectiblePrice`, `exhibitName`, `id`, `published`, `role`, `validated`, `validated/published`, `year` | 33 |
| `DELETE` | `/exhibits/{id}` | `204`, `401`, `403`, `404` | `id`, `role` | 4 |
| **Total** | **9 operation rows** | **200/201/204/400/401/403/404** | **All W1/W2 + search + auth + delete params** | **93 / 93 PASS** |

---

## 7. Discrete Playwright Suite (30 Flows), 3-Screen Accessibility, Security, Performance & DB Outage Recovery

- **30/30 Discrete Playwright Tests (`tests/team/`):** Refactored the previous 8 bundled specs into **30 single-flow tests** (1 flow per test: `UC-01` [5], `UC-02` [5], `UC-03` [7], `UC-04` [5], `UC-05` [4], `UC-06` [4]) archived in `docs/team/evidence/e2e/playwright-report.html`. Both `UC-03` (viewer UI badge, modal rejection banner, unauthenticated `/exhibits`->`/login` redirect) and `UC-04` (search results table, category filter, empty-state text, unknown-ID `"Exhibit not found"`) enforce direct UI assertions, and every `401`/`403` in `UC-03` performs a follow-up `GET` read-back (`access-checks.json`: **`11/11` checks, `statePreserved: true`**).
- **3-Screen Lighthouse & Deduplicated `axe-core` Findings:** Authenticated Lighthouse (`lighthouse-multi-screen.json`) audited **every workflow's key screen** (`/exhibits`, Create modal `/exhibits?new=1`, Detail `/exhibits/:id`), scoring **`1.00` Accessibility / `1.00` Best Practices / `0.82` SEO** across all three (`0` `axe-core` violations across `45`/`32`/`34` passes). Five distinct issues (`A11Y-01`..`05`) are counted **once** across both tools.
- **OWASP ZAP Passive Scan (Compiled Vite Preview `:4173` + Direct API `:3000`):** Proxying all 30 Playwright specs against built `vite preview` (`:4173`) plus direct API probes (`:3000`) recorded `104` instances (`0` High): direct API returned **`0` Medium / `0` Low header alerts** (`helmet` active); `:4173` preview emitted `3` Medium (`CSP` `10038`, `Anti-clickjacking` `10020`, `SRI` `90003`) & `1` Low (`nosniff` `10021`), tracked as `SEC-001`.
- **k6 Read Load (`16.40–28.16 ms` p95, `0%` fail) & Real DB Stop/Start Outage Recovery:**
  - *Thresholds & `5`-VU behavior:* Interactive detail navigation justifies `p95 <= 500 ms` and `< 1%` failures; `sleep(1)` enforces realistic 1-second curator think time within `ThrottlerGuard` (`20/1s`, `100/10s`); `5` VUs scored lower p95 (`16.40–24.41 ms`) than `1` VU (`27.77–28.16 ms`) because initial 1-VU runs warmed V8 JIT and Postgres/Prisma caches while `~4.98 req/s` stayed well below saturation.
  - *Hardware/Versions:* `12th Gen Intel Core i5-12450HX`, `23.7 GB` RAM, Windows 11, Node `v26.5.0`, pnpm `10.33.2`, NestJS `11.1.19`, Prisma `6.19.3`, PostgreSQL `16-alpine`.
  - *Outage Proof (`db-outage-recovery-run.json`):* **`docker stop museumos-db`** caused `PATCH` `{ year: 2024 }` to return **`500`** cleanly -> **`docker start museumos-db`** -> `2` reconnect attempts (`afterFailure: { year: 1980, recordsWithId: 1 }`) -> repeated `PATCH` `[2024, 2024]` -> `afterRetry: { year: 2024, recordsWithId: 1 }` (**zero duplicates**).

![Confirmed Major Defects Pareto and k6 Authenticated Read p95 Latency](evidence/charts/pareto-and-k6.png)

<!-- PAGEBREAK -->

## 8. Consolidated Findings Table (API, Accessibility, Security, Dependency & Performance)

| Finding ID | Area | Affected Component & Root Cause | Severity | Fix / Current Disposition | Risk ID |
|---|---|---|---|---|---|
| **`DEF-001`** | API / Lifecycle | Unvalidated exhibit published `200`: boolean PATCH bypassed prerequisite & terminal guards | **Major** | Fixed via `exhibit-workflow.ts` + 8-row MCC + API/E2E checks (`Issue #1`) | **P1, P5** |
| **`DEF-002`** | API / Database | Search `500` & stale `search_tsv`: Prisma rejected multi-SQL + swallowed seed error | **Major** | Fixed via split SQL + fail-fast seed + forward migration (`Issue #2`) | **P6** |
| **`DEF-003`** | API / RBAC | Curator set `validated=true`: `PATCH` only checked `exhibit:write`, omitting `exhibit:validate` | **Major** | Fixed via change-sensitive `exhibit:validate` check (`Issue #3`) | **P2** |
| **`A11Y-01`** | Accessibility | `NewExhibitModal`, close/donor `<button>`, `#new-exhibit-*` inputs lacked programmatic labels | **Critical** | Fixed via `aria-labelledby`, `aria-label`, explicit `<label htmlFor>` (Lighthouse `1.00`) | **P8** |
| **`A11Y-02`** | Accessibility | `.text-primary` accent links/badges failed `>= 4.5:1` WCAG AA contrast in `globals.css` | **Serious** | Darkened `--primary` HSL lightness; `0` contrast failures on 3 screens | **P8** |
| **`A11Y-03`** | Accessibility | `exhibit-detail.tsx` orphaned `<dt>`/`<dd>` elements inside `<div>` outside `<dl>` | **Serious** | Restructured metadata pairs inside semantic `<dl>` elements | **P8** |
| **`A11Y-04`** | Accessibility | `exhibit-detail.tsx` jumped `<h1> -> <h4>`, skipping `<h2>`/`<h3>` landmark hierarchy | **Moderate** | Promoted section headings to semantic `<h2>` | **P8** |
| **`A11Y-05`** | Accessibility | `[data-sonner-toast][data-type="success"]` pale green text failed `4.5:1` contrast | **Serious** | Configured high-contrast dark green foreground; `0` violations on publish | **P8** |
| **`SEC-001`** | Security / Cookie | `cookie.secure=false` on HTTP dev & overridable via `SESSION_COOKIE_SECURE=false` | **Medium** | **Open Prod Hardening:** Enforce `Secure=true` behind TLS gateway | **P2, SEC-001** |
| **`ZAP-01..03`** | Security / Web | Built `vite preview` (`:4173`) HTML omitted `CSP` (`10038`), `XFO` (`10020`), font `SRI` (`90003`) | **Medium** | **Open Prod Hardening:** Deploy behind nginx/Caddy with strict CSP/XFO & local WOFF2 | **SEC-001** |
| **`ZAP-04`** | Security / Web | Static preview (`:4173`) assets omitted `X-Content-Type-Options: nosniff` (`10021`; API OK) | **Low** | **Open Prod Hardening:** Add `nosniff` at web proxy (verified active on API `:3000`) | **SEC-001** |
| **`SEC-DEP-01`** | Dependencies | 26 `pnpm audit --prod` advisories (`1` Crit `proxy-addr@2.0.7`, `14` High incl. `body-parser@2.2.2`, `zod@3.25.76/4.6.7`, `multer@2.1.1`, `sharp@0.34.5`, `react-router@7.15.0`, `deepmerge-ts@7.1.5`, `effect@3.21.0`, `source-map-js@1.2.1`; `8` Mod incl. `qs@6.15.1`) | **Crit/High** | **Open Hardening:** `proxy-addr`/`body-parser`/`qs` prioritized for `pnpm.overrides`; `multer`/`sharp`/`react-router`/CLI packages non-reachable in W1/W2 | **SEC-DEP-01** |
| **`PERF-01`** | Perf / Outage | Single-host load capped at `5` VUs (`<=5 req/s`); 1 dead-socket eviction query after DB restart | **Minor** | Accepted for single-host academic scope; monitor pool keepalive under load | **P6, P7** |

- **Pareto Summary (`DEF-001`..`003` Major Functional):** 2/3 (**66.7%**) Invariant enforcement omissions (`DEF-001`, `DEF-003`); 1/3 (**33.3%**) Schema/seed drift (`DEF-002`).

![Fishbone RCA for DEF-001 and DEF-003](evidence/charts/fishbone-def001.png)

![Fishbone RCA for DEF-002](evidence/charts/fishbone-def002.png)

<!-- PAGEBREAK -->

## 9. Release Criteria (Actual vs. Target), CI Proofs & AI/Commit Transparency

| Release Criterion | Target | Actual Measured Status (2026-11-27) | Met? |
|---|---|---|---|
| **EC-1** Business Logic Coverage | 100% stmt/branch workflow & guard; 100% branch across 4 modules | **46/46** unit pass; `exhibit-workflow` & `permission.guard` **100%** all metrics; **`test:coverage:all` 100% branch** (`controller`/`service` out-of-scope justified) | **Yes** |
| **EC-2** OpenAPI & Live API Matrix | Full endpoint×method×status×param matrix; read-back; constraint proof | **93/93** HTTP outcomes (`9`-row matrix in `api-run.json`), read-back after every `POST`/`PATCH` rejection, **4-constraint** regeneration proof | **Yes** |
| **EC-3** E2E, RBAC & Accessibility | 1 flow/test; UC-03/04 UI; 3-screen Lighthouse; deduplicated axe | **30/30** discrete Playwright specs; **`11/11`** RBAC + read-back; **`0`** axe violations; all 3 screens Lighthouse **1.00 A11y / 1.00 BP** | **Yes** |
| **EC-4** Mutation, Sonar & Mandatory CI | Widened Stryker >=80%; real Vitest mutators; mandatory overall Sonar CI | Stryker **98.97%** (`192/194`), custom **4/4**, SonarQube overall gate **OK (`ignoredConditions: false`)**, mandatory `ci-sonar-gate.sh` + `release-check` job | **Yes** |
| **EC-5** Security, Perf & DB Outage | Prod+API ZAP; k6 `<=500ms`; real `docker stop/start` DB recovery | ZAP `:4173` + `:3000` (`0 High`), k6 `16.4–28.2 ms` (`0%` err), `docker stop/start` recovery PASS (`0` dupes); `SEC-001`/`SEC-DEP-01` tracked | **Yes (Hardening Open)** |
| **External / Viva Items** | Google Sheet registration; clean GitHub attribution; live team viva | PR `#6` under `ali-akbar1214`'s GitHub email; `ai-prompts-archive.md` + `31.25 h` actuals saved; **A2 Sheet screenshot & live viva rehearsal pending team completion** | **Partial (Team Action)** |

### Mandatory CI, Branch Protection & Git History Transparency

- **Branch Protection & CI Workflow (`.github/workflows/quality.yml`):** Replaced optional `if: vars.SONAR_ENABLED == 'true'` with unconditional `bash scripts/team/ci-sonar-gate.sh` (running live Docker `sonarqube:lts-community` + overall quality gate + normalized LCOV + `-Dsonar.qualitygate.wait=true`), enforced `test:coverage:all` (`100%` branch gate), removed all escape hatches (`0` `continue-on-error`, `0` `||`), and wired downstream `release-check` (`needs: [quality]`). GitHub branch protection (`docs/team/evidence/ci/branch-protection.json`: `strict: true`, `contexts: ["quality"]`, `enforce_admins: true`) verified via **Blocked PR `#4`**, **PR `#5`**, and **PR `#6`**.
- **Area Ownership:** Burhan (`24I-3030`: SonarQube, `V(G)=22`, MCC/MC-DC, coverage, widened Stryker, CI, `UC-01/04`); Ali (`24I-3079`: OpenAPI spec, 4-constraint generator, 93-outcome API matrix, `UC-02/05`, GitHub PRs); Huzaifa (`24I-3114`: 30-flow E2E, `axe`/3-screen Lighthouse, RBAC/ZAP/deps, k6 & DB outage recovery, `UC-03/06`, packaging).

### Generative AI Use Summary (`docs/team/reporting/ai-use.md` & `ai-prompts-archive.md`)

| Date / Tool | Output & Honest Disclosure | Member Checking & Ownership (`ai-use.md`) |
|---|---|---|
| Pre-Nov-21 / Copilot SDK | Initial `exhibit-workflow.ts` & early scope (*original prompts not saved*) | Verified against `0ef7004`; manual `V(G)=22` matched Sonar (`22`) |
| 2026-11-22–23 / Codex Desktop | Initial captures & overclaim/contract reconciliation (*early chat not exported*) | Team verified real `@museumos/contracts` tests & baseline hotspots |
| 2026-11-24 / Antigravity (Gemini) | Guard/controller tests, 6-UC E2E, controller save fix, `quality.yml`, `#1–#5` (*prompts 1–9 archived*) | Verified all commands; *Nov 24 `01:50` bulk commits pushed from one machine via `@sqe.local` emails; members must explain owned areas in viva* |
| 2026-11-26–27 / Antigravity | 30 split E2E, prod+API ZAP, 3-screen Lighthouse, DB outage script, 9-row API/4-constraint, widened Stryker/coverage, overall Sonar gate, docs & PR `#6` (*prompts 10–13 archived*) | Verified every live capture independently; committed cleanly under `ali-akbar1214` GitHub-linked email without rewriting history |
