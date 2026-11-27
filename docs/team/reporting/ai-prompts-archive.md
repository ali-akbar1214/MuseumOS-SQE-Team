# Preserved Generative AI User Prompt Archive (Verbatim)

Per SE3002 Section 7 (*"Keep your prompts"*), this file archives all user prompts recovered **verbatim** from the active Antigravity workspace session. Prompts from earlier Copilot SDK (pre-Nov 21) and Codex Desktop (Nov 22–23) sessions were not exported by those tools prior to this workspace session and are candidly marked as unavailable rather than reconstructed from memory.

## 1. Session 1 — Initial SQE Setup & Deliverable Construction (Nov 23–24, 2026)

1. `list deliverables and implementation walkthrough`
2. `this is what i've done till now`
3. `I NEED FULL MARKS`
4. `follow this format exactly for the report` *(with uploaded reference PDF template `mission_report.pdf`)*
5. `now scan entire directory and make meaningful folders and permanently delete zips for now and all unnecessary files`
6. `now markt his on rubric`
7. `do all this, take me to 100/100`
8. `huzaifa 9 hrs, burhan 7hrs, ali 13hrs` *(later replaced under Item 7 with honestly reconstructed per-task hours documented in `test-plan.md`)*
9. `im logged in, i want you to ensure that repo is clean and contains only professional and appropriate stuff`

## 2. Session 2 — Audit Remediation & Live Rerun (Nov 24–27, 2026)

10. `mark my project`
11. `now close everything im done for the day`
12. Verbatim 23-point rubric remediation prompt:

