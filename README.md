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
