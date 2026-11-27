# Use-case specification

Scope: exhibit catalogue creation (W1) and administrator validation/publication (W2). All **six use cases (30 discrete flows: Main + A1/A2/E1/E2)** are implemented 1-test-per-flow in `tests/team/` (`uc01-uc02-workflows.spec.ts`, `uc03-uc04-access-search.spec.ts`, `uc05-uc06-edit-recovery.spec.ts`) and executed **live against isolated Docker PostgreSQL (`museumos_sqe_test`) with 30/30 passing** (`docs/team/evidence/e2e/playwright-report.html`).

## UC-01 — Create an exhibit (Burhan Ahmed, 24I-3030)

**Primary actor:** Curator / Admin. **Precondition:** authenticated with `exhibit:write` permission, at least one category exists. **Main flow:** open catalogue; click Add Exhibit; enter name, category, optional year; submit; system validates, persists draft once, returns display ID; user opens detail and confirms values. **Postcondition:** one draft record exists (`validated=false, published=false`).

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-01 Main | Create exhibit via UI with category, name, year | Persists once; `displayId`, `acquiredAt` & `0` axe violations verified | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |
| UC-01-A1 | Optional year and collectible price omitted | Create succeeds with `null` values in read-back | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |
| UC-01-A2 | User corrects whitespace name and uses keyboard | Corrected create submits cleanly via `Tab` + `Enter` | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |
| UC-01-E1 | Required name missing/blank | `Create` disabled in UI; API `POST` returns `400` | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |
| UC-01-E2 | Category missing or malformed UUID | `Create` disabled in UI; API `POST` returns `400` | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |

## UC-02 — Validate and publish an exhibit (Syed Ali Akbar Naqvi, 24I-3079)

**Primary actor:** Administrator / Senior Curator (`exhibit:validate`). **Precondition:** authenticated administrator; exhibit exists in draft with required fields. **Main flow:** open draft; validate; save; publish; verify terminal state and `0` axe violations. **Postcondition:** record is published (`validated=true, published=true`) and remains one record.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-02 Main | Validate draft then publish via UI toggles | Persists `validated=true, published=true`; `0` axe violations | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |
| UC-02-A1 | Administrator validates but defers publishing | Record remains `validated=true, published=false` | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |
| UC-02-A2 | Administrator repeats publish request | Idempotent `200`; search confirms single matching row | **Executed & Passing** (`uc01-uc02-workflows.spec.ts` + `api-e2e.mjs`) |
| UC-02-E1 | Direct publish before validation | Rejected with UI error guidance; state stays draft | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |
| UC-02-E2 | Attempt published-to-draft/validated revert | Rejected (`400` / error banner); published state retained | **Executed & Passing** (`uc01-uc02-workflows.spec.ts`) |

## UC-03 — Access control and role boundaries (Huzaifa Ali, 24I-3114)

**Primary actor:** Unauthenticated guest, Viewer, Curator, or Administrator. **Precondition:** catalogue service is available. **Main flow:** viewer reads UI catalogue; curator hands off draft to admin; session cookie attributes & 401/403 boundaries checked with read-back proofs. **Postcondition:** only permitted roles mutate state.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-03 Main | Viewer opens UI catalogue | Header shows `viewer` badge; `GET /api/exhibits` returns `200` | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-03-A1 | Curator creates draft; admin validates in UI | Role-specific handoff succeeds (`validated=true` read-back) | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-03-A2 | Cookie flags & unauthenticated redirect/401s | `httpOnly=true`, `sameSite=Lax`; `/exhibits`→`/login`; APIs `401` + read-back | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-03-E1 | Viewer create/validate & curator validate/publish | UI denial + API `403` + read-back after every denial (`access-checks.json` 11/11) | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-03-E2 | Authenticated user requests nonexistent UUID | API returns `404`; UI renders `Exhibit not found` | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |

## UC-04 — Search and inspect an exhibit (Burhan Ahmed, 24I-3030)

**Primary actor:** Viewer/Admin. **Precondition:** catalogue is available. **Main flow:** search by unique name in UI, click match, verify detail `displayId`, confirm `updatedAt` unchanged. **Postcondition:** no data is mutated.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-04 Main | Search by unique name & inspect detail | Row visible (`200`), detail matches, `updatedAt` unchanged | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-04-A1 | Narrow search by category filter | Matching category shows item; non-matching shows empty state | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-04-A2 | Search has no matching result | `"No exhibits found"` empty state displayed cleanly | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-04-E1 | Special characters / invalid `yearFrom` filter | Clean empty UI; API `yearFrom=notanumber` returns `400` (no `500`) | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |
| UC-04-E2 | User opens unknown exhibit UUID in browser | `"Exhibit not found"` UI state displayed cleanly | **Executed & Passing** (`uc03-uc04-access-search.spec.ts`) |

## UC-05 — Correct exhibit data before validation (Syed Ali Akbar Naqvi, 24I-3079)

**Primary actor:** Curator. **Precondition:** curator edits an unvalidated draft exhibit. **Main flow:** edit name/year/price in UI; save; read back changed values. **Postcondition:** metadata persisted and lifecycle stays draft.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-05 Main | Curator edits draft metadata in UI | Heading/metadata updated (`year=1994, price=125`); draft kept | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-05-A1 | Curator clears optional year and price | `null` persisted cleanly in PostgreSQL read-back | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-05-A2 | Curator updates name within limits | Update in UI and API read-back succeed | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-05-E1 | Curator submits out-of-range year (`1799`) | UI error banner shown; prior `year=1995` retained | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-05-E2 | Curator attempts lifecycle `PATCH` escalation | Rejected `403 Forbidden`; `validated=false, published=false` kept | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |

## UC-06 — Recover safely from a failed write (Huzaifa Ali, 24I-3114)

**Primary actor:** Curator / Administrator. **Precondition:** record exists and DB is reachable after transient fault. **Main flow:** intercept `PATCH` abort; confirm old `year=1988` persists; retry save; confirm `year=1999` with single row. **Postcondition:** one consistent row remains.

| ID | Alternative / exception flow | Expected result | Automation status |
|---|---|---|---|
| UC-06 Main | Transient abort then retry save in UI | Error shown (`year=1988` kept); retry persists `year=1999` | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-06-A1 | Immediate retry after HTTP `503` failure | Edit exits cleanly; same ID persists `year=2001` | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-06-A2 | Repeat identical `PATCH` request | Idempotent `200`; search confirms single record | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-06-E1 | HTTP `503` failure without retry | `.text-destructive` shown; old `year=1988` untouched | **Executed & Passing** (`uc05-uc06-edit-recovery.spec.ts`) |
| UC-06-E2 | Fixture cleanup & PostgreSQL recovery suite | Deleted fixture returns `404`; live DB stop/start & `P2003` recovery pass | **Executed & Passing** (`uc05-uc06` + `db-outage-recovery-run.json`) |
