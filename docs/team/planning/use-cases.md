# Use-case specification

Scope: exhibit catalogue creation and administrator validation/publication. All six use cases now have automated Playwright test scenarios implemented in `tests/team/` (`uc01-uc02-workflows.spec.ts`, `uc03-uc04-access-search.spec.ts`, `uc05-uc06-edit-recovery.spec.ts`) and verified via `npx playwright test --list`; live browser execution awaits local Docker/API/web server startup.

## UC-01 — Create an exhibit (Burhan Ahmed, 24I-3030)

**Primary actor:** Curator. **Precondition:** authenticated, has exhibit create permission, category exists. **Main flow:** open catalogue; choose create; enter name/category and optional year/price; submit; system validates, persists once, returns display ID; user opens detail and confirms values. **Postcondition:** one draft record exists.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-01-A1 | Optional year and price omitted | Create succeeds with null values | Implemented (`uc01-uc02-workflows.spec.ts`; live rerun pending) |
| UC-01-A2 | User corrects a blank required name | Corrected create succeeds via keyboard | Implemented & prior local pass (`uc01-uc02-workflows.spec.ts`) |
| UC-01-E1 | Required name missing/blank | Create disabled in UI; API returns 400 | Implemented (`uc01-uc02-workflows.spec.ts`; live rerun pending) |
| UC-01-E2 | Category missing/unknown | Create disabled or 400 validation response | Implemented (`uc01-uc02-workflows.spec.ts`; live rerun pending) |

## UC-02 — Validate and publish an exhibit (Ali Akbar, 24I-3079)

**Primary actor:** Administrator. **Precondition:** authenticated administrator; exhibit is draft and has required fields. **Main flow:** open draft; review; validate; publish; verify terminal state. **Postcondition:** record is published and remains one record.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-02-A1 | Administrator validates but defers publishing | Record remains validated | Implemented (`uc01-uc02-workflows.spec.ts`; live rerun pending) |
| UC-02-A2 | Administrator repeats publish request | Same record, idempotent state | Implemented (`uc01-uc02-workflows.spec.ts` + `api-e2e.mjs`) |
| UC-02-E1 | Publish before validation | 400; UI error shown; state unchanged | Implemented & prior local pass (`uc01-uc02-workflows.spec.ts`) |
| UC-02-E2 | Attempt published-to-draft/validated transition | Rejected 400; published state retained | Implemented (`uc01-uc02-workflows.spec.ts`; unit pass; live rerun pending) |

## UC-03 — Access control and safe recovery (Huzaifa Ali, 24I-3114)

**Primary actor:** Viewer, curator, or administrator. **Precondition:** catalogue service is available. **Main flow:** viewer reads catalogue; curator performs permitted create; administrator performs lifecycle action; session cookies checked. **Postcondition:** only permitted roles change state.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-03-A1 | Curator creates a record then administrator validates it | Role-specific handoff succeeds | Implemented (`uc03-uc04-access-search.spec.ts`; live rerun pending) |
| UC-03-A2 | Session cookie attributes checked on login | `httpOnly=true`, `sameSite=Lax` verified | Implemented (`uc03-uc04-access-search.spec.ts`; live rerun pending) |
| UC-03-E1 | Viewer attempts create; curator attempts validate/publish | 403; no state change | Implemented (`uc03-uc04-access-search.spec.ts`; prior 5 checks logged) |
| UC-03-E2 | Authenticated user requests nonexistent exhibit | 404; no record mutation | Implemented (`uc03-uc04-access-search.spec.ts`; live rerun pending) |

## UC-04 — Search and inspect an exhibit (Burhan Ahmed, 24I-3030)

**Primary actor:** Viewer/Admin. **Precondition:** catalogue is available. **Main flow:** open catalogue; search by name; open result; confirm display ID. **Postcondition:** no data is changed.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-04-A1 | Search narrowed by category filter | Matching results only | Implemented (`uc03-uc04-access-search.spec.ts`; live rerun pending) |
| UC-04-A2 | Search has no matching result | "No exhibits found" empty state | Implemented (`uc03-uc04-access-search.spec.ts`; live rerun pending) |
| UC-04-E1 | Search/filter text contains invalid/unsupported values | Safe 400/empty response; no 500 | Implemented (`uc03-uc04-access-search.spec.ts`; live rerun pending) |
| UC-04-E2 | User opens an unknown exhibit ID | "Exhibit not found" UI shown cleanly | Implemented (`uc03-uc04-access-search.spec.ts`; live rerun pending) |

## UC-05 — Correct exhibit data before validation (Ali Akbar, 24I-3079)

**Primary actor:** Curator. **Precondition:** authenticated curator can edit an unvalidated draft. **Main flow:** open draft; update allowed metadata; save; read back changed values. **Postcondition:** metadata persisted and lifecycle remains draft.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-05-A1 | Curator clears optional year or price | Null is persisted | Implemented (`uc05-uc06-edit-recovery.spec.ts`; live rerun pending) |
| UC-05-A2 | Curator updates name within limits | Update and read-back succeed | Implemented (`uc05-uc06-edit-recovery.spec.ts`; live rerun pending) |
| UC-05-E1 | Curator submits out-of-range year (1799) | 400 error shown; previous data remains | Implemented (`uc05-uc06-edit-recovery.spec.ts`; live rerun pending) |
| UC-05-E2 | Curator attempts lifecycle mutation | 403 Forbidden; no lifecycle change | Implemented (`uc05-uc06-edit-recovery.spec.ts`; live rerun pending) |

## UC-06 — Recover safely from a failed write (Huzaifa Ali, 24I-3114)

**Primary actor:** Curator or administrator. **Precondition:** record exists and database is available. **Main flow:** issue update; transient failure occurs; confirm old data remains; retry; confirm one updated row. **Postcondition:** one consistent row remains.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-06-A1 | Retry succeeds immediately after failure | Same ID reflects requested value | Implemented (`uc05-uc06-edit-recovery.spec.ts` + mocked unit) |
| UC-06-A2 | Client repeats identical save request | Idempotent outcome; single record | Implemented (`uc05-uc06-edit-recovery.spec.ts`; live rerun pending) |
| UC-06-E1 | Transient network/DB failure on save | Error displayed; old data (1988) retained | Implemented (`uc05-uc06-edit-recovery.spec.ts` + DB script ready) |
| UC-06-E2 | Fixture cleanup / DB foreign-key failure | `afterEach` & `finally` blocks clean up | Implemented (`exhibit-recovery.integration.ts` + `helpers.ts`) |
