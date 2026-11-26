# Performance and Recovery Evidence

## 1. Execution Environment & Tooling Specs

All load tests and database failure-recovery checks executed on the same local test workstation against isolated Docker containers:
- **CPU:** 12th Gen Intel(R) Core(TM) i5-12450HX
- **Memory:** 23.7 GB physical RAM
- **Operating System:** Windows 11 (Docker Desktop Engine `29.8.1`)
- **Runtime Toolchain:** Node.js `v26.5.0`, pnpm `10.33.2`, NestJS `11.1.19` + Prisma `6.19.3`
- **Database & Load Runner:** PostgreSQL `16-alpine` (`museumos-db`), Grafana `k6` Docker container connecting to host API `http://host.docker.internal:3000/api` (`scripts/team/k6-exhibit-read.js`).

## 2. Authenticated Read Workload (`GET /api/exhibits/:id`)

Each 60-second k6 run creates one isolated synthetic exhibit during `setup()`, executes authenticated `GET /api/exhibits/:id` with **`sleep(1)`** (1-second per-VU think time between iterations), and soft-deletes its fixture during `teardown()`:

| Run | VUs | Duration | Total Requests | p95 Latency (ms) | Mean (ms) | Throughput (req/s) | HTTP Failure Rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1-user run 1 | 1 | 60s | 63 | 27.77 | 19.09 | 1.05 | 0 / 63 (**0.00%**) |
| 5-user run 1 | 5 | 60s | 304 | 24.41 | 15.85 | 4.97 | 0 / 304 (**0.00%**) |
| 1-user run 2 | 1 | 60s | 63 | 28.16 | 24.95 | 1.04 | 0 / 63 (**0.00%**) |
| 5-user run 2 | 5 | 60s | 304 | 16.40 | 12.71 | 4.99 | 0 / 304 (**0.00%**) |

Raw k6 JSON summaries are preserved in `docs/team/evidence/performance/k6-*.json` plus smoke check `k6-smoke-summary.json`.

### Analytical Justification & Interpretation
1. **Why `p95 <= 500 ms` and HTTP failures `< 1%` suit single-record read (`GET /api/exhibits/:id`):** Curators opening exhibit detail pages expect interactive navigation (< 0.5 s round-trip without spinner stall), while an indexed UUID primary-key query with session validation normally completes in `< 50 ms`. A strict `< 1%` failure rate catches silent connection-pool exhaustion, 429 throttle collisions, or session errors cleanly; all 4 runs achieved `16.40–28.16 ms` (`< 6%` of budget) and `0.00%` failures.
2. **Why `5` VUs produced lower p95 latency (`16.40–24.41 ms`) than `1` VU (`27.77–28.16 ms`):** The 1-VU baseline runs warmed up V8 JIT paths, Prisma statement caches, and PostgreSQL shared memory buffers for the exhibit table/session store, while subsequent 5-VU runs hit warmed caches. Furthermore, `5 VUs × ~1 req/s` (`~4.98 req/s`) stays far below Postgres/NestJS thread-pool saturation, so amortized session-store & connection-pool reuse yields lower tail latency than cold serial 1-VU calls.
3. **Role of `sleep(1)` in `k6-exhibit-read.js`:** Enforces a realistic **1-second curator think time** per virtual user (`~1 iter/s` per VU) rather than an unthrottled tight loop, keeping traffic well within MuseumOS's production `ThrottlerGuard` (`20 req/1s`, `100 req/10s`) while directly measuring service/DB latency instead of artificial `429` rejections.

## 3. Three-Layer Failure & Recovery Verification

| Layer | Evidence File / Script | Failure Injected | Observed Pre-Retry State | Retry & Post-Recovery Outcome |
|---|---|---|---|---|
| **1. Isolated Unit Mock** | `apps/api/test/team/exhibit-recovery.test.ts` | Simulated repository write exception during update | Persisted `year = 2000`, `1` record | Retry succeeded (`year = 2025`, `1` record, zero duplicates) |
| **2. Real PostgreSQL Outage (`docker stop` / `docker start`)** | `scripts/team/run-db-outage-recovery.ps1` → `docs/team/evidence/api/db-outage-recovery-run.json` (captured 2026-11-26) | Created fixture (`year = 1980`), executed **`docker stop museumos-db`**, sent `PATCH` `{ year: 2024 }` (**HTTP `500`** returned cleanly without hang or partial commit), then ran **`docker start museumos-db`** + `pg_isready` | First API query evicted dead `pg-pool`/Prisma socket; attempt `2` (`reconnectAttemptsAfterPgReady = 2`) read `year = 1980`, `recordsWithId = 1` | Repeated `PATCH` `{ year: 2024 }` twice -> both returned `200`, read-back confirmed `year = 2024`, `recordsWithId = 1` (**zero duplicates**, soft-deleted in `finally`) |
| **3. Live DB FK Constraint + Browser Abort** | `exhibit-recovery.integration.ts` (`db-recovery-run.json`) + `UC-06` Playwright specs (`tests/team/uc05-uc06-edit-recovery.spec.ts`) | Real PostgreSQL `P2003` FK violation (`exhibits_updated_by_fkey`) + browser `route.abort('failed')` / HTTP `503` on UI Save | Preserved `year = 1980` (`P2003`) and `year = 1988` (`UC-06`), displayed `.text-destructive` banner | Retry updated existing row cleanly (`year = 2024` / `1999`), single record verified (`recordsWithId = 1`) |

## 4. Known Limits
- Load metrics reflect single-workstation loopback Docker Postgres execution at 1–5 VUs (`<= 5 req/s`) rather than multi-node production horizontal scaling or stress saturation testing (`100+` VUs), and one dead-socket eviction request (`reconnectAttemptsAfterPgReady = 2`) occurred immediately after `docker start museumos-db` before Prisma/pg-pool resumed normal serving.
