# White-Box Complexity, Decision Coverage (MCC & MC/DC), and Coverage Scope

This document presents the cyclomatic complexity derivation, complete Multiple Condition Coverage (MCC) truth tables, Minimal Condition / Decision Coverage (MC/DC) pairs, state-transition analysis, and 100% branch-coverage justification for MuseumOS server-side business logic.

---

## 1. Cyclomatic Complexity & Control-Flow Graph (`exhibit-workflow.ts`)

SonarQube Community Build reports `apps/api/src/exhibits/exhibit-workflow.ts` as **55 ncloc**, **cyclomatic complexity = 22**, and **cognitive complexity = 16**.

### Per-Function Hand Count vs. SonarQube (`22 = 22`)

| Function | Line(s) | Decision / Boolean Operators | Hand Count |
|---|---|---|---:|
| `isAcquisitionYearAllowed` | 20–22 | `1` base + `\|\|` + `&&` + `&&` | 4 |
| `isCollectiblePriceAllowed` | 24–26 | `1` base + `\|\|` + `&&` | 3 |
| `getExhibitState` | 28–32 | `1` base + `if (published)` + `if (validated)` | 3 |
| `isPublishAllowed` | 34–36 | `1` base + `&&` + `&&` | 3 |
| `validateExhibitTransition` | 38–66 | `1` base + 4 `if` statements + 2 ternaries (`? :`) + 2 `&&` operators | 9 |
| **Module Total** | **1–66** | **Matches SonarQube `sonar-lifecycle-module.json`** | **22** |

### Control-Flow Graph for `validateExhibitTransition` ($V(G) = 9$)

- **Nodes ($N = 13$):** `Entry/N1` (`name.trim().length === 0`), `R1` (reject name), `N2` (`categoryId === null`), `R2` (reject category), `N3` (derive `current` + `next` ternaries), `N4` (`next === 'published'`), `N5` (`!isPublishAllowed`), `R3` (reject unvalidated publish), `N6` (`current === 'published' && next !== 'published'`), `R4` (reject terminal revert), `A1` (allow), `Exit` (diagrammed in `docs/team/evidence/charts/cfg-validate-transition.png`).
- **Formula:** $V(G) = E - N + 2P = 20 - 13 + 2(1) = 9$.

---

## 2. Complete MCC Truth Tables and MC/DC Pairs

### 2.1 Publish Rule: `isPublishAllowed` ($n = 3$, $2^3 = 8$ MCC combinations)

Predicate: $D = C_1 \land C_2 \land C_3$ ($C_1$: `validated`, $C_2$: `exhibitName.trim().length > 0`, $C_3$: `categoryId !== null`).

| MCC Case | Test ID | $C_1$ (`validated`) | $C_2$ (`name > 0`) | $C_3$ (`category !== null`) | Decision $D$ |
|---|---|---:|---:|---:|---:|
| MCC-P1 | `UT-PUBLISH-01` | T | T | T | **T** |
| MCC-P2 | `UT-PUBLISH-02` | T | T | F | **F** |
| MCC-P3 | `UT-PUBLISH-03` | T | F | T | **F** |
| MCC-P4 | `UT-PUBLISH-04` | T | F | F | **F** |
| MCC-P5 | `UT-PUBLISH-05` | F | T | T | **F** |
| MCC-P6 | `UT-PUBLISH-06` | F | T | F | **F** |
| MCC-P7 | `UT-PUBLISH-07` | F | F | T | **F** |
| MCC-P8 | `UT-PUBLISH-08` | F | F | F | **F** |

- **Extracted MC/DC Pairs ($n + 1 = 4$ tests):** $C_1$: `(P1, P5)`, $C_2$: `(P1, P3)`, $C_3$: `(P1, P2)`.

### 2.2 Acquisition Year (`isAcquisitionYearAllowed`, $n = 4$) & Price (`isCollectiblePriceAllowed`, $n = 3$)

| Rule | Feasible MCC Rows Executed (`exhibit-workflow.test.ts` + `exhibit-contracts.test.ts`) | MC/DC Pairs |
|---|---|---|
| **Year** (`null \|\| (int && >=1800 && <=2100)`) | `Y1` (`null`→T), `Y9` (`1800`→T), `Y10` (`2101`→F), `Y11` (`1799`→F), `Y13` (`2000.5`→F), `Y14` (`2100.5`→F), `Y15` (`1799.5`→F), `Y16` (`NaN`→F). Note: `Y2..Y8` (`null` with other bools) & `Y12` (`<1800 && >2100`) are arithmetically infeasible. | $C_1$: `(Y1,Y15)`, $C_2$: `(Y9,Y13)`, $C_3$: `(Y9,Y11)`, $C_4$: `(Y9,Y10)` |
| **Price** (`null \|\| (finite && >=0)`) | `C1` (`null`→T), `C5` (`0`→T), `C6` (`-0.01`→F), `C7` (`Infinity`→F), `C8` (`NaN`→F). | $C_1$: `(C1,C7)`, $C_2$: `(C5,C7)`, $C_3$: `(C5,C6)` |

