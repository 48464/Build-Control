# EthioBuild bug fix: "+ Component" opens "Add requirement"

## 1. Root cause (confirmed in the source, not assumed)
Two modules register handlers under the SAME action names in the shared `A` action table:

| Action name | prices.js (BOQ unit-rate components) | quality.js (compliance register) |
|---|---|---|
| `new-comp`  | line 315 `'new-comp': id => openSheet(compForm(id))` | line 103 `'new-comp': () => openSheet(regForm())` |
| `edit-comp` | line 315 | line 103 |
| `del-comp`  | line 321 | line 104 |

`index.html` loads `prices.js` (line 27) before `quality.js` (line 31). Both use `Object.assign(A, {...})`, so the later file silently replaces the earlier one. `prices.js` also wraps `edit-comp` and `del-comp` at line 335, but it does so when it loads, before `quality.js` overwrites them again.

Result: the "+ Component" button (`data-a="new-comp"`, prices.js line 210) calls the compliance handler and opens `regForm()` ("Add requirement"). Edit and Remove on a component had the same clash (they opened the compliance form or failed, because `S.compitems.find(id)` is undefined for a rate id).

Ruled out: the service worker. The source alone produces the behaviour, and the same fault reproduces with no service worker running. No duplicate element IDs and no form-mapping error were found (`F.comp` and `F.compitem` are separate and correct). Other checks: no other action name is registered in two files.

## 2. The fix (smallest reliable change)
quality.js: the compliance actions are renamed so they no longer collide.
- `new-comp` to `new-compl`, `edit-comp` to `edit-compl`, `del-comp` to `del-compl` (3 handlers at lines 105-106 and 3 buttons in `viewCompliance`).
- prices.js is NOT renamed, so existing component code is untouched.

prices.js: the component form already had type, price source, coefficient, waste, manual unit price and unit. Added the missing optional **Notes** field (`note`, saved in `F.comp`, shown on the rate page) and clearer coefficient label. Old saved components have no `note` and load as before.

sw.js: cache version `ethcm-shell-v12` to `ethcm-shell-v13` so phones fetch the corrected files.

Calculation engine NOT changed: effective quantity = coefficient x (1 + waste%), cost = effective quantity x unit price, direct = sum, then overhead, profit, contingency and tax once, in the existing order, then x net BOQ quantity. Waste is applied once.

## 3. Test results (run against the whole app in a simulated browser with a real IndexedDB; 35 of 35 pass)
| Test | Result |
|---|---|
| 1 Form navigation: + Component opens "New component" (not "Add requirement") | PASS (same test on the original files FAILS: opens Add requirement) |
| 2 Create material (supplier quotation), labour (rate) and transport (manual) components | PASS |
| 3 Calculation: cement 2 x 1.05 x 100 = 210; mason 0.5 x 500 = 250; transport 1 x 50 = 50; direct 510 | PASS |
| 4 Several components on one item | PASS |
| 5 Item total and project total: 510 + overhead 10% + profit 5% + contingency 2% + tax 15% = 689.14 per m3; x 20 m3 = 13,782.80; cost page and rate page refresh; schedule = 42 bags | PASS |
| 6 Components (with notes) still there after reloading the app | PASS |
| 7 Compliance form still works: Add, Edit, Remove, "Add the checklist" | PASS |
| 8 Offline: every script and stylesheet in index.html is in the service-worker list, cache version bumped | PASS (static check only; see section 5) |
| 9 Existing items, materials, quotations, labour rates and BOQ quantities unchanged | PASS |
| 10 Cost-estimate CSV (direct 460.00, unit rate 621.58, total = rate x 20) and material-schedule CSV | PASS |
| Extra: edit and remove an existing component work | PASS |
| Extra: no button action is registered in two files; every button action has a handler | PASS |

Not tested here: a real phone and a real service worker; Excel export (the app exports CSV, which opens in Excel).

## 4. Files changed for this fix
quality.js, prices.js, sw.js. (The package also contains earlier updates: compguide.js, guide.js, i18n.js, prefs.js, view.js, modern.css, app.js, index.html, ops.js, styles.css, README.md. Upload the whole folder.)

If your repository still has only the original files, you can apply the fix by hand in quality.js: rename the three handler keys `new-comp`, `edit-comp`, `del-comp` in the compliance block to `new-compl`, `edit-compl`, `del-compl`, and the three `data-a="..."` values in `viewCompliance` to match. Bump the cache name in sw.js.

## 5. Deployment (GitHub Pages)
1. Unzip. In the repository open Add file, then Upload files, and upload ALL files together (the HTML, scripts and sw.js must match). Commit.
2. Wait about a minute for Pages to rebuild.
3. On the phone, open the app online and reload twice: the new service worker (v13) installs, then takes over.
4. Check: open a BOQ item, Unit Rate & Cost, tap + Component: the form says "New component". Then switch on airplane mode and reload: the app and the form still open.

## 6. Data protection
The fix changes code only. It does not touch IndexedDB or localStorage, does not clear caches of data, resets no settings, and changes no quantities or approved revisions. The service worker only replaces its own file cache (old `ethcm-shell-*` caches), never stored project data. The new Notes field is optional and old records work unchanged. Before updating, export a backup (Menu, Backup) as a precaution.

## 7. Rollback
1. In GitHub open the repository History, pick the commit before this update and choose Revert (or re-upload the previous files).
2. Reload the app twice on the phone. Saved data is not affected either way: components saved with a Notes field keep working, and the old version simply ignores that field.
3. If anything looks wrong, restore the backup file you exported in Menu, Backup (restore never overwrites newer local records).
