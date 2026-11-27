# Mutation Analysis

Scope: widened mutation testing across **three core server modules** (`apps/api/src/exhibits/exhibit-workflow.ts`, `apps/api/src/auth/guards/permission.guard.ts`, and `apps/api/src/exhibits/exhibits.controller.ts:183-310`) using **StrykerJS 10.1.1** (`@stryker-mutator/vitest-runner`, break threshold **80%**).

## 1. Measured Results Progression

| Run | Scope Mutated | Total Mutants | Killed | Timeout | Survived | No Coverage | Mutation Score |
|---|---|---:|---:|---:|---:|---:|---:|
| Initial baseline | `exhibit-workflow.ts` (7 tests) | 93 | 75 | 0 | **9** | **9** | **80.65%** |
| Expanded lifecycle | `exhibit-workflow.ts` (16 tests) | 93 | 91 | 0 | 2 | 0 | **97.85%** |
| **Widened pre-kill** (`exhibit-workflow` + `permission.guard` + `exhibits.controller:183-310`) | 3 core files (46 tests) | 194 | 175 | 0 | **17** | **2** | **90.21%** |
| **Widened final (2026-11-26)** | **3 core files (46 tests)** | **194** | **190** | **2** | **2** | **0** | **98.97%** |

- **Evidence Files:** `docs/team/evidence/mutation/mutation-initial.json`, `docs/team/evidence/mutation/mutation-final.json`, and HTML report `reports/mutation/mutation.html`.
- **Break Threshold Justification (`80%`):** Derived from baseline initial capability (`80.65%`) so CI fails immediately if assertion quality regresses below initial suite strength, while W1/W2 business logic + RBAC enforcement far exceed the floor (**98.97%** total, **100.00%** on `permission.guard.ts` [23/23] and `exhibits.controller.ts` W1/W2 methods [78/78], and **97.85%** on `exhibit-workflow.ts` [91/93]).

## 2. Real-Vitest Custom Domain Mutators (`pnpm test:mutation:custom`)

`scripts/team/custom-mutators.mjs` injects four domain-specific AST/source mutations directly into `apps/api/src/exhibits/exhibit-workflow.ts` on disk (with `try/finally` restoration) and executes the **real Vitest unit suite** (`exhibit-workflow.test.ts` + `exhibit-contracts.test.ts`):

| Custom Operator ID | Mutation Applied in `exhibit-workflow.ts` | Suite Exit Code | Result |
|---|---|---:|---|
| `PRICE-INCLUSIVE-ZERO` | `price >= 0` → `price > 0` | `1` (failed) | **KILLED** |
| `YEAR-INCLUSIVE-LOWER` | `year >= 1800` → `year > 1800` | `1` (failed) | **KILLED** |
| `YEAR-INCLUSIVE-UPPER` | `year <= 2100` → `year < 2100` | `1` (failed) | **KILLED** |
| `PUBLISH-AND-OR` | `validated && name > 0 && category !== null` → `validated \|\| ...` | `1` (failed) | **KILLED** |
| **Supplemental Score** | **Real Vitest oracle (4/4 killed)** | — | **100.00%** |

*(Reported separately from Stryker's 98.97% score; evidence in `docs/team/evidence/mutation/custom-mutators.json`.)*

## 3. Initial Non-Killed Mutants & Widened Survivor Analysis

In the initial 7-test baseline (`mutation-initial.json`), **18 mutants** were not killed — exactly **9 `Survived`** and **9 `NoCoverage`** (explicitly distinguishing `NoCoverage` from genuine `Survived`, including the line 61–62 terminal-guard mutants `#84`, `#86`, `#90` omitted in earlier drafts):

| Baseline Mutant | Initial Status | Location & Mutator | Resolution |
|---|---|---|---|
| `49`, `51` | **Survived** | L39 Conditional `false` & Method `exhibitName` | Killed by blank/whitespace name & reason assertions |
| `57` | **Survived** | L42 Conditional `false` | Killed by `categoryId: null` decision-table & reason assertions |
| `64` | **Survived** | L50 StringLiteral `'validated' -> ""` | Covered; **equivalent survivor** (ternary discriminant feeds only `next === 'published'`) |
| `69`, `77` | **Survived** | L53 Conditional `true` & L58 reason string `""` | Killed by full 8-row `isPublishAllowed` table & exact reason check |
| `84`, `86`, `90` | **Survived** | L61 Conditional `true`, `'published' -> ""`, L62 reason `""` | Killed by `UT-TERMINAL-01` exact published->draft/validated rejection & reason assertions |
| `52`–`55`, `59`–`62`, `65` | **NoCoverage (9)** | L39–43 required-field branches & L51 `'draft' -> ""` | 8 killed by `UT-TRANSITION-REJECT-REQUIRED-01`; `#65` (`'draft' -> ""`) remains **equivalent** |

### Widened Scope Genuine Survivors Killed (15/17 Killed Across `permission.guard.ts` & `exhibits.controller.ts`)

Expanding `stryker.config.json` to `permission.guard.ts` and `exhibits.controller.ts:183-310` initially uncovered **17 genuine `Survived` mutants and 2 `NoCoverage` mutants** (`90.21%`). Adding exact assertions killed **15/17 survivors + 2/2 no-coverage**:
- `permission.guard.ts:20` (`ArrayDeclaration []` for `[handler, class]`): Killed by asserting `reflector.getAllAndOverride` receives `[ctx.getHandler(), ctx.getClass()]` (`23/23` = **100%**).
- `exhibits.controller.ts:191-193` (`NoCoverage` on `similar`): Covered & killed by adding `controller.similar(exhibitId)` verification.
- `exhibits.controller.ts:210, 214` (`entityType: 'exhibit'`, create `diff` literal): Killed by asserting exact `auditService.log` payload object on `create`.
- `exhibits.controller.ts:238` (`Missing permission: exhibit:validate` string literal): Killed by asserting exact error message on curator validate rejection.
- `exhibits.controller.ts:258, 263-264` (`entityType`, `ip ?? null`, `userAgent ?? null` on `update`): Killed by testing both `makeReq('10.0.0.2', 'curator-ua')` and `makeReq()` and asserting logged `ip` and `userAgent`.
- `exhibits.controller.ts:282, 287, 301, 306` (`entityType` and `userAgent` on `softDelete` / `restore`): Killed by asserting exact audit metadata with and without request headers (`78/78` = **100%**).
- **Only 2 Equivalent Mutants Remain Across All 194 Mutants:** `exhibit-workflow.ts:50` (`'validated' -> ""`) and `exhibit-workflow.ts:51` (`'draft' -> ""`), which cannot affect any observable return value because `next` is compared solely against `'published'`.
