# Risk Matrix (5 × 5) and Top-Risk Exit Criterion Mapping

Likelihood and impact use 1 (rare/low) through 5 (almost certain/critical). Score = likelihood × impact. Bands: 1–4 low, 5–9 moderate, 10–16 high, 17–25 critical.

| Impact ↓ / Likelihood → | 1 Rare | 2 Unlikely | 3 Possible | 4 Likely | 5 Almost certain |
|---|---|---|---|---|---|
| 5 Critical | — | — | P4, P5, P6, Q2, SEC-DEP-01 | P2, Q1 | **P1** |
| 4 Major | — | — | P7, P8, SEC-001 | P3 | — |
| 3 Moderate | — | — | — | — | — |
| 2 Minor | — | — | — | — | — |
| 1 Negligible | — | — | — | — | — |

## Highest Risks Directly Tied to Exit Criteria

- **Risk P1 (Score 25 — Critical: Unvalidated publish) → Tied to Exit Criteria EC-1 & EC-4:** Requires **100%** statement, branch, function, and line coverage (`exhibit-workflow.ts`) + **100%** branch coverage across controller/service, full 8-row MCC decision table, `>= 80%` Stryker mutation score (achieved **98.97%** across 194 widened mutants + **4/4** real-Vitest custom mutators), and CI merge blocking (`quality` + `release-check`).
- **Risk P2 & Risk Q1 (Score 20 — Critical: Unauthorized role escalation & Non-reproducible evidence) → Tied to Exit Criteria EC-2 & EC-5:** Requires **100%** coverage on `PermissionGuard`, **11/11** live allow/deny + unauthenticated checks with read-back proof after every `401`/`403` (`access-checks.json`), full OpenAPI `endpoint × method × status × parameter` API matrix (`api-run.json`), and strict GitHub Actions enforcement (`branch-protection.json`, Blocked PR `#4`, Fix PRs `#5`/`#6`).
- **Risk P6 & SEC-DEP-01 / SEC-001 (Score 15 / 12 — DB inconsistency, Dependency advisories, Production HTTP headers):** Verified for functional recovery via real `docker stop/start museumos-db` outage test (`db-outage-recovery-run.json`) and `P2003` FK injection; `SEC-001` (`cookie.secure=false` dev default, `:4173` missing proxy CSP/XFO/SRI headers) and `SEC-DEP-01` (26 `pnpm audit --prod` advisories led by `proxy-addr@2.0.7`) remain explicitly tracked **Open Production-Hardening Risks**.
- **Risk Q2 (Score 15 — Team viva & commit attribution):** Mitigated through candid full AI disclosure (`ai-use.md` + `ai-prompts-archive.md`) and transparent explanation of Nov 24 bulk commit timing; remains **Open pending live team viva defense**.
