# Defect and Root-Cause Evidence

## DEF-001: Unvalidated exhibit could be published

- Severity: Major; priority: P1; risk: P1/P5; status: Fixed locally; hosted issue not created.
- Evidence: initial API reproduction accepted `PATCH /exhibits/:id` with `{"published":true}` while `validated=false`; the corrected API rejects it with 400. Unit, API, and browser precondition tests pass.
- Root cause: the update schema accepted lifecycle booleans, and the service persisted them without transition guards.
- 5 Whys: (1) Why publish invalidly? The update wrote `published=true`. (2) Why did it write? No transition check ran. (3) Why no check? Validation checked types, not state invariants. (4) Why were invariants absent? Flags were treated as independent values. (5) Why was this missed? The test plan lacked direct-publish and terminal-state cases.
- Fishbone: requirements - invariant omitted; design - state not modeled; implementation - direct boolean patch; tests - precondition absent; process - review focused on schemas. Corrective action: central `exhibit-workflow.ts` guard. Preventive action: decision-table unit tests plus API and UI regression tests.

## DEF-002: Search setup silently failed and exhibit search returned 500

- Severity: Major; priority: P1; risk: P6; status: Fixed locally; hosted issue not created.
- Evidence: seed did not create the immutable search function because Prisma rejected a multi-command prepared statement; the seeder swallowed the exception. Existing `search_tsv` was a plain column because an earlier `ADD COLUMN IF NOT EXISTS ... GENERATED` skipped a pre-existing plain column. Full-text search then returned 500 and did not reflect updates.
- 5 Whys: (1) Why did search fail? `immutable_unaccent(text)` was missing and the tsvector was stale. (2) Why missing? Multi-statement SQL failed under Prisma's prepared execution. (3) Why did setup claim success? The catch block suppressed the error. (4) Why was tsvector not repaired? `IF NOT EXISTS` treated the old plain column as complete. (5) Why was this not caught? No post-seed schema assertion or search read-back test existed.
- Fishbone: setup - unsupported multi-command execution; code - swallowed database error; schema - invalid plain column persists; verification - no index/function checks; test - no mutable-search check.
- Corrective action: split SQL statements safely, propagate seed errors, add a forward migration that replaces the derived generated column and GIN index. Verification: migration deployed and seed reports eight search statements configured.
- Preventive action: add full-text search query to the DB smoke gate and verify the column generation expression after migration.

## DEF-003: Curator could change lifecycle state

- Severity: Major; priority: P1; risk: P2; status: Fixed locally; hosted issue not created.
- Evidence: before correction, curator `PATCH` with `{"validated":true}` returned 200. After correction, same role/action returns 403. `docs/team/evidence/security/access-checks.json` records viewer/curator allow and deny outcomes.
- 5 Whys: (1) Why could curator validate? The update route allowed any authenticated editor. (2) Why? It guarded edit permission only. (3) Why did edit allow lifecycle fields? The generic update DTO included them. (4) Why no separate permission? Role tests checked read/create, not sensitive flags. (5) Why missed in design? Lifecycle permission was not explicitly mapped at the controller boundary.
- Fishbone: security model - validation permission distinct from edit; controller - missing authorization guard; DTO - mixes ordinary and sensitive changes; tests - permission matrix incomplete; process - no negative role test.
- Corrective action: reject lifecycle changes unless `admin` or `exhibit:validate` **when `validated` or `published` actually changes relative to the stored exhibit**, and strip unchanged lifecycle flags in `apps/web/src/pages/exhibit-detail.tsx` (`handleSave`) so curator metadata-only edits (`UC-05`) are not rejected with `403`. Both `exhibits-controller-workflow.test.ts` and live `tests/team/uc03-uc04-access-search.spec.ts` (`UC-03`, `access-checks.json`) + `uc05-uc06-edit-recovery.spec.ts` (`UC-05`) verify the fix. Preventive action: add positive and negative authorization cases for every role and sensitive action, and execute live browser E2E against API RBAC guards.

## Pareto summary

| Root-cause class | Defects | Count | Share |
|---|---|---:|---:|
| Missing business/security invariant enforcement | DEF-001, DEF-003 | 2 | 66.7% |
| Database setup and schema drift | DEF-002 | 1 | 33.3% |
| **Total confirmed major defects** |  | **3** | **100%** |

This is a descriptive sample of three defects found during this project, not a claim about production defect frequency. All three are locally fixed; upstream integration and team review are still required.

## Issue tracking

The defects are linked to the local risk IDs above. No GitHub Issues were created: the available `origin` points to upstream and there is no authorized team repository/identity in this workspace. Do not represent these local defect records as hosted issues. After the team creates/uses its own repository, file one issue per DEF and add the resulting URLs here.
