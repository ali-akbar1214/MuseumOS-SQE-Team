# Accessibility Findings — axe-core, Keyboard, and Multi-Screen Lighthouse

**Environment:** Windows 11, Chromium 1248, local MuseumOS on `http://127.0.0.1:5173`; live rerun captured 2026-11-26 (`docs/team/evidence/accessibility/`).

## 1. Automated axe-core & Keyboard Results (30/30 Playwright Run)

| Screen | Baseline violations | Post-fix violations | Passing rules (after) | Result |
|---|---:|---:|---:|---|
| Create exhibit modal (`/exhibits` → Add Exhibit) | 4 rules (button name, label, select name [critical], contrast [serious]) | **0** | 45 (`incomplete: 1`) | Fixed |
| Exhibit detail (`/exhibits/:id` after creation) | 2 rules (invalid description-list markup [serious], heading order [moderate]) | **0** | 32 (`incomplete: 1`) | Fixed |
| Validated & published detail | 3 rules (toast/text contrast [serious], invalid description-list markup [serious], heading order [moderate]) | **0** | 34 (`incomplete: 1`) | Fixed |

- **Keyboard workflow proof (`UC-01-A2`):** Playwright verifies initial autofocus lands on `#new-exhibit-category`, blank whitespace input keeps `Create` disabled, `Tab` order reaches `Create`, and pressing `Enter` submits the new exhibit cleanly.

## 2. Multi-Screen Authenticated Lighthouse Audit

Executed `scripts/team/run-lighthouse-audit.mjs` on 2026-11-26T10:27:14Z across all **three key workflow screens** (Catalogue list, Create Exhibit modal via `/exhibits?new=1`, and Exhibit Detail):

| Screen | URL | Before A11y | After A11y | Best Practices | SEO | Raw Evidence |
|---|---|---:|---:|---:|---:|---|
| Exhibits catalogue | `/exhibits` | 0.88 | **1.00** | **1.00** | 0.82 | `lighthouse-exhibits-list-full.json` |
| Create exhibit modal | `/exhibits?new=1` | — | **1.00** | **1.00** | 0.82 | `lighthouse-create-exhibit-modal-full.json` |
| Exhibit detail | `/exhibits/:id` | — | **1.00** | **1.00** | 0.82 | `lighthouse-exhibit-detail-full.json` |

Consolidated JSON: `docs/team/evidence/accessibility/lighthouse-multi-screen.json`. Full 30-flow Playwright HTML report: `docs/team/evidence/e2e/playwright-report.html`.

## 3. Deduplicated Findings Inventory (Counted Once Across axe-core & Lighthouse)

Each distinct UI accessibility issue below is counted **once** across both `axe-core` and Lighthouse (`A11Y-01`..`A11Y-05`):

| ID | Screen(s) | Element / Selector | Detected By (Counted Once) | Severity | User Impact | Applied Fix & Verification |
|---|---|---|---|---|---|---|
| **A11Y-01** | Create modal | `NewExhibitModal` container, icon-only close `<button>`, `#new-exhibit-category`, `#new-exhibit-name`, `#new-exhibit-year`, dynamic attribute `<input>`/`<select>`, `DonorPicker` trigger | `axe-core` (`label`, `select-name`, `button-name`) + Lighthouse (`button-name`) | Critical | Screen readers could not announce field purpose, dialog title, or close action; keyboard users lacked associated focus labels. | Added `aria-labelledby="new-exhibit-title"`, `aria-label` on close & donor buttons, explicit `<label htmlFor>` + matching `id`s on `apps/web/src/pages/exhibits.tsx`. Verified: 0 violations (`45` passes), Lighthouse `1.00`. |
| **A11Y-02** | Create modal, Catalogue, Detail | `.text-primary`, primary badge & accent links using CSS `--primary` token | `axe-core` (`color-contrast`) + Lighthouse (`color-contrast`) | Serious | Low-vision users struggled to distinguish primary links/actions against light card backgrounds (`< 4.5:1` ratio). | Darkened `--primary` HSL lightness in `apps/web/src/index.css` / `globals.css` to meet WCAG AA contrast (`>= 4.5:1`). Verified: 0 contrast violations across `axe-core` & all 3 Lighthouse captures (`1.00`). |
| **A11Y-03** | Exhibit detail | Metadata rows using orphaned `<dt>` / `<dd>` inside `<div>` flex/grid containers (`exhibit-detail.tsx`) | `axe-core` (`definition-list`) | Serious | Assistive technologies misread field-value pairs outside a semantic `<dl>` container. | Wrapped metadata terms/definitions cleanly in semantic `<dl>` elements with layout-transparent wrappers (`display: contents` / semantic rows). Verified: 0 violations (`32` passes). |
| **A11Y-04** | Exhibit detail | Section subheadings (`<h4>` directly beneath `<h1>` on `exhibit-detail.tsx`) | `axe-core` (`heading-order`) | Moderate | Screen-reader heading outline jumped levels, breaking document landmark navigation. | Adjusted section headings to `<h2>` beneath page `<h1>` (`Conservation log`, `Category attributes`). Verified: `heading-order` passes across detail & publish captures. |
| **A11Y-05** | Detail (Publish toast) | `[data-sonner-toast][data-type="success"]` status banner | `axe-core` (`color-contrast`) | Serious | Pale green text on pale green background failed contrast (`< 4.5:1`) when announcing save/publish confirmation. | Configured high-contrast dark green text foreground on Sonner success toasts. Verified on live publish capture (`axe-after-publish-screen.json`, `34` passes, `0` violations). |

Note: `incomplete: 1` reported by `axe-core` represents elements needing visual background-image verification rather than confirmed violations. Across all 3 screens, Lighthouse SEO scored **`0.82` (`9/11` weighted audits pass)** because two public-search-engine audits (`meta-description`: `"Document does not have a meta description"`, weight `1`, score `0`; and `robots-txt`: `"robots.txt is not valid"` due to Vite SPA fallback serving `index.html` for `/robots.txt`, weight `1`, score `0`) fail by design on an authenticated internal museum back-office intranet application where search-engine indexing is not desired.
