# Mutation Analysis

Scope: `apps/api/src/exhibits/exhibit-workflow.ts`; StrykerJS 10.1.1 with Vitest. The initial run had 7 tests. The expanded run has 16 tests directly related to the workflow module (plus one independent recovery test in the team unit suite).

## Measured results

| Run | Mutants | Killed | Survived | No coverage | Score |
|---|---:|---:|---:|---:|---:|
| Initial | 93 | 75 | 9 | 9 | 80.65% |
| Expanded (rerun 2026-11-23) | 93 | 91 | 2 | 0 | 97.85% |

The latest expanded suite clears the configured 80% break threshold. Nine initial `NoCoverage` cases are not classified as survivors. The 8-row publish decision table covers those paths. Two string-label changes survive; they replace internal `validated`/`draft` labels that the guards only use as a non-published state discriminator. They are equivalent for the tested transition behavior and do not change state output, so no assertion can distinguish them without changing the API/design. They are documented rather than hidden. Latest raw JSON was copied to `docs/team/evidence/mutation/mutation-final.json` and HTML is in `reports/mutation/mutation.html`.

## Fifteen initially non-killed mutants reviewed

The assignment asks for 15 survivors. The initial run produced only 9 true Stryker `Survived` mutants, so this review uses 15 initially non-killed mutants and explicitly distinguishes status. The final run resolves 13 of these; the two survivors are the equivalent string-label cases.

| Initial mutant | Initial status | Change class and location | Final disposition |
|---|---|---|---|
| 52 | NoCoverage | Block statement, line 39 | Killed after branch cases added |
| 53 | NoCoverage | Object literal, line 40 | Killed after branch cases added |
| 54 | NoCoverage | Boolean literal, line 40 | Killed after branch cases added |
| 55 | NoCoverage | String literal, line 40 | Killed after branch cases added |
| 59 | NoCoverage | Block statement, line 42 | Killed after branch cases added |
| 60 | NoCoverage | Object literal, line 43 | Killed after branch cases added |
| 61 | NoCoverage | Boolean literal, line 43 | Killed after branch cases added |
| 62 | NoCoverage | String literal, line 43 | Killed after branch cases added |
| 65 | NoCoverage | String literal, line 51 | Covered; remains equivalent survivor |
| 49 | Survived | Conditional expression, line 39 | Killed by year/price edge assertions |
| 51 | Survived | Method expression, line 39 | Killed by whitespace name assertion |
| 57 | Survived | Conditional expression, line 42 | Killed by missing-category decision cases |
| 64 | Survived | String literal, line 50 | Equivalent survivor (internal `validated` label) |
| 69 | Survived | Conditional expression, line 53 | Killed by full decision table |
| 77 | Survived | String literal, line 58 | Killed by exact transition-reason assertion |

The first run's 9 actual survivors comprised weak assertions and state-precondition gaps; the test additions specifically cover each. A supplemental source-level custom mutation script is now available as `pnpm test:mutation:custom`. It compiles four domain mutations and kills all four against named boundary oracles (100% for this 4-mutant supplemental scope). This is separately reported and is not merged into Stryker's 97.85% score. The 15-initially-nonkilled analysis above distinguishes the 9 true survivors from 6 no-coverage mutants. Raw JSON/HTML reports are in `docs/team/evidence/mutation/mutation-*.json`, `docs/team/evidence/mutation/custom-mutators.json` and `reports/mutation/`.
