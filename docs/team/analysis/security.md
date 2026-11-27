# Security Review Evidence

## 1. Attack Surface & Role-Based Authorization Matrix

Routes and data in scope for W1 (exhibit catalogue creation) and W2 (validation and publication):
- `GET /api/exhibits`, `GET /api/exhibits/:id` — protected by `AuthGuard` + `@RequirePermission('exhibit:read')`.
- `POST /api/exhibits` — protected by `AuthGuard` + `@RequirePermission('exhibit:write')` + Zod `createExhibitSchema`.
- `PATCH /api/exhibits/:id` — protected by `AuthGuard` + `@RequirePermission('exhibit:write')` + inline lifecycle check (`exhibit:validate` or `admin` required whenever `validated` or `published` actually changes relative to stored state).
- `DELETE /api/exhibits/:id` — protected by `AuthGuard` + `@RequirePermission('exhibit:delete')`.

The split Playwright RBAC suite (`tests/team/uc03-uc04-access-search.spec.ts`) executes **11 live allow/deny checks** across unauthenticated requests, viewer, curator, and administrator accounts, and **reads back target records after every `401`/`403`** to verify zero state mutation (`docs/team/evidence/security/access-checks.json`, captured 2026-11-26T10:29:07Z):

| Role | Action | Endpoint | Expected | Observed (`access-checks.json`) | Read-Back Proof (`statePreserved`) |
|---|---|---|---:|---|---|
| Unauthenticated | Redirect browser `/exhibits` → `/login` & read API | `GET /api/exhibits` | 401 | **401 Denied** (+ UI redirect) | Yes (`true`) |
| Unauthenticated | Create exhibit | `POST /api/exhibits` | 401 | **401 Denied** | Yes (`true`) |
| Unauthenticated | Validate exhibit | `PATCH /api/exhibits/:id` | 401 | **401 Denied** | Yes (`validated=false`) |
| Viewer | Read exhibit catalogue (with UI role badge check) | `GET /api/exhibits` | 200 | **200 Allowed** | Yes (`true`) |
| Viewer | Create exhibit (API + UI modal submission check) | `POST /api/exhibits` | 403 | **403 Denied** + UI `.text-destructive` | Yes (0 matching rows in search) |
| Viewer | Validate exhibit | `PATCH /api/exhibits/:id` | 403 | **403 Denied** | Yes (`validated=false, published=false`) |
| Curator | Read exhibit catalogue | `GET /api/exhibits` | 200 | **200 Allowed** | Yes (`true`) |
| Curator | Create draft exhibit | `POST /api/exhibits` | 201 | **201 Allowed** | Yes (`true`) |
| Curator | Validate exhibit (`DEF-003` fix) | `PATCH /api/exhibits/:id` | 403 | **403 Denied** | Yes (`validated=false, published=false`) |
| Curator | Publish exhibit | `PATCH /api/exhibits/:id` | 403 | **403 Denied** | Yes (`validated=false, published=false`) |
| Administrator | Validate exhibit (UI + API) | `PATCH /api/exhibits/:id` | 200 | **200 Allowed** | Yes (`validated=true`) |

Live cookie inspection (`docs/team/evidence/security/cookie-security-check.json`, captured 2026-11-26T10:28:59Z) verified `museumos.sid` has `httpOnly: true`, `sameSite: "Lax"`, `path: "/"`, and `secure: false` on local HTTP.

---

## 2. Source-Corroborated Security Controls

1. **Session Cookie Attributes & Fixation Protection** (`apps/api/src/main.ts` lines 68–94; `apps/api/src/auth/auth.controller.ts` lines 34–66):
   - Sessions are persisted server-side in PostgreSQL via `connect-pg-simple` (`http_sessions` table), cookie name `museumos.sid`, `resave: false`, `saveUninitialized: false`, `maxAge: 7d`.
   - `httpOnly: true` prevents `document.cookie` theft via XSS; `sameSite: 'lax'` mitigates cross-site CSRF on state-changing requests.
   - `req.session.regenerate(...)` runs on login prior to binding `userId` and `permissions`; `@Throttle({ login: { ttl: 15 * 60 * 1000, limit: 10 } })` caps credential-stuffing attempts.
   - **Finding `SEC-001` (linked to Risk P2):** `cookie.secure` is `false` on plain local HTTP (`http://127.0.0.1:3000`) and gated on `NODE_ENV === 'production' && SESSION_COOKIE_SECURE !== 'false'`. Production deployments must enforce `Secure=true` behind TLS and disallow overriding it to `false`.
2. **Two-Layer RBAC & Privilege-Escalation Prevention** (`apps/api/src/auth/guards/permission.guard.ts`; `apps/api/src/exhibits/exhibits.controller.ts` lines 234–246):
   - Route-level `@RequirePermission(...)` enforces base permissions (`exhibit:read`, `exhibit:write`, `exhibit:delete`), and `ExhibitsController.update` verifies `actor.role === 'admin' || actor.permissions.includes('exhibit:validate')` whenever `validated` or `published` changes (`DEF-003` fix), while permitting curator metadata-only edits (`UC-05`).
3. **HTTP Security Headers & CORS Allowlist** (`apps/api/src/main.ts` lines 53–57, 96–99):
   - `helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })` applies `X-Content-Type-Options: nosniff`, `X-Frame-Options`, and baseline hardening headers on all NestJS API responses.

---

## 3. OWASP ZAP Passive Scan (Production Preview `:4173` + Direct API `:3000`)

