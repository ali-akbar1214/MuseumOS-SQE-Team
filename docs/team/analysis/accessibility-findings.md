# Accessibility Findings - axe-core and Keyboard Evidence

Environment: Windows 11, Chromium headless shell 1248, local MuseumOS on port 5173; captured 2026-11-22. Evidence JSON is under `docs/team/evidence/accessibility/`.

| Screen | Before: violations | After: violations | After passes | Result |
|---|---:|---:|---:|---|
| Create exhibit modal | 4 rules: button name, label, select name (critical), contrast (serious) | 0 | 45 | Fixed |
| Exhibit detail | 2 rules: invalid description-list markup (serious), heading order (moderate) | 0 | 32 | Fixed |
| Validated/published detail | 3 rules: toast/text contrast (serious), invalid description-list markup (serious), heading order (moderate) | 0 | 34 | Fixed |

## Lighthouse accessibility score

| Capture | Source | Accessibility score | Failed audits |
|---|---|---:|---|
| Before | Pinned baseline `0ef7004ebef1c59130101fa0a56c95a50ca31900`, `/exhibits`, authenticated local Lighthouse run | 0.88 | `button-name`, `color-contrast` |
| After | Final local code, same `/exhibits` route and runtime, authenticated Lighthouse run | 1.00 | None |

Raw Lighthouse JSON is `docs/team/evidence/accessibility/lighthouse-before-exhibits.json`, `lighthouse-after-exhibits.json`, `lighthouse-exhibits-list-full.json`, `lighthouse-exhibit-detail-full.json`, and `lighthouse-multi-screen.json`. Multi-screen authenticated Lighthouse runs (`scripts/team/run-lighthouse-audit.mjs`, captured 2026-11-23T20:21:41Z) scored both key workflow screens across all three required categories:

| Screen | URL | Accessibility | Best Practices | SEO |
|---|---|---:|---:|---:|
| Exhibits list | `/exhibits` | **1.00** | **1.00** | **0.82** |
| Exhibit detail | `/exhibits/:id` | **1.00** | **1.00** | **0.82** |

All 8 Playwright E2E tests (including keyboard Tab/Enter submission on Create Exhibit and `0` axe-core violations across all 3 captured screens: `45`, `32`, and `34` passing rules) ran live on 2026-11-24 (`docs/team/evidence/e2e/playwright-report.html`).

## Findings and changes

1. Icon-only close button and donor picker control had no accessible names; field labels were not associated with inputs, selects, and dynamic attributes. Added an explicit dialog name, close-button label, control IDs/`htmlFor`, and donor-button name.
2. Primary blue text did not meet minimum contrast on light backgrounds. Darkened the theme primary color.
3. Detail fields used `<dt>/<dd>` outside a `<dl>`; placed the content under description lists and made field wrappers layout-transparent.
4. A section heading skipped heading level; changed it to the next level.
5. Sonner success toast text was pale green on a pale green surface. Added a dark success text color.

The Playwright W1 test verifies a keyboard user can tab to Create and submit with Enter. All three current axe scans record zero violations. Axe `incomplete` counts are non-violations and require manual review. The Lighthouse accessibility score improved from 0.88 to 1.00 on the catalogue screen.
