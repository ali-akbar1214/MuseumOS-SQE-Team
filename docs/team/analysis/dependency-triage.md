# Production Dependency Advisory Triage & Remediation (`SEC-DEP-01`)

**Before Snapshot:** `pnpm audit --prod` (`docs/team/evidence/security/dependency-audit.json`, `docs/team/evidence/security/dependency-triage.csv`).  
**After Snapshot (Post-`pnpm.overrides`):** `pnpm audit --prod` (`docs/team/evidence/security/dependency-audit-after.json`, captured 2026-11-27).  
**Exact Installed Versions Source:** Verified from workspace `node_modules/.pnpm` package store before and after applying `pnpm.overrides` in `package.json`.

---

## 1. Before vs. After `pnpm.overrides` Summary

Applying `pnpm.overrides` in `package.json` (`proxy-addr >=2.0.8`, `body-parser >=2.4.0`, `qs >=6.16.1`, `react-router ^7.18.2`, `react-router-dom ^7.18.2`, `multer >=2.5.0`, `source-map-js >=1.2.2`) and running `pnpm install` + `pnpm audit --prod` eliminated **19 of 26 advisories (`-73.1%`)**, including **100% of Critical advisories (`1 → 0`)** and **100% of reachable W1/W2 HTTP/Express runtime advisories**:

| Severity | Before `pnpm.overrides` (`dependency-audit.json`) | After `pnpm.overrides` (`dependency-audit-after.json`) | Change | Status |
|---|---:|---:|---:|---|
| **Critical** | **1** (`proxy-addr@2.0.7`) | **0** (`proxy-addr@2.0.8`) | **-1 (-100%)** | **Resolved** |
| **High** | **14** | **6** (non-reachable `sharp`, `zod`, Prisma CLI) | **-8 (-57.1%)** | **All reachable HTTP/upload High advisories resolved** |
| **Moderate** | **8** | **1** (`i18next@26.0.10` static locale init) | **-7 (-87.5%)** | **All 4 `qs`, 3 `react-router`, 1 `multer` Mod resolved** |
| **Low** | **3** | **0** | **-3 (-100%)** | **Resolved** |
| **Total** | **26** | **7** | **-19 (-73.1%)** | **0 Critical; 0 reachable W1/W2 HTTP runtime flaws** |

---

## 2. Complete Package-by-Package Resolution & Triage Table

| Advisory ID(s) | Severity | Package | Before Version | After Version | Patched Target | Workflow Reachability (W1/W2) & Final Disposition |
|---|---|---|---:|---:|---|---|
| `1241210` | **Critical** (1) | `proxy-addr` | `2.0.7` | **`2.0.8`** | `>=2.0.8` | **Reachable (`trust proxy: 2`). FIXED via `pnpm.overrides` (`2.0.8`).** Verified `0` Critical in `dependency-audit-after.json`. |
| `1243074`, `1123976` | **High** (1), Low (1) | `body-parser` | `2.2.2` | **`2.4.0`** | `>=2.4.0` | **Reachable (`POST`/`PATCH` JSON bodies). FIXED via `pnpm.overrides` (`2.4.0`).** Both advisories eliminated. |
| `1119502`, `1158506`, `1158507`, `1243687` | Moderate (4) | `qs` | `6.15.1` | **`6.17.1`** | `>=6.16.1` | **Reachable (`GET /api/exhibits` query parsing). FIXED via `pnpm.overrides` (`6.17.1`).** All 4 query-parser advisories eliminated. |
| `1121089`, `1193790`, `1193793`, `1243083`, `1121091`, `1193792` | **High** (4), Mod (1), Low (1) | `multer` | `2.1.1` | **`2.5.0`** | `>=2.5.0` | **Not reachable in W1/W2 text flows. FIXED via `pnpm.overrides` (`2.5.0`).** All 6 multipart advisories eliminated. |
| `1124276`, `1138769`, `1124268`, `1124271`, `1124272`, `1120807` | **High** (2), Mod (3), Low (1) | `react-router` | `7.15.0` | **`7.18.7`** | `>=7.18.2` | **Client-side SPA mode. FIXED via `pnpm.overrides` (`^7.18.2` → `7.18.7`).** All 6 router advisories eliminated. |
| `1241209` | **High** (1) | `source-map-js` | `1.2.1` | **`1.2.4`** | `>=1.2.2` | **CLI/build-time only. FIXED via `pnpm.overrides` (`1.2.4`).** Advisory eliminated. |
| `1243066` | **High** (1) | `zod` | `3.25.76` | `3.25.76` | `>=4.6.6` | **Mitigated at boundary (Remaining 1/7).** `@museumos/contracts` caps `exhibitName` (`<= 500` chars) and arrays (`<= 500` IDs); upgrading `zod` v3 → v4 is a major breaking API change across `@museumos/contracts`. |
| `1124066`, `1193725`, `1241331` | **High** (3) | `sharp` | `0.34.5` | `0.34.5` | `>=0.35.5` | **Not reachable in W1/W2 (Remaining 3/7).** Invoked only for image thumbnail generation (`libvips`/`libheif`/`librsvg`); W1/W2 catalogue and publish flows process JSON only. |
| `1145093`, `1248071` | **High** (2) | `deepmerge-ts`, `effect` | `7.1.5`, `3.21.0` | `7.1.5`, `3.21.0` | Prisma CLI | **CLI/build-time only (Remaining 2/7).** Transitive dependencies of `@prisma/config` CLI; never imported by NestJS runtime server. |
| `1250194` | Moderate (1) | `i18next` | `26.0.10` | `26.0.10` | upstream | **Mitigated (Remaining 1/7).** `i18next.init` receives static compiled locale JSON bundles (`en.json`, `el.json`), never untrusted user input. |
