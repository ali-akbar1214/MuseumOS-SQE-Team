# Security Review Evidence

## 1. Attack Surface & Role-Based Authorization Matrix

Routes and data in scope for W1 (exhibit catalogue creation) and W2 (validation and publication):
- `GET /api/exhibits`, `GET /api/exhibits/:id` — protected by `AuthGuard` + `@RequirePermission('exhibit:read')`.
- `POST /api/exhibits` — protected by `AuthGuard` + `@RequirePermission('exhibit:write')` + Zod `createExhibitSchema`.
- `PATCH /api/exhibits/:id` — protected by `AuthGuard` + `@RequirePermission('exhibit:write')` + inline lifecycle check (`exhibit:validate` or `admin` required whenever `validated` or `published` is present).
- `DELETE /api/exhibits/:id` — protected by `AuthGuard` + `@RequirePermission('exhibit:delete')`.

The Playwright RBAC suite (`tests/team/uc03-uc04-access-search.spec.ts`) executes automated allow/deny checks across viewer, curator, and administrator accounts and writes `docs/team/evidence/security/access-checks.json`:

| Role | Action | Endpoint | Expected | Observed (`access-checks.json` / UC-03) |
|---|---|---|---:|---|
| Viewer | Read exhibit catalogue | `GET /api/exhibits` | 200 | 200 Allowed |
| Viewer | Create exhibit | `POST /api/exhibits` | 403 | 403 Denied (`Missing permission: exhibit:write`) |
| Curator | Read exhibit catalogue | `GET /api/exhibits` | 200 | 200 Allowed |
| Curator | Create exhibit | `POST /api/exhibits` | 201 | 201 Allowed |
| Curator | Validate exhibit (`DEF-003` fix) | `PATCH /api/exhibits/:id` | 403 | 403 Denied (`Missing permission: exhibit:validate`) |
| Curator | Publish exhibit | `PATCH /api/exhibits/:id` | 403 | 403 Denied (`Missing permission: exhibit:validate`) |
| Administrator | Validate & publish exhibit | `PATCH /api/exhibits/:id` | 200 | 200 Allowed (W2 workflow) |

Live cookie inspection (`docs/team/evidence/security/cookie-security-check.json`, captured 2026-11-23T20:19:07Z) verified `museumos.sid` has `httpOnly: true`, `sameSite: "Lax"`, `path: "/"`, and `secure: false` on local HTTP.

---

## 2. Source-Corroborated Security Controls

1. **Session Cookie Attributes & Fixation Protection** (`apps/api/src/main.ts` lines 68–94; `apps/api/src/auth/auth.controller.ts` lines 34–66):
   - Sessions are persisted server-side in PostgreSQL via `connect-pg-simple` (`http_sessions` table), cookie name `museumos.sid`, `resave: false`, `saveUninitialized: false`, `maxAge: 7d`.
   - `httpOnly: true` prevents client-side `document.cookie` exfiltration via XSS.
   - `sameSite: 'lax'` mitigates cross-site state-changing CSRF on `POST`/`PATCH`/`DELETE`.
   - `req.session.regenerate(...)` executes inside `AuthController.login` prior to attaching `userId` and `permissions`, preventing session-fixation attacks.
   - Login endpoint applies `@Throttle({ login: { ttl: 15 * 60 * 1000, limit: 10 } })` against brute-force/credential stuffing.
   - **Finding / Observation (`SEC-001`, linked to Risk P2):** `cookie.secure` is gated on `NODE_ENV === 'production' && SESSION_COOKIE_SECURE !== 'false'`. On local HTTP (`http://localhost:3000`), `Secure` is `false` (expected for plain HTTP dev), **but** deployments setting `SESSION_COOKIE_SECURE=false` risk cleartext cookie transmission if TLS termination is misconfigured. Recommendation: enforce `Secure=true` in production behind TLS and remove the disable flag in production profiles.

2. **Two-Layer RBAC & Privilege-Escalation Prevention** (`apps/api/src/auth/guards/permission.guard.ts`; `apps/api/src/exhibits/exhibits.controller.ts` lines 234–237):
   - Route-level `@RequirePermission(...)` enforces coarse permissions (`exhibit:read`, `exhibit:write`, `exhibit:delete`).
   - Because `PATCH /api/exhibits/:id` handles both metadata edits and lifecycle transitions, `ExhibitsController.update` explicitly verifies `actor.role === 'admin' || actor.permissions.includes('exhibit:validate')` before permitting `validated` or `published` changes (`DEF-003` remediation).