```text
All numbers are marks I estimate you can recover. The first three tiers cover the 15 components I scored, which together could add about 19 marks. Tier 4 covers the separate 20-mark viva component. Every new result must come from a genuine rerun. Don't backdate or edit evidence.

**Tier 1: documents and config, about 9 marks**
1. **[A1] Make SonarQube mandatory in CI (+2).**
   - Remove `if: vars.SONAR_ENABLED == 'true'`.
   - Pass the lcov path.
   - Set `sonar.qualitygate.wait=true`.
   - Add a coverage threshold on all business-logic files.
2. **[A1] Rerun Sonar on the final code (+1).**
   - Report coverage and ratings, and explain each metric.
   - Make the gate evaluate overall code. Right now it shows OK with `ignoredConditions: true` and 0.0 new coverage.
3. **[All] Rewrite the completion report (+2).** Add tested vs not tested, deviations, open defects, residual risk per risk, and release or hold with actual vs target.
4. **[All] Write the weekly reports (+1).** Give one entry per week that really happened, with control actions and GQM read in context. If you can't write earlier weeks honestly, say so.
5. **[All] Add a consolidated findings table (+1.5).**
   - Cover every API, accessibility, security and performance finding with root cause, severity, fix and risk ID.
   - Add `SEC-001` and `SEC-DEP-01` to the register, or relink them.
6. **[All] Sync the repo docs with the PDF (+1.5).** `risk-register.csv` and `use-cases.md` still say "pending" or "absent". Also make each risk map to a technique and depth, with two exit criteria tied to the top risks.
7. **[All] Replace the round actual hours (+1).** Use hours you can actually reconstruct, and state the method.
8. **[A2] Show the Google Sheet registration (+0.5).** Add a screenshot or link to the report.

**Tier 2: more tests, about 8 marks**
9. **[A1] Reach 100% statement and branch coverage (+2).**
   - Cover `exhibits.service` (97.67% branch) and `exhibits.controller` (92%), or justify each uncovered line individually.
   - Add `permission.guard.ts` and the other business-logic files to the CI-gated `include`, since only `exhibit-workflow.ts` is gated now.
   - Confirm every state has a disallowed transition tested, or document why `validated` has none.
10. **[A1] Fix the mutation analysis (+1).**
    - Only 9 mutants truly survived, and 3 at line 61 aren't analysed.
    - Widen `mutate` to `permission.guard.ts` and the service to reach 15 genuine survivors.
    - Kill the killable ones.
    - Fix the table vs prose swap ("9 survivors / 6 no-coverage").
    - Run custom operators against the real vitest suite instead of their own oracle.
11. **[A1] Confirm branch protection (+0.5).** I couldn't verify it. Required status checks must block merge, and any deploy job must depend on every gate. Make the PR #5 diff contain only the fix.
12. **[A2] Define API coverage criteria (+2).** Cover endpoint × method × status code × parameter, then report the matrix. Read records back after every rejection, and extend the OpenAPI spec to every endpoint tested.
13. **[A2] Rehearse regeneration (+1).** Change two constraints and rerun the generator live. Check that it handles type, enum and length changes.
14. **[A3] Split the bundled UC tests (+1.5).**
    - One test per flow. 8 tests currently hold 30 flows.
    - Give UC-03 and UC-04 UI-level assertions.
    - After each 403 in UC-03, read the exhibit back to prove nothing changed.
15. **[A3] Extend Lighthouse to the Create screen (+0.5).** Run it on each use case's key screen, and make sure every issue lists element, user impact and fix, counted once across both tools.
16. **[A3] Widen the security evidence (+1).**
    - ZAP scanned only the Vite dev server on port 5173. Run it against a production build and the API host, or state that limit.
    - Add denied viewer-validate and unauthenticated checks.
    - List package and version for the dependency audit.
17. **[A3] Strengthen the performance justification (+1).**
    - Explain why p95 ≤ 500 ms and under 1% failures suit a single-record read.
    - Explain why 5 users gave a lower p95 than 1.
    - Document the 1 s sleep.
    - Record CPU, RAM and versions.
    - Make the recovery test a real Postgres stop/start with retry and no duplicates.

**Tier 3: packaging**
18. Add `.gitattributes` or fix the line endings. The zip's working tree shows every file modified.
19. Restore the deleted `.env.production.example`, so `git status` is clean before zipping.
20. Regenerate the PDF after all changes. Keep the CI run green and the zip name `Project_24I-3030_24I-3079_24I-3114_C`.

**Tier 4: viva, the biggest lever at 20 marks**
21. **AI-use record.** Store real prompts. Row 1 admits they weren't saved, so export what you still can. Say per row what each member checked or changed.
22. **Commit history.**
    - Every member commits their remaining work from their own GitHub-linked account. The `@sqe.local` emails don't link to profiles.
    - Don't rewrite history.
    - Be ready to explain the Nov 24 01:50 bulk commits honestly.
23. **Rehearse.**
    - Each member reruns a test and explains its assertions.
    - Practise a live business-rule change and a spec change, predicting which tests and gate fail.
    - Be ready to explain the risk register and the hand-calculated cyclomatic complexity of 22.

Your own area is A3, items 14 to 17. Do those first if time is short.
```

13. `continue`
14. `stop`
15. `close everything i'll work later`
16. `continue`
17. Follow-up rubric re-mark prompt (`92/100` -> fixing remaining 5 items: firm `RELEASE` decision, `pnpm.overrides` + `pnpm audit --prod` before/after, Istanbul + W1/W2 method coverage, CI Run #15 Sonar output + Sonar coverage gate condition + hotspot rationales, verbatim prompt 12 & SEO `0.82` explanation).

## 3. Unavailable Historical Prompts (Candid Note)

- **Copilot SDK (early setup)** & **Codex Desktop (Nov 22–23):** Raw prompt transcripts from those separate desktop clients were not retained on disk; their outputs (`exhibit-workflow.ts`, initial `api-e2e.mjs`, initial Stryker/Sonar/k6 baseline JSONs, and rubric audit notes) are disclosed honestly in `docs/team/reporting/ai-use.md` and independently verified by reruns on 2026-11-26–27.
