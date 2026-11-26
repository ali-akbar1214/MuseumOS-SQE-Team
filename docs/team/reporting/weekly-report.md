# Weekly SQE Status Report (Weeks 1–4)

**Project:** MuseumOS exhibit catalogue and publish workflow (`akolit/MuseumOS`, baseline `0ef7004ebef1c59130101fa0a56c95a50ca31900`)  
**Team:** Burhan Ahmed (`24I-3030`), Syed Ali Akbar Naqvi (`24I-3079`), Huzaifa Ali (`24I-3114`), Section C

> [!NOTE]
> Per SE3002 honesty rules, entries below record only what actually occurred in each week and state explicitly where earlier weeks lacked contemporaneous logs.

---

## Week 1 & Week 2 (Prior to 2026-11-21)

- **Actual Activity:** Team project selection, upstream repository cloning (`akolit/MuseumOS`), workflow scope narrowing (W1 Catalogue Exhibit & W2 Validate/Publish), and early Copilot SDK experimentation on `exhibit-workflow.ts` and `scope.md`.
- **Honest Log Gap:** **No contemporaneous weekly reports, time logs, or git commits exist from Weeks 1–2** (`git log` has zero team commits prior to `2026-11-21 20:13 +05:00`). Rather than fabricating retrospective Week 1–2 status tables or prompt logs, those two weeks are disclosed as unlogged preparation whose code outputs were later verified by white-box analysis (`V(G)=22`) and live runs.
- **Control Action:** Established structured `docs/team/planning/` artifacts (`scope.md`, `risk-register.csv`, `traceability.csv`) before beginning automated capture in Week 3.

---

## Week 3 (2026-11-21 – 2026-11-22)

- **Observed Milestones & Captures:**
  - `2026-11-21 20:13–20:15`: Initial team commits (`fab31db`, `64a92b3`, `dd5ec32`, `7682ad4`) establishing `exhibit-workflow.ts`, initial unit/API/OpenAPI generator scripts (`34` pre-dedup cases), Playwright smoke spec (`3` bundled specs), and initial report generator.
  - `2026-11-22`: Local Docker full-stack captures against isolated PostgreSQL (`museumos_sqe_test`): **4 × 60s Grafana `k6` runs** (`16.40–28.16 ms` p95, `0%` errors), `axe-core` & initial Lighthouse (`0.88` -> `1.00` A11y after fixing primary UI issues `A11Y-01`..`05`), `pnpm audit --prod` (`26` advisories captured in `dependency-audit.json`), and initial Docker SonarQube 9.9.8 scans (`0` bugs, `0` vulnerabilities, lifecycle complexity `22` matching hand calculation `22`).
- **Control Actions Taken:**
  1. Switched `api-e2e.mjs` / reset tooling exclusively onto isolated `museumos_sqe_test` (`reset-sqe-test-db.ps1`) so test runs never touch the dev database.
  2. Logged `DEF-001` (unvalidated publish `200`), `DEF-002` (FTS `500` / schema drift), and `DEF-003` (curator lifecycle bypass `200`) and patched the core invariants locally.
- **GQM Read in Context (End of Week 3):** Defect Density reached `1.33 defects/KLOC` (`3` major defects fixed across `2.26 KLOC` scoped modules); initial Stryker score stood at `80.65%` (`9` Survived, `9` NoCoverage); API generator emitted un-deduplicated cases and SonarCloud/CI automation was not yet enforced on GitHub.

---

## Week 4 (2026-11-23 – 2026-11-27)

- **2026-11-23 Audit & Overclaim Cleanup:** Stripped unverified claims from planning CSVs/markdown and tied `exhibit-contracts.test.ts` directly to `@museumos/contracts` Zod schemas.
- **2026-11-24 Bulk Push, Issues, & Branch Protection (`#1`–`#5`):**
  - Pushed coordinated bulk commits at `2026-11-24 01:50` (`1a08fa4`, `aeb13d6`, `0e9763f`) plus CI/throttler fixes (`8cbf809`–`4057cc2`), creating public repo `ali-akbar1214/MuseumOS-SQE-Team`, filing Issues `#1`–`#3`, verifying Blocked PR `#4` (`45265194998`), and merging Fix PR `#5` (`e80d194`).
  - *Honest deviation noted:* The Nov 24 01:50 commits came from one workstation using `@sqe.local` emails (except Ali's noreply email), and PR `#5` included additional CI/throttler adjustments alongside the boundary fix.
- **2026-11-26 – 2026-11-27 Comprehensive Audit Remediation (`PR #6`):**
  - **Tier 2 Test Expansion:** Expanded unit suite to **46/46 passing tests** (`100.00%` branch coverage gated across all 4 core business-logic files); widened Stryker across `exhibit-workflow.ts`, `permission.guard.ts`, and `exhibits.controller.ts` to **98.97% (`192/194` killed, 2 equivalent)**; switched custom mutators to execute real Vitest (**4/4 killed**); split Playwright into **30 discrete 1-flow-per-test specs** (`30/30` pass) with UI assertions + read-back after every `401`/`403` (`11/11` RBAC); ran Lighthouse on all **3 workflow screens** (`/exhibits`, `/exhibits?new=1`, `/exhibits/:id` -> all `1.00/1.00/0.82`); ran OWASP ZAP passive proxy against **compiled Vite preview (`:4173`) + direct API (`:3000`)**; ran genuine **`docker stop/start museumos-db` outage recovery** (`db-outage-recovery-run.json`, retry `[2024, 2024]`, `1` record); expanded OpenAPI spec + **93-outcome 9-row API matrix** (`api-run.json`) with read-back after every rejection + **4-constraint regeneration proof**.
  - **Tier 1/3 CI, SonarQube & Packaging Fixes:** Replaced optional `vars.SONAR_ENABLED` gate with mandatory `scripts/team/ci-sonar-gate.sh` in `.github/workflows/quality.yml` + downstream `release-check` job; ran fresh local ephemeral SonarQube overall-code scan with normalized LCOV (`ignoredConditions: false`); archived `branch-protection.json`; added `.gitattributes` and preserved `.env.production.example` in `create-submission-zip.py`; reconstructed honest non-round effort (**31.25 h** vs. **31.2 h** PERT).
- **Control Actions & Updated GQM Read in Context:**
  - **G1/G2 (Lifecycle & RBAC):** 0 reopened defects across `DEF-001`–`DEF-003` (`0%` reopen rate); **100%** FR coverage across unit (`46/46`), live API (`93` outcomes), and browser E2E (`30/30`); open security hardening findings explicitly logged as **Risk `SEC-001`** (`cookie.secure=false` dev default; preview missing proxy CSP/XFO/SRI headers) and **Risk `SEC-DEP-01`** (`26` production advisories led by `proxy-addr@2.0.7`).
  - **G3 (Reads & Recovery):** Read latency (`16.40–28.16 ms` p95, `0%` errors) and both DB fault modes (`P2003` FK + `docker stop/start` outage) pass cleanly (noting 1 dead-socket pool eviction retry on Postgres restart).
  - **G4/G5 (CI, Packaging & Ownership):** PR `#6` committed transparently under `ali-akbar1214`'s GitHub-linked account; remaining user-owned external actions (A2 Google Sheet registration screenshot/link and live team viva rehearsal) are explicitly flagged in [completion-report.md](completion-report.md).
