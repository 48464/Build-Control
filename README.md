# EthioBuild - Phase 1 + 2

Offline-first PWA: accounts, roles, projects, team, tasks with transparent priority,
role-based dashboards, encrypted verified backup/restore, audit log, light/dark theme.

Run: serve this folder over HTTPS or localhost, e.g. `python3 -m http.server 8080`,
then open http://localhost:8080 and use "Install app" in the browser.

Not built yet (shown as Planned in the menu): drawings, BOQ, prices, finance, inventory,
progress, quality, compliance, reports, server sync. Data lives only on this device
until Phase 7; use Backup & Synchronization to export a file.

## Phase 2 added
Drawings (upload, revisions, measurements with confirmation) and a transparent BOQ quantity engine
(formulas, deductions, waste you set, verification, approved revisions, CSV export). Quantities only; prices are Phase 3.
Update on GitHub: upload ALL files again (new: boq.js; changed: app.js, index.html, sw.js, styles.css).

## UI refresh
Modern design, floating navigation, custom bottom-sheet dropdowns (ui.js). Upload ALL files again (new: ui.js).

## Phase 3
Price database (materials, suppliers, dated quotations with reliability labels), labour and equipment rates, CSV price import, unit-rate analysis, cost estimate. No prices are built in.
Upload ALL files again (new: prices.js).

## Phase 6
Daily activities, scheduling (list + Gantt), dependencies, approval workflow, progress from verified quantities, inventory and procurement, labour attendance, daily report.
Upload ALL files again (new: ops.js).

## Guide
In-app help (new: guide.js). Menu → "How to use EthioBuild" shows the 16 steps in order, with what each module does, steps and a worked example. Every module page also has a collapsible "How to use this page" card. Upload ALL files again (new: guide.js; changed: index.html, sw.js, app.js, styles.css, README.md).

## General settings
Settings → Appearance & language: theme, font style, text size, language (English, አማርኛ, Afaan Oromoo). New: i18n.js (dictionaries; add translations there), prefs.js. Changed: app.js, styles.css, ops.js, prices.js, guide.js, index.html, sw.js, README.md. Upload ALL files again.

## View modes and UI
Top-bar screen icon: one tap switches mobile/desktop view (Settings → Layout: Auto, Mobile, Desktop). Desktop view has a collapsible sidebar. Quick-add (+) button, high-contrast, reduce-motion and larger-tap-target options. New: view.js, modern.css. Changed: prefs.js, i18n.js, guide.js, index.html, sw.js. Upload ALL files again.

## Compliance guide
Compliance register now has a 📖 Compliance guide (#/compguide) and an 'Add the checklist' button (16 items in order). New: compguide.js. Changed: quality.js, modern.css, guide.js, i18n.js, view.js, app.js, index.html, sw.js. Upload ALL files again. Confirm every item with your permit office; the guide is orientation only.
