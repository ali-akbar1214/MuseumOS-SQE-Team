# Goal–Question–Metric (GQM) Plan and Measured Indicators

## 1. Core SQE GQM Process & Product Metrics

| Metric | Formula | Measured Value (Current Verified Baseline) | Target | Interpretation & Control Action |
|---|---|---|---|---|
| **Defect Density** | Confirmed Defects / Scoped KLOC | **3 functional defects / 2.26 KLOC = 1.33 defects/KLOC** (`DEF-001`–`DEF-003`; 0.12/KLOC repo-wide across 24.98 KLOC source) | <= 2.0 defects/KLOC; 0 open Critical | `DEF-001`–`DEF-003` fixed; non-functional security hardening items (`SEC-001`, `SEC-DEP-01`) logged explicitly in `risk-register.csv`. |
| **Requirements Coverage** | Passing FRs / Total FRs × 100% | **FR-01..FR-08: 8/8 (100%)** executed live across unit (`46/46`), 9-row API matrix (`93/93`), and discrete Playwright (`30/30`) | **100%** across unit, API, and browser | Executed against isolated Docker PostgreSQL `16-alpine` (`museumos_sqe_test`) on 2026-11-26–27. |
| **Defect Reopen Rate** | Reopened Defects / Resolved Defects × 100% | **0 / 3 = 0.0%** (`DEF-001`–`DEF-003` stay closed under CI regression guards) | <= 5% | Protected unconditionally in `.github/workflows/quality.yml` (`test:coverage:all`, Stryker, API, 30 E2E specs). |

---

## 2. Goal–Question–Metric Breakdown (Read in Project Context)

| Goal | Question | Metric | Target | Current Verified Evidence & Honest Limits |
|---|---|---|---|---|
| **G1: Preserve valid exhibit lifecycle** | Can invalid transitions change persisted state? | Rejected transitions preserving state / total invalid attempts | 100%; 0 unexpected 5xx | Unit (`46/46`, `100%` workflow branches), Stryker (`98.97%` across 3 files), live API (`93/93` outcomes with read-back after every `POST`/`PATCH` rejection), and Playwright (`UC-02`, `30/30`). |
| **G2: Prevent unauthorized lifecycle changes** | Can unauthenticated callers, viewers, or curators mutate/validate exhibits? | Denied unauthorized attempts preserving state / total checks | 100% | `PermissionGuard` (`100%` all metrics); `11/11` live RBAC checks with read-back (`access-checks.json`); cookie `httpOnly`/`SameSite=Lax` verified; prod+API ZAP (`0 High`; **open preview header & dependency hardening `SEC-001`/`SEC-DEP-01`**). |
| **G3: Maintain responsive reads & outage recovery** | Do single-record reads stay within latency targets and do DB outages recover without duplicate rows? | p95 response time, HTTP fail %, and post-outage single-record recovery | p95 <= 500 ms; < 1% err; 0 duplicates | 4×60s k6 runs: p95 **`16.40–28.16 ms`**, **`0.00%`** failures (`sleep(1)`, warmed pool explanation documented); real `docker stop/start museumos-db` outage recovery (`db-outage-recovery-run.json`: `500` -> `2` reconnect attempts -> retry `[2024, 2024]` -> `1` row) + `P2003` FK test PASS. |
| **G4: Enforce reproducible CI & static quality gates** | Do lint, overall SonarQube gate, branch coverage, and mutation pass with branch protection? | Passing mandatory gates / total CI gates | 100% mandatory pass | Local ephemeral SonarQube **OK (`ignoredConditions: false`)** (`0` bugs, `0` vuln, `100%` hotspots, `2.2%` dup, `100%` workflow coverage, `9.6%` overall repo coverage); `pnpm lint` `0` errors; `pnpm test:coverage:all` `100%` branch across all 4 files; mandatory `ci-sonar-gate.sh` + `release-check` job in `.github/workflows/quality.yml`; `branch-protection.json` archived. |
| **G5: Ensure explainable effort & team ownership** | Are effort hours, AI prompts, and member ownership transparent for viva? | Reconstructed actuals + GitHub-linked PR + prompt archive + viva | 3 / 3 members ready | Reconstructed non-round actuals **31.25 h** (`Burhan 7.25 h`, `Ali 14.75 h`, `Huzaifa 9.25 h` vs `31.2 h` PERT); PR `#6` authored cleanly under `ali-akbar1214`'s GitHub-linked email; full AI archive (`ai-prompts-archive.md`); **open pending A2 Google Sheet registration link & live viva defense**. |