### 2.3 Full State Transition Coverage (`draft`, `validated`, `published`)

| Current State | Target State | Expected Outcome & Reason | Unit Test ID |
|---|---|---|---|
| `draft` | `draft` / `validated` | Allowed (`{ allowed: true }`) | `UT-TRANSITION-ALLOW-01` / `NOOP-01` |
| `draft` | `published` | **Rejected** (`An exhibit must be validated before it can be published`) | `UT-TRANSITION-REJECT-UNVALIDATED-01` |
| `draft` | `validated` (missing name/cat) | **Rejected** (`Exhibit name is required` / `A category is required`) | `UT-TRANSITION-REJECT-REQUIRED-01` |
| **`validated`** | `draft` | **Deliberately Allowed** (editorial un-validation before publishing; not a defect) | `UT-TRANSITION-VALIDATED-DISALLOWED-01` |
| **`validated`** | `published` (invalid/unvalidated) | **Rejected** (blank name, null category, or simultaneously setting `validated=false` while publishing) | `UT-TRANSITION-VALIDATED-DISALLOWED-01` |
| **`validated`** | `published` (valid) | Allowed | `UT-TRANSITION-ALLOW-01` |
| `published` | `draft` / `validated` | **Rejected** (`A published exhibit cannot return to draft or validated state`) | `UT-TERMINAL-01` |
| `published` | `published` | Allowed (idempotent no-op) | `UT-TRANSITION-ALLOW-NOOP-01` |

---

## 3. Server-Side 100% Branch Coverage & Line-by-Line Out-of-Scope Defense

Running `pnpm --filter @museumos/api exec vitest run test/team --coverage` (CI-gated via `apps/api/vitest.config.ts`) and `pnpm test:coverage:all` (`46/46` passing tests across 5 files; `docs/team/evidence/coverage/coverage-all-business-logic.json`) achieves **100.00% branch coverage across all four scoped modules**:

| File | Statements | Branches | Functions | Lines | CI Threshold Gate |
|---|---:|---:|---:|---:|---|
| `apps/api/src/exhibits/exhibit-workflow.ts` | **100.00%** (39/39) | **100.00%** (30/30) | **100.00%** (5/5) | **100.00%** (39/39) | 100% Stmts/Branch/Func/Lines |
| `apps/api/src/auth/guards/permission.guard.ts` | **100.00%** (24/24) | **100.00%** (11/11) | **100.00%** (2/2) | **100.00%** (24/24) | 100% Stmts/Branch/Func/Lines |
| `apps/api/src/exhibits/exhibits.controller.ts` | 53.99% (in-scope 100%) | **100.00%** | 28.00% | 53.99% | 100% Branch Gate (`test:coverage:all`) |
| `apps/api/src/exhibits/exhibits.service.ts` | 46.01% (in-scope 100%) | **100.00%** | 50.00% | 46.01% | 100% Branch Gate (`test:coverage:all`) |
| **Combined Scoped Total** | **53.86%** | **100.00%** | **45.83%** | **53.86%** | **`--coverage.thresholds.branches=100`** |

### Line-by-Line Justification for Uncovered Statements Outside W1/W2 Workflow Scope

Every uncovered statement line in `exhibits.controller.ts` and `exhibits.service.ts` is explicitly excluded by `docs/team/planning/scope.md` (and never executes during W1 create or W2 validate/publish):
- **`exhibits.controller.ts`:**
  - Lines `50–181`: `search`, `export` (`toCsv`), `stats`, `manufacturers`, `attributeValues`, `lookup`, `resolveMentions` — catalogue query, analytics, and CSV export endpoints (search verified at integration/E2E level in `api-e2e.mjs` and `UC-04`).
  - Lines `312–423`, `439–455`: `setTags`, `bulkUpdate`, `uploadImages`, `reorderImages`, `updateImage`, `rotateImage`, `deleteImage`, and CSV serialization helpers — tag management, bulk admin batch editing, and Sharp/MinIO image upload pipeline (outside W1/W2 scope).
- **`exhibits.service.ts`:**
  - Lines `148–250`: `stats`, `listManufacturers`, `listAttributeValues`, `lookupMany` — dashboard timeline statistics, dropdown autocomplete distinct queries, and label-printing batch lookups.
  - Lines `269–364`: `findSimilar` — PostgreSQL `pg_trgm` fuzzy duplicate similarity scoring.
  - Lines `421–542`: `setTags`, `bulkUpdate`, and category-attribute JSON filtering helpers.
