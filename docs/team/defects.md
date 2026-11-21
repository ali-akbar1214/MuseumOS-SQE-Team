# Defect Evidence

## DEF-001: Unvalidated exhibit could be published

- Severity: Major
- Priority: P1
- Status: Fixed
- Triage: Accepted and assigned to lifecycle implementation
- API evidence: before fix, `PATCH /exhibits/:id` with `{"published":true}` returned 200 when `validated=false`; after fix it returns 400
- Root cause: `updateExhibitSchema` accepted lifecycle flags but `ExhibitsService.update` wrote them without checking allowed transitions
- 5 Whys:
  1. Why could it publish? The update path persisted `published=true` directly.
  2. Why was it persisted? Validation only checked Zod field types.
  3. Why did Zod not catch it? Zod saw the value as a valid boolean.
  4. Why was no state rule present? Lifecycle invariants were not enforced by the server service.
  5. Why did that happen? The original implementation treated lifecycle flags as independent fields.
- Fishbone: requirements -> lifecycle invariant omitted; design -> flags independent; implementation -> no transition guard; testing -> missing publish precondition test.
- Corrective action: add `exhibit-workflow.ts` and call transition validation in the controller.
- Preventive action: unit, API, and state-transition tests on every lifecycle flag change.
- Linked risk: P1
