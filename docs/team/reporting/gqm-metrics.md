# Goal–Question–Metric (GQM) Plan and Measured Indicators

## 1. Core SQE GQM Process & Product Metrics

| Metric | Formula | Measured Value (Current Local Baseline) | Target | Interpretation & Control Action |
|---|---|---|---|---|
| **Defect Density** | $\frac{\text{Confirmed Defects}}{\text{Modified/Scoped KLOC}}$ | **3 defects / 2.26 KLOC = 1.33 defects/KLOC** (across ~2,260 ncloc in `exhibits/` + `auth/` + `seed.ts` scope; 0.12/KLOC repo-wide across 25.49 KLOC) | $\le 2.0$ defects/KLOC post-fix; 0 open major defects | All 3 major defects (`DEF-001`–`DEF-003`) are fixed locally; remaining 0 open major functional defects. |
| **Requirements Coverage** | $\frac{\text{FRs with Executed Passing Tests}}{\text{Total FRs}} \times 100\%$ | **FR-01..FR-08: 8/8 (100%)** executed and passing across unit (45/45), live API (62 outcomes), and Playwright E2E (8/8 across UC-01..UC-06) | **100%** across unit, API, and browser layers | Verified live against Docker PostgreSQL (`museumos_sqe_test`) on 2026-11-24. |
| **Defect Reopen Rate** | $\frac{\text{Reopened Defects}}{\text{Resolved Defects}} \times 100\%$ | **0 / 3 = 0.0%** (verified locally for `DEF-001`..`DEF-003` with regression tests) | $\le 5\%$ | Keep regression assertions (`exhibit-workflow.test.ts`, `uc01-uc02`, `uc03-uc04`) mandatory in `.github/workflows/quality.yml`. |

---

## 2. Goal–Question–Metric Breakdown

| Goal | Question | Metric | Target | Current Evidence & Limit |
|---|---|---|---|---|
| **G1: Preserve valid exhibit lifecycle** | Can invalid transitions change persisted state? | Rejected transitions preserving state / total invalid attempts | 100%; 0 unexpected 5xx | Unit (**45/45**), live API (**62 outcomes**, `api-run.json`), and Playwright (`UC-02`, **8/8**) all verify invalid transitions return `400` and preserve state. |
| **G2: Prevent unauthorized lifecycle changes** | Can viewer or curator roles validate or publish? | Denied unauthorized attempts / total unauthorized checks | 100% | `PermissionGuard` **100%** unit covered; `ExhibitsController` **92.0%** branch covered; **7/7** live RBAC checks pass (`access-checks.json`); cookie `httpOnly`/`sameSite=Lax` verified; OWASP ZAP passive scan completed (**0 High**, 3 Medium headers/SRI). |
| **G3: Maintain responsive reads** | Does authenticated exhibit read meet latency/failure targets? | p95 response time & HTTP failure rate under 1 VU and 5 VUs (60s) | p95 $\le 500$ ms; failures $< 1\%$ | Four k6 runs: p95 **16.40–28.16 ms**, **0.00%** failed requests; live Postgres `P2003` recovery test (`db-recovery-run.json`) and `UC-06` passed. |
| **G4: Enforce CI reproducibility & lint quality** | Do static checks, coverage, and mutation gates pass cleanly? | Passing automated quality gates / total local CI checks | 100% (0 lint errors, $\ge 80\%$ mutation, 100% critical coverage) | `pnpm lint` (**0 errors**), `pnpm build` pass, unit coverage **100%**, custom mutators **4/4 (100%)**, Stryker **97.85%**. External GitHub PR run pending repo push. |
| **G5: Ensure explainable team ownership** | Can every member commit, log actuals, and defend their area? | Members with authentic commits, actual time logs, and viva rehearsal | 3 / 3 members | Pending individual commits, actual hours, and live viva rehearsal. |
