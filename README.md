# EthioBuild - Phases 1 to 7

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

## Phase 5
Finance (expenses, payments, contracts, variations), document archive with versions, reports with Excel/CSV export. New: finance.js, docs.js.

## Phase 6
Inspections, incidents, compliance register (your own references only; no laws are built in), alerts, analytics. New: quality.js.

## Phase 7
Encrypted server sync, conflict review (nothing is silently overwritten), verification, and optional file-inclusive backups. New: sync.js.
Upload ALL app files again (changed: app.js, quality.js, docs.js, index.html, sw.js).
The `server/` folder is a separate Node.js deployment (see server/README.md). Do not rely on GitHub Pages for it.

## UI refresh 2
Navy project header with storeys, floor area, BOQ item count and budget; top tabs (Home, Modules, BOQ, Files); Modules screen with grouped colour tiles; outlined fields with the label on the border. Upload ALL files again (changed: app.js, ui.js, styles.css, index.html, sw.js, prices.js).

## Structural elements (Phase 8)
Columns, beams and slabs with a live calculator that uses only values you enter; bar schedule, Excel export, and "Send totals to BOQ". New: structure.js. Upload ALL site files again (changed: app.js, index.html, sw.js, styles.css). The server/ folder is NOT part of the site and is not uploaded to GitHub Pages.
