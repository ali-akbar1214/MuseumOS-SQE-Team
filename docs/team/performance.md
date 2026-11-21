# Performance and Recovery Plan

## Workload

Operation: authenticated `GET /exhibits/:id`.

- Target: p95 <= 500 ms.
- Unexpected-failure target: fewer than 1%.
- One-user run: 60 seconds after the chosen concurrency is reached.
- Five-user run: 60 seconds after the chosen concurrency is reached.
- Repeat both setups twice on the same machine/build/database state.
- k6 script: add `scripts/k6-exhibit-read.js` and run with `K6_BASE_URL=http://localhost:3000/api`.

## Recovery

The team will inject a dependency unavailable before a state-changing update. The persisted exhibit remains in the previous state, the dependency is restored, the retry succeeds once, and exactly one record remains.