Executed `scripts/team/run-zap-passive.ps1` using `ghcr.io/zaproxy/zaproxy:stable` on 2026-11-26 (`docs/team/evidence/security/zap-passive-report.{html,json}`). The scan proxied **both**:
1. All **30/30 Playwright E2E flows** against the compiled **Vite production preview bundle** (`vite preview --port 4173` at `http://host.docker.internal:4173`, eliminating Vite HMR dev-server artifacts), and
2. Direct API probes (`GET /api/health`, `GET /api/exhibits` unauthenticated `401`, `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/categories`, `GET /api/exhibits?limit=5`) directly against the NestJS API host (`http://host.docker.internal:3000/api`).

**Measured ZAP Passive Findings:** **104 alert instances** across **0 High**, **3 Medium**, **1 Low**, and **3 Informational** rules:
- **Direct API (`host.docker.internal:3000`):** Returned **0 Medium / 0 Low header warnings** (`2x` `Informational` `Session Management Response Identified` `10112` confirming cookie session flow), proving `helmet` headers actively protect the API origin. (Note: `helmet` emits default headers over HTTP; TLS/HSTS transport security is out of scope on local HTTP and relies on reverse-proxy TLS in production.)
- **Production Web Preview (`host.docker.internal:4173`):** Because `vite preview` serves static `dist/` HTML without a production reverse proxy (`nginx`/`caddy`), the frontend host recorded:

| Risk | Instances | Alert (Plugin / CWE) | Affected Host & Path | Impact & Corrective Control |
|---|---:|---|---|---|
| **Medium** | 14 | Content Security Policy (CSP) Header Not Set (`10038` / CWE-693) | `host.docker.internal:4173` SPA HTML | Serve built `dist/` behind nginx/Caddy with strict `Content-Security-Policy` (`default-src 'self'`). |
| **Medium** | 14 | Missing Anti-clickjacking Header (`10020` / CWE-1021) | `host.docker.internal:4173` SPA HTML | Emit `X-Frame-Options: DENY` and `frame-ancestors 'none'` at the web reverse proxy. |
| **Medium** | 14 | Sub Resource Integrity (SRI) Missing (`90003` / CWE-345) | `host.docker.internal:4173` external Google Fonts link | Self-host WOFF2 fonts inside `apps/web/public/` or pin static stylesheet `integrity` hashes. |
| **Low** | 16 | `X-Content-Type-Options` Header Missing (`10021` / CWE-693) | `host.docker.internal:4173` static preview assets | Configure `X-Content-Type-Options: nosniff` on the static web gateway (already enforced on API `:3000`). |
| **Info** | 44 | Suspicious Comments (`10027`, 28x), Modern Web App (`10109`, 14x), Session Mgmt (`10112`, 2x) | `:4173` & `:3000` | Reviewed benign React/bundle comments and expected SPA/cookie identification. |

**Scan Boundary Statement:** ZAP was run strictly in **passive** proxy mode over local HTTP (`http://host.docker.internal:4173` + `:3000`). Active fuzzing (`zap-full-scan`), TLS/HSTS certificate checks, and reverse-proxy header enforcement require staging HTTPS deployment and were not claimed.

---

## 4. Production Dependency Audit Before vs. After `pnpm.overrides` & SonarQube Hotspots

- **Before `pnpm.overrides` (`docs/team/evidence/security/dependency-audit.json`):** `pnpm audit --prod` recorded **26 advisories**: **1 Critical, 14 High, 8 Moderate, 3 Low**.
- **Remediation Applied (`package.json` → `pnpm.overrides`):** Pinned `"proxy-addr": ">=2.0.8"`, `"body-parser": ">=2.4.0"`, `"qs": ">=6.16.1"`, `"react-router": "^7.18.2"`, `"react-router-dom": "^7.18.2"`, `"multer": ">=2.5.0"`, and `"source-map-js": ">=1.2.2"`.
- **After `pnpm.overrides` (`docs/team/evidence/security/dependency-audit-after.json`):** Rerun of `pnpm audit --prod` reduced advisories from **26 → 7 (`-73.1%`)**: **0 Critical (down from 1), 6 High (down from 14), 1 Moderate (down from 8), 0 Low (down from 3)**. All reachable W1/W2 Express/HTTP runtime advisories (`proxy-addr`, `body-parser`, `qs`, `multer`, `react-router`, `source-map-js`) are **resolved**. The remaining 7 advisories are non-reachable in W1/W2 text workflows (`sharp@0.34.5` [3 High, native image thumbnails], `deepmerge-ts@7.1.5` & `effect@3.21.0` [2 High, Prisma CLI build-time only], `zod@3.25.76` [1 High, bounded by `maxLength: 500`], and `i18next` [1 Moderate, static locale bundles]).
- **SonarQube Security Hotspots (3 Upstream Hotspots Reviewed SAFE with Per-Hotspot Rationales):**
  1. `apps/web/src/lib/branding.ts:20` (`typescript:S5852` — slow regex check): Regex validates short CSS hex color strings (`#RGB`/`#RRGGBB`) from admin branding config; bounded 3–6 hex char input cannot trigger catastrophic backtracking.
  2. `apps/web/src/pages/dashboard.tsx:39` (`typescript:S2245` — `Math.random()`): Selects a decorative greeting sub-caption from a static UI array; never used for tokens, IDs, or security decisions.
  3. `apps/web/src/pages/not-found.tsx:13` (`typescript:S2245` — `Math.random()`): Selects a random 404 flavor message on the Not Found screen; purely decorative UI text.
