# Performance and Recovery Evidence

## Read workload

Operation: authenticated `GET /api/exhibits/:id`; each run creates one synthetic record, executes the fixed-duration read scenario, and soft-deletes its fixture during teardown. Each 60-second run uses the same local Windows/Docker PostgreSQL environment and application build. k6 runs inside `grafana/k6` Docker, connecting to the host API at `host.docker.internal:3000`.

| Run | VUs | Duration | p95 (ms) | Mean (ms) | Throughput (req/s) | Failed HTTP requests |
|---|---:|---:|---:|---:|---:|---:|
| 1-user run 1 | 1 | 60s | 27.77 | 19.09 | 1.05 | 0 / 63 (0%) |
| 5-user run 1 | 5 | 60s | 24.41 | 15.85 | 4.97 | 0 / 304 (0%) |
| 1-user run 2 | 1 | 60s | 28.16 | 24.95 | 1.04 | 0 / 63 (0%) |
| 5-user run 2 | 5 | 60s | 16.40 | 12.71 | 4.99 | 0 / 304 (0%) |

Acceptance targets were p95 <= 500ms and unexpected HTTP failure rate <1%; both are met in all four runs. Raw k6 JSON summaries are `docs/team/evidence/performance/k6-*.json`. Throughput shown is k6's total HTTP request rate including one-time setup and teardown; almost all requests are the target read. Check metrics show every authenticated read returned 200.

## Recovery check

1. **Isolated Service Mock Test (`apps/api/test/team/exhibit-recovery.test.ts`):** Injects a write failure before persistence, verifies the persisted year remains unchanged (`2000`), retries the same update (`2025`), and asserts one record remains with zero duplicates.
2. **Real PostgreSQL Integration Recovery Test (`apps/api/test/team/exhibit-recovery.integration.ts` → `docs/team/evidence/api/db-recovery-run.json`):** Executed live against Docker PostgreSQL 16 (`museumos_sqe_test`). Injects a genuine PostgreSQL `P2003` foreign-key constraint violation (`exhibits_updated_by_fkey`) on `ExhibitsService.update`, confirms persisted state remains `year: 1980` and `recordsWithId: 1`, retries twice with valid `admin.id`, asserts `year: 2024` and `recordsWithId: 1` (zero duplicates), and deletes the fixture in `finally`. Result: **PASS**.
3. **Browser-Level Network Abort & Retry (`UC-06` in `tests/team/uc05-uc06-edit-recovery.spec.ts`):** Intercepts `PATCH /api/exhibits/:id` once (`route.abort('failed')`), verifies UI error feedback and unchanged `year=1988` in API read-back, retries Save to persist `year=1999`, and confirms single-row idempotency. Result: **PASS**.

## Limits

These are local synthetic measurements, not production capacity claims. The runs used a local Docker database and single developer machine. Repeat on the instructor's standardized environment if the rubric requires a separate host or a cold-cache run. Add a recovery test using an actual transient database outage for stronger failure-injection evidence.
