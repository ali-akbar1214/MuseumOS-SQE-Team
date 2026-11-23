# Production Dependency Advisory Triage

**Snapshot source:** `pnpm audit --prod` (`docs/team/evidence/security/dependency-audit.json`, `docs/team/evidence/security/dependency-triage.csv`).  
**Summary:** 26 advisories across production dependencies (**1 Critical, 14 High, 8 Moderate, 3 Low**).  
**Status:** Triaged by workflow reachability and severity; **open pending upgrade and compatibility re-verification** (no clean post-upgrade audit is claimed yet).

---

## Reachability & Risk Assessment (Critical and High Advisories)

| Advisory ID | Severity | Package & Path | Reported Vulnerability | Workflow Reachability & Impact | Recommended Action |
|---|---|---|---|---|---|
| `1241210` | **Critical** | `proxy-addr` (`@nestjs/platform-express > express > proxy-addr`, `<2.0.8`) | IP spoofing via IPv4-mapped IPv6 `trust proxy` subnet | **Reachable in API:** `apps/api/src/main.ts` enables `app.set('trust proxy', 2)` for throttling & audit IP logging. Could spoof `req.ip` behind IPv6 reverse proxies and bypass `@Throttle` login limits. | Override/upgrade `proxy-addr >= 2.0.8` via `pnpm.overrides`, rebuild, and rerun auth/throttle tests. |
| `1243074` | High | `body-parser` (`express > body-parser`, `<2.4.0`) | DoS via trailing bytes after compressed request body | **Reachable on JSON routes:** `POST /api/exhibits`, `PATCH /api/exhibits/:id` parse request bodies. Potential worker DoS on malformed compressed payloads. | Upgrade `body-parser >= 2.4.0` via `pnpm.overrides`. |
| `1243066` | High | `zod` (`apps/api > zod`, `<4.6.6`) | Memory exhaustion validating oversized constrained collections | **Reachable (mitigated by caps):** `createExhibitSchema`/`bulkUpdateSchema` use Zod (`ids` max 500, `exhibitName` max 500). | Plan upgrade to patched Zod v4.x (`>=4.6.6`) or verified v3 backport and rerun `exhibit-contracts.test.ts`. |
| `1121089`, `1193790`, `1193793`, `1243083` | High (4) | `multer` (`apps/api > multer`, `<2.5.0`) | DoS via crafted/nested multipart field names or async `fileFilter` race | **Not reachable in W1/W2 core text workflows:** only invoked on image upload route `POST /api/exhibits/:id/images` (25 MB limit, max 10 files). | Upgrade `multer >= 2.5.0` and smoke-test image upload endpoint. |
| `1124066`, `1193725`, `1241331` | High (3) | `sharp` (`<0.35.5`) | Native `libvips` / `libheif` / `librsvg` vulnerabilities | **Not reachable in W1/W2:** invoked only during image thumbnail generation. | Upgrade `sharp >= 0.35.5` and rebuild native bindings. |
| `1124276`, `1138769` | High (2) | `react-router` (`apps/pwa > react-router-dom > react-router`, `<7.18.2`) | Inefficient route matching DoS; RSC mode CSRF bypass | **Low direct impact:** `apps/pwa` uses client-side SPA routing (no React Server Components mode enabled), and main web app is `apps/web`. | Upgrade `react-router >= 7.18.2` across `apps/pwa` and `apps/web`. |
| `1145093`, `1248071`, `1241209` | High (3) | `deepmerge-ts`, `effect`, `source-map-js` (`@prisma/client > prisma > @prisma/config`) | CLI/config-time stack exhaustion / ReDoS / source-map DoS | **Not reachable at HTTP runtime:** pulled transitively under Prisma CLI/config toolchain rather than API request handlers. | Upgrade `@prisma/client` / `prisma` package family to latest 6.x patch or override transitive deps. |

## Moderate & Low Advisories (11 Advisories)

- **Moderate (8):** `qs` (`1119502`, `1158506`, `1158507`, `1243687` — query-string parsing edge DoS/bypass in Express, partially reachable on `GET /api/exhibits` query parameters; fix: `qs >= 6.16.1`), `multer` (`1121091` — upload cleanup), `react-router` (`1124268`, `1124271`, `1124272` — SSR/open-redirect vectors, mitigated by SPA-only routing; fix: `>= 7.18.0`).
- **Low (3):** `body-parser` (`1123976`), `multer` (`1193792`), `react-router` (`1120807`).
- **Remediation Governance:** Upgrading `proxy-addr`, `body-parser`, `qs`, `multer`, and `react-router` via `pnpm.overrides` in root `package.json` followed by `pnpm install && pnpm build && pnpm test:team && pnpm audit --prod` is tracked against Risk `SEC-DEP-01`.
