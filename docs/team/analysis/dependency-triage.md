# Production Dependency Advisory Triage (`SEC-DEP-01`)

**Snapshot source:** `pnpm audit --prod` (`docs/team/evidence/security/dependency-audit.json`, `docs/team/evidence/security/dependency-triage.csv`).  
**Exact Installed Versions Source:** Verified from workspace `node_modules/.pnpm` package store on 2026-11-26.  
**Summary:** 26 advisories across production dependencies (**1 Critical, 14 High, 8 Moderate, 3 Low**).  
**Status:** Open / triaged with explicit written decisions (no clean post-upgrade audit is claimed prior to package upgrades; tracked under Risk **`SEC-DEP-01`**).

---

## 1. Complete Reachability & Written Triage Decisions (All 26 Advisories)

| Advisory ID(s) | Severity | Package | Installed Version | Affected Range | Patched Target | Workflow Reachability (W1/W2) & Written Decision |
|---|---|---|---:|---|---|---|
| `1241210` | **Critical** (1) | `proxy-addr` | **`2.0.7`** | `>=1.1.0 <2.0.8` | `>=2.0.8` | **Reachable (`apps/api/src/main.ts` sets `trust proxy: 2`).** IPv4-mapped IPv6 address parsing could let a spoofed `X-Forwarded-For` bypass per-IP login `@Throttle` behind dual-stack proxies. **Decision:** Priority override `"proxy-addr": ">=2.0.8"` in `package.json` + auth rate-limit regression rerun before public Internet exposure (local dev loopback unaffected). |
| `1243074`, `1123976` | **High** (1), Low (1) | `body-parser` | **`2.2.2`** | `<2.4.0` / `<2.3.0` | `>=2.4.0` | **Reachable (`POST`/`PATCH /api/exhibits` JSON bodies).** Malformed compressed request trailing-byte DoS (`1243074`) and invalid limit edge (`1123976`). **Decision:** Pin `"body-parser": ">=2.4.0"` via `pnpm.overrides` and rerun `test:api` + `test:e2e`; accepted short-term for trusted intranet dev use. |
| `1243066` | **High** (1) | `zod` | **`3.25.76`** (`api`), **`4.6.7`** (transitive) | `<4.6.6` | `>=4.6.6` | **Mitigated at boundary.** `@museumos/contracts` & `apps/api` cap collection inputs (`bulkUpdateSchema` max 500 IDs, `exhibitName` max 500 chars), blocking unbounded allocation. **Decision:** Mitigated by schema bounds in W1/W2; evaluate Zod v4 minor alignment in next maintenance window. |
| `1121089`, `1193790`, `1193793`, `1243083`, `1121091`, `1193792` | **High** (4), Mod (1), Low (1) | `multer` | **`2.1.1`** | `<2.5.0` | `>=2.5.0` | **Not reachable in W1/W2 text catalogue & publish workflows.** Only mounted on `/api/exhibits/:id/images` (authenticated curators/admins, 25 MB / 10 file limits). **Decision:** Accept temporarily for text-only W1/W2 release; schedule upgrade `>=2.5.0` with multipart upload smoke test. |
| `1124066`, `1193725`, `1241331` | **High** (3) | `sharp` | **`0.34.5`** | `<0.35.5` | `>=0.35.5` | **Not reachable in W1/W2.** Invoked only when generating uploaded image thumbnails (`libvips`/`libheif`/`librsvg`). **Decision:** Defer to native rebuild cycle (`sharp >=0.35.5`) since W1/W2 require no image processing. |
| `1124276`, `1138769`, `1124268`, `1124271`, `1124272`, `1120807` | **High** (2), Mod (3), Low (1) | `react-router` | **`7.15.0`** | `<7.18.2` | `>=7.18.2` | **Not exploitable via RSC/SSR in `apps/web`/`apps/pwa`.** Application uses client-side `BrowserRouter` SPA mode only (no React Server Components or SSR hydration handlers). **Decision:** Low runtime risk; bump `react-router-dom` / `react-router` to `>=7.18.2` during routine frontend maintenance. |
| `1119502`, `1158506`, `1158507`, `1243687` | Moderate (4) | `qs` | **`6.15.1`** | `<=6.16.0` | `>=6.16.1` | **Partially reachable on `GET /api/exhibits` query parsing.** `searchQuerySchema` uses strict Zod type coercion & `limit <= 100`. **Decision:** Override `"qs": ">=6.16.1"` alongside Express transitive patch bundle and re-verify `UC-04` filters. |
| `1145093`, `1248071`, `1241209` | **High** (3) | `deepmerge-ts`, `effect`, `source-map-js` | **`7.1.5`**, **`3.21.0`**, **`1.2.1`** | `<8.0.0`, `<=3.22.0`, `<1.2.2` | latest `6.x` Prisma CLI | **CLI/build-time only (`@prisma/client > prisma > @prisma/config`).** Never imported or executed inside HTTP request handlers (`apps/api` runtime). **Decision:** Accept at zero HTTP runtime risk; resolves automatically upon next `@prisma/client` CLI patch upgrade. |

## 2. Package Count Summary

- **Total Unique Packages Affected:** 10 (`proxy-addr`, `body-parser`, `zod`, `multer`, `sharp`, `react-router`, `qs`, `deepmerge-ts`, `effect`, `source-map-js`).
- **Priority Immediate Overrides Before Production Exposure:** `proxy-addr >= 2.0.8` (Critical `1241210`), `body-parser >= 2.4.0` (High `1243074`), `qs >= 6.16.1` (Mod `1243687`), `react-router >= 7.18.2`.