3. **HTTP Security Headers & CORS Allowlist** (`apps/api/src/main.ts` lines 53–57, 96–99):
   - `helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })` applies `X-Content-Type-Options: nosniff`, `X-Frame-Options`, and baseline hardening headers.
   - `enableCors` restricts `credentials: true` to `CORS_ORIGINS` (defaulting only to `http://localhost:5173`).

---

## 3. SonarQube Hotspots & Static Posture

SonarQube 9.9.8 Community Build identified three hotspots; all were reviewed and marked Safe (`evidence/sonar-final-hotspots.json`):
- Trailing-slash regex in `branding.ts` (linear non-nested pattern on static environment config).
- Dashboard decorative quote selection via `Math.random()` in `dashboard.tsx` (non-security UI display).
- 404 cosmetic error-code display via `Math.random()` (non-security display).

Final SonarQube scan reports **0 bugs, 0 vulnerabilities, 0 open hotspots**, and **OK** quality gate.

---

## 4. Production Dependency Audit (`pnpm audit --prod`) & OWASP ZAP Passive Scan

- `pnpm audit --prod` snapshot (`docs/team/evidence/security/dependency-audit.json`) found **26 advisories**: **1 critical, 14 high, 8 moderate, 3 low**. Full per-package reachability, workflow impact, and remediation plan are documented in `docs/team/analysis/dependency-triage.md` and `docs/team/evidence/security/dependency-triage.csv`.
- **OWASP ZAP Passive Scan (`docs/team/evidence/security/zap-passive-report.{html,json}`):** Executed `scripts/team/run-zap-passive.ps1` using `ghcr.io/zaproxy/zaproxy:stable` as a passive HTTP proxy on port `8080` while Playwright ran all 8 tests (`UC-01`–`UC-06`, all 8 passed). ZAP recorded **9 unique alert types across 153 instances** (`0 High`, `3 Medium`, `2 Low`, `4 Informational`):

| Risk | Alert (Plugin / CWE) | Affected Component / Evidence | Likely Impact & Recommended Correction |
|---|---|---|---|
| **Medium** | Content Security Policy (CSP) Header Not Set (`10038` / CWE-693) | Web UI HTML responses (`8` URLs via Vite `5173`) | Weakens defense-in-depth against script injection. Configure a strict `Content-Security-Policy` header at the production reverse proxy / `helmet` HTML gateway. |
| **Medium** | Missing Anti-clickjacking Header (`10020` / CWE-1021) | Web UI responses (`8` URLs on Vite `5173`; API applies `helmet` `X-Frame-Options`) | Allows UI framing if reverse proxy omits headers. Emit `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`) on frontend HTTP responses. |
| **Medium** | Sub Resource Integrity (SRI) Attribute Missing (`90003` / CWE-345) | External Google Fonts `<link rel="stylesheet">` in `index.html` (`8` URLs) | External CDN compromise could alter loaded styles. Self-host typography assets or pin fixed assets with `integrity` hashes. |
| **Low** | X-Content-Type-Options Header Missing (`10021` / CWE-693) | Vite dev server JS/TSX module assets (`77` URLs; API applies `nosniff` via `helmet`) | Browser MIME-sniffing risk on static dev assets. Ensure production static server / nginx sets `X-Content-Type-Options: nosniff`. |
| **Low** | Timestamp Disclosure - Unix (`10096` / CWE-497) | Bundled `react-dom_client.js` literal `2080374784` (`1` URL) | Benign numeric constant in third-party React bundle; confirm non-sensitive (no secret leakage). |
| **Info** | `museumos.sid` Session Management Response Identified (`10112`), Dev HMR Token URL (`10024` Vite-only), HTML Comment (`10027`), Modern Web App (`10109`) | Login response & Vite dev shell (`29` instances total) | Confirms `museumos.sid` session cookie flow works as designed; Vite dev HMR token (`/?token=...`) is dev-only and absent from production bundles. |
