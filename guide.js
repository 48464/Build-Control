'use strict';
/* guide.js — in-app guide: what every module is for, the order to use them in, and worked examples.
   Adds: Menu → "How to use" card + a one-line description and step number on every tile,
   a full guide at #/guide and #/guide/<module>, and a collapsible "How to use this page" card on each module.
   All numbers in examples are illustrative only — the app has no built-in prices. */
(function () {
  const PHASES = [
    ['Phase 1 · Set up', 'Do these once, before any construction starts.'],
    ['Phase 2 · Plan and price', 'Turn the drawings into quantities, prices and a budget.'],
    ['Phase 3 · Organise the work', 'Schedule the work, register your people, order materials.'],
    ['Phase 4 · Build (repeat every day)', 'Record what actually happens on site.'],
    ['Phase 5 · Report and protect', 'Share results and keep your data safe.']
  ];
  // order = chronological step number; ph = index into PHASES
  const G = {
    projects: {
      ord: 1, ph: 0, short: 'Create the project and add your team.',
      what: 'A project is the container for everything else: tasks, drawings, BOQ, prices, money and files. The city you choose decides which local prices are used later.',
      steps: ['Open Projects and tap + New project.', 'Fill in name, type, construction location, number of storeys and total floor area. Budget and start date are optional and can be added later.', 'Open the project, then under Team tap + Add person. Enter their email and pick a role. If they have no account on this device, also give a name and a temporary password.', 'Use the project selector at the top of the screen to switch between projects.'],
      ex: 'Name: “G+1 Villa – Hawassa” · Type: Villa · City: Hawassa · Storeys: 2 · Floor area: 180 m² · Start: 1 Meskerem. Team: yourself as Owner, Abebe as Site supervisor, Hana as Accountant.',
      tip: 'Give each person the lowest role that lets them do their job. Only Owners, Administrators and Accountants edit finance.'
    },
    drawings: {
      ord: 2, ph: 0, short: 'Upload drawings and record measurements from them.',
      what: 'The place for architectural and structural drawings, each with revisions. You type in dimensions from the written values on the drawing; every measurement stays “Needs confirmation” until someone checks it.',
      steps: ['Tap + Upload. Choose the drawing type (floor plan, foundation plan, column layout…), give it a name and attach the PDF or image.', 'Open the drawing and tap + Measurement. Enter a label (e.g. “Ground floor external wall length”), the value, unit and where it came from (written dimension, CAD, scaled, estimate).', 'Check each measurement against the drawing and confirm it.', 'When the designer sends a changed drawing, upload it with the same name and type. It becomes the next revision, and any BOQ item using an older revision is flagged.'],
      ex: 'Upload “Ground floor plan” (Architectural floor plan, scale 1:100). Add measurements: “Wall length L1 = 12.5 m”, “Wall height = 3.0 m”, “Door D1 area = 2.1 m²”. Confirm all three.',
      tip: 'Measurements read from a scaled drawing are marked uncertain. Prefer written dimensions.'
    },
    compliance: {
      ord: 3, ph: 0, short: 'Track permits, approvals and legal requirements.',
      what: 'A register of what the authorities and professionals must approve. An item counts as verified only when someone confirms it with a reference number and date. The app does not state what the regulations are; you record what the authority told you.',
      steps: ['Tap + Add and pick or type a requirement (building permit, approved design drawings, utility connection approvals…).', 'Write the authority that issues it and the current status (Not checked, In progress, Compliant, Not compliant, Not applicable).', 'When you receive the approval, fill in who confirmed it, the date, the reference number and the expiry date if any.', 'Review the list regularly. Items without confirmation, and approvals nearing expiry, appear in Alerts.'],
      ex: 'Requirement: “Building permit” · Authority: city construction office · Status: Compliant · Reference: (number on the permit) · Confirmed by: you, on the date you collected it.',
      tip: 'Start the permit early: approvals often take longer than anything else.'
    },
    boq: {
      ord: 4, ph: 1, short: 'Calculate quantities with visible formulas.',
      what: 'The Bill of Quantities lists every work item with its quantity. Each quantity is a formula you can see: gross, less deductions, net, plus the waste percentage you choose. Prices are added later in Cost Estimation.',
      steps: ['Tap + Item and start from a template (excavation, concrete, masonry wall, plaster, reinforcement, roof…).', 'Add variables. Link each to a confirmed measurement from Drawings, or type a manual value.', 'Add deductions where needed (door and window openings) and set the waste percentage yourself.', 'Check the status chip: Draft, Needs confirmation, Verified or Error. Fix errors and confirm uncertain inputs.', 'When the list is complete, tap Approve revision. This freezes a numbered revision so later changes can be compared. Export CSV to share.'],
      ex: 'Masonry wall: formula L*H with L = 12.5 m and H = 3.0 m gives 37.5 m² gross. Deduction doors ND*DA = 2 × 2.1 = 4.2 m². Net = 33.3 m². With a 5% waste you chose, quantity to procure = 34.965 m².',
      tip: 'Never leave a variable at a guessed value. Link it to a measurement so it can be traced.'
    },
    suppliers: {
      ord: 5, ph: 1, short: 'Record materials, suppliers, quotations and labour/equipment rates.',
      what: 'Your price database. Nothing is built in: you enter what suppliers actually quote. Each quotation has a date and gets a reliability label (recently verified, expired, unverified…) so old prices are not used by mistake.',
      steps: ['Materials tab: tap + Material (name, category, specification, unit). You can also Import CSV.', 'Suppliers tab: tap + Supplier with name, city and phone.', 'Open a material and tap + Quotation: pick the supplier, price, delivery cost, date and validity.', 'Labour tab: tap + Labour rate (trade, city, daily rate, date verified, who told you).', 'Equipment tab: tap + Equipment rate (hire per day, fuel, transport).'],
      ex: 'Material: “Cement 50 kg bag” · Supplier: a Hawassa dealer · Quotation: price you were quoted, delivery included, dated today, valid 7 days. Labour: Mason, Hawassa, daily rate you were told by the foreman.',
      tip: 'Get at least two quotations per major material so the app can compare them.'
    },
    cost: {
      ord: 6, ph: 1, short: 'Build unit rates and the total cost estimate.',
      what: 'Combines quantities (BOQ) with prices to produce a cost estimate. Each item gets a unit-rate analysis of materials, labour, equipment and transport, then overhead, profit, contingency and tax are applied once, in a stated order.',
      steps: ['Open Pricing settings and choose the pricing method (lowest verified offer, selected supplier, average, or manual) and your overhead, profit, contingency and tax percentages.', 'Open a BOQ item and tap + Component for each material, labour and equipment line, with the quantity per unit of work.', 'Read the result. Items show Priced, Incomplete prices or Quantity error. Fix what is listed.', 'Check totals by stage and per m². Export CSV, or the Material schedule CSV for purchasing.'],
      ex: '1 m² of masonry wall: components might be blocks, cement and sand (materials), a mason and a labourer (labour days). The app multiplies each by the current verified price and adds the markups you set.',
      tip: 'Items whose quantity is not verified are still priced but are marked so you know the total is provisional.'
    },
    finance: {
      ord: 7, ph: 1, short: 'Budget, expenses, payments, contracts and variations.',
      what: 'Compares four numbers: estimate, budget, committed (contracts and orders) and actual spent. Expense (what you owe) and payment (what you paid) are separate records, so nothing is counted twice.',
      steps: ['On Overview, tap Set budget = current estimate, or set a budget when editing the project.', 'Contracts: tap + Contract for each contractor or supplier agreement with its value and scope.', 'When something is bought or work is done, tap + Expense with category, amount and receipt photo.', 'When you pay, open the expense and tap Record payment (amount, date, method, reference).', 'If a contract changes, add a + Variation. It changes the contract value only after someone else approves it.', 'Use Receipt rule to require a receipt above an amount you choose.'],
      ex: 'Contract: “Roofing – Contractor X” value you agreed. Expense: “Roofing sheets delivered” → status Unpaid. Payment of part of it by bank transfer → status Part paid, with the balance shown as outstanding.',
      tip: 'Photograph every receipt at the time of payment.'
    },
    tasks: {
      ord: 8, ph: 2, short: 'Create tasks, dependencies and the schedule.',
      what: 'The work plan. Each task has an owner, due date, status and a transparent priority score with its reasons (overdue, safety risk, blocks other work, material shortage). The Schedule tab shows a Gantt chart.',
      steps: ['Tap + Task. Enter title, assignee, start and due dates, and tick safety or cost impact if they apply.', 'Link the task to a BOQ item so progress and material shortages connect to it.', 'Choose its dependencies (tasks that must finish first) and whether it needs approval.', 'Update the status as work moves: To do, In progress, Blocked, Awaiting approval, Done.', 'Open the Schedule tab to see the Gantt chart.'],
      ex: 'Tasks in order: “Excavate foundation” → “Blind concrete” → “Foundation reinforcement” → “Pour footings”. Each depends on the one before, so a delay shows up on all later tasks.',
      tip: 'Tick “Needs approval” for tasks where an engineer must sign off before the next stage.'
    },
    labour: {
      ord: 9, ph: 2, short: 'Register workers and record daily attendance.',
      what: 'Your list of workers by trade and a daily attendance sheet (present, half day, absent) that feeds the daily report.',
      steps: ['Workers tab: tap + Worker for each person (name, trade, phone).', 'Attendance tab: pick the date and mark each worker Present, Half day or Absent.', 'Check the totals before you close the day.'],
      ex: 'Workers: Kebede (Mason), Almaz (General labourer), Tadesse (Steel fixer). Today: Kebede present, Almaz half day, Tadesse absent.',
      tip: 'Take attendance in the morning so it is not forgotten.'
    },
    inventory: {
      ord: 10, ph: 2, short: 'Stock, purchase orders and shortage warnings.',
      what: 'Tracks what you need (from the BOQ), what you ordered, what arrived and what is in stock. “To buy” lists the shortage for each material.',
      steps: ['Open Stock. Tap + Record movement and enter any opening stock first.', 'Check the To buy tab to see which materials are short against the BOQ.', 'Orders tab: tap + Order with material, supplier, quantity and expected delivery.', 'When a delivery arrives, record it as Received (delivery) against the order.', 'When materials go to work, record Issued to site work. Record damaged or returned items too.', 'The Log tab shows every movement.'],
      ex: 'BOQ needs a quantity of cement. Opening stock 0 → order placed → delivery received → issued to the foundation. Stock and the still-to-buy figure update after each step.',
      tip: 'Record movements the same day; the shortage warnings depend on it.'
    },
    daily: {
      ord: 11, ph: 3, short: 'Today\'s activities and the daily site report.',
      what: 'Your daily working page: tasks due today, and a daily report you can submit at the end of the day.',
      steps: ['Open Today in the bottom bar to see tasks for the day.', 'Mark attendance, record work done and materials used or received from the buttons shown.', 'At the end of the day, review the report and tap Submit report.'],
      ex: 'Today: “Pour footings F1–F4”. Record 4 footings done, cement issued, 6 workers present, then submit the report.',
      tip: 'Submit the report before leaving site; it becomes the record of the day.'
    },
    progress: {
      ord: 12, ph: 3, short: 'Measure real progress from verified quantities.',
      what: 'Physical progress is calculated from quantities actually completed, not guessed. Overall progress is weighted by cost or quantity, using the method you choose and see.',
      steps: ['Tap + Record work and pick the BOQ item.', 'Enter the quantity completed today, add photos and notes.', 'A supervisor approves the update if your project requires it.', 'Open Weighting method to choose how items are combined into overall progress.', 'Read the overall percentage and per-item bars; they feed the Home page.'],
      ex: 'Masonry wall item quantity 33.3 m². Today 10 m² built → item shows about 30%. Overall progress moves in proportion to that item\'s weight.',
      tip: 'Only record quantities that have been measured, not planned ones.'
    },
    quality: {
      ord: 13, ph: 3, short: 'Inspections and safety incidents.',
      what: 'Checklist-based inspections tied to a stage or BOQ item, plus incident and near-miss reports with severity and follow-up.',
      steps: ['Inspections tab: tap + Inspection, say what is inspected, the date and the stage.', 'Open it and mark each check Pass, Fail or N/A. Any Fail makes the inspection Failed.', 'Incidents tab: tap + Report for a near miss, injury or damage, with severity and where on site.', 'Update the report as actions are completed and close it when resolved.', 'Check Design revision impact to see BOQ items affected by a changed drawing.'],
      ex: 'Inspection: “Foundation reinforcement before pouring” – cover ✔, bar spacing ✔, bar size ✘ → Failed; fix, then re-inspect before the pour.',
      tip: 'Report near misses too. They are free lessons.'
    },
    files: {
      ord: 14, ph: 3, short: 'Photos, receipts, contracts and other documents.',
      what: 'One searchable place for all project files, with versions. A new version never overwrites the old one, and photos can carry a location stamp.',
      steps: ['Tap + Add, choose a category and attach the file or take a photo.', 'Add a date and note, and link it to a task, expense or other record if relevant.', 'To replace a document, open it and tap Upload new version.', 'Use search and the category filter to find files.'],
      ex: 'Category: Site photographs · note: “Slab formwork before pour” · linked to the task “Pour first-floor slab”.',
      tip: 'Backups include files only if you tick the option when exporting.'
    },
    reports: {
      ord: 15, ph: 4, short: 'Weekly, monthly, BOQ and finance reports.',
      what: 'Ready-made reports built from your records: weekly and monthly summaries, detailed and summary BOQ, takeoff, material, labour and equipment schedules, unit rates, supplier comparison, cost by stage and per m², revision comparison, and finance.',
      steps: ['Open Reports and pick a report.', 'Choose the week or month if it is a periodic report.', 'Review it on screen.', 'Export it as Excel or CSV to share with the owner, bank or contractor.'],
      ex: 'Monthly report at the end of Tikimt: progress, expenses, incidents and open tasks, exported to Excel for the owner.',
      tip: 'Finance reports show only to roles allowed to see finance.'
    },
    backup: {
      ord: 16, ph: 4, short: 'Export and restore an encrypted backup.',
      what: 'All data lives only on this device until server sync exists. A backup file is your only protection against a lost or reset phone.',
      steps: ['Open Backup & Synchronization.', 'Tap Export, set a passphrase (strongly recommended), and tick “include drawings, photos and documents” if you want them.', 'Save the file somewhere safe: another phone, email to yourself, or cloud storage.', 'To restore on a new device, choose the backup file, enter the passphrase and restore. Newer local records are never overwritten.'],
      ex: 'Every Friday evening: export “ethiobuild-backup-date.json” with a passphrase, and send it to yourself.',
      tip: 'Without the passphrase an encrypted backup cannot be opened. Write it down separately.'
    },
    dashboard: {
      ord: 0, ph: -1, short: 'Your project at a glance. Check it any time.',
      what: 'Urgent tasks, physical progress, spending against budget and alerts for the selected project.',
      steps: ['Choose the project at the top.', 'Read the cards: physical progress and actual spent.', 'Tap an urgent task to see why it ranks high.', 'Open Alerts for overdue work, shortages, stale prices and expiring approvals.'],
      ex: 'Physical progress 12.5% · Actual spent 18% of budget. If spending is well ahead of progress, look at Finance.',
      tip: 'Compare progress against spending regularly.'
    },
    settings: {
      ord: 0, ph: -1, short: 'Theme, account, activity log.',
      what: 'Your account, light or dark theme, and the audit log of recent changes.',
      steps: ['Open Settings from the menu.', 'Choose Match device, Light or Dark.', 'Review the activity log to see who changed what.'],
      ex: 'The log shows “Update · expenses · Roofing sheets delivered” with user and time.',
      tip: 'Sign out on shared phones.'
    }
  };
  const ORDER = Object.keys(G).filter(k => G[k].ord > 0).sort((a, b) => G[a].ord - G[b].ord);
  const sec = k => SECTIONS.find(s => s.k === k) || { n: k, i: '•', a: null };
  const access = k => { const s = sec(k); if (!s.a) return 'Everyone on the project'; return can(s.a, 'e') ? 'You can edit' : can(s.a) ? 'You can view only' : 'Your role has no access'; };
  const isProd = k => G[k] && G[k].ord > 0;
  const ol = a => `<ol class="gsteps">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;

  function view(k) {
    const g = G[k]; if (!g) return overview();
    const s = sec(k); const i = ORDER.indexOf(k); const prev = i > 0 ? ORDER[i - 1] : null, next = i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null;
    const href = k === 'dashboard' ? '#/dashboard' : `#/${k}`;
    return `<a href="#/guide" class="small muted">← Guide</a><h1>${s.i} ${esc(s.n)}</h1>
    <div class="card"><div class="row"><span class="badge">${g.ord ? 'Step ' + g.ord + ' of ' + ORDER.length : 'Use any time'}</span><span class="badge">${access(k)}</span></div>
    <h2>What it is</h2><p>${esc(g.what)}</p>
    <h2>Steps</h2>${ol(g.steps)}
    <h2>Example</h2><div class="gex">${esc(g.ex)}<div class="muted small">Illustrative only. Use your own quantities and the prices you are quoted.</div></div>
    <h2>Tip</h2><p>${esc(g.tip)}</p>
    <div class="row" style="margin-top:10px;justify-content:flex-start"><a class="sm primary gbtn" href="${href}">Open ${esc(s.n)}</a></div></div>
    <div class="row">${prev ? `<a class="sm gbtn" href="#/guide/${prev}">← ${esc(sec(prev).n)}</a>` : '<span></span>'}${next ? `<a class="sm gbtn" href="#/guide/${next}">${esc(sec(next).n)} →</a>` : ''}</div>`;
  }
  function overview() {
    let out = `<h1>📖 How to use EthioBuild</h1><div class="card small">Follow the steps in this order for a new project. Each module has its own guide with steps and a worked example. Start at step 1; you can come back to earlier steps at any time.</div>`;
    PHASES.forEach(([t, d], p) => {
      const ks = ORDER.filter(k => G[k].ph === p); if (!ks.length) return;
      out += `<h2>${t}</h2><p class="muted small">${d}</p>` + ks.map(k => `<a class="card gstep" href="#/guide/${k}"><span class="gnum">${G[k].ord}</span><div><b>${sec(k).i} ${esc(sec(k).n)}</b><div class="muted small">${esc(G[k].short)}</div></div></a>`).join('');
    });
    out += `<h2>Any time</h2>` + ['dashboard', 'settings'].map(k => `<a class="card gstep" href="#/guide/${k}"><span class="gnum">•</span><div><b>${sec(k).i} ${esc(sec(k).n)}</b><div class="muted small">${esc(G[k].short)}</div></div></a>`).join('');
    return out;
  }

  // ----- Menu: guide card + description and step number on every tile -----
  window.viewMenu = function () {
    if (!curProject()) return emptyProject();
    const items = SECTIONS.filter(s => s.a === null || can(s.a));
    return `<h1>Menu</h1><a class="card gstep" href="#/guide"><span class="gnum">📖</span><div><b>How to use EthioBuild</b><div class="muted small">What each part does, the order to follow and examples</div></div></a>
    <div class="menu">${items.map(s => { const g = G[s.k]; return `<a href="#/${s.live ? s.k : 's/' + s.k}"><span>${s.i}</span>${esc(s.n)}<div class="tag">${s.live ? 'Available' : 'Phase ' + s.ph}${g && g.ord ? ' · Step ' + g.ord : ''}</div>${g ? `<small class="gdesc">${esc(g.short)}</small>` : ''}</a>`; }).join('')}</div>`;
  };

  // ----- Collapsible help card on each module page (open the first time you visit) -----
  function helpCard(k) {
    const g = G[k]; if (!g) return '';
    let open = false; try { const key = 'gseen:' + k; if (!localStorage.getItem(key)) { open = true; localStorage.setItem(key, '1'); } } catch { }
    return `<details class="card ghelp" ${open ? 'open' : ''}><summary>❓ How to use this page</summary><p class="small">${esc(g.what)}</p>${ol(g.steps.slice(0, 4))}<a class="small" href="#/guide/${k}"><u>Full guide with example</u></a></details>`;
  }
  const guarded = k => { const s = sec(k); return curProject() && (!s.a || can(s.a)); };
  for (const k of ['drawings', 'boq', 'suppliers', 'cost', 'finance', 'inventory', 'labour', 'tasks', 'progress', 'daily', 'quality', 'files', 'compliance', 'reports']) {
    const orig = ROUTES[k]; if (!orig) continue;
    ROUTES[k] = async (...a) => { const h = await orig(...a); return (guarded(k) ? helpCard(k) : '') + h; };
  }
  for (const [name, k] of [['viewDashboard', 'dashboard'], ['viewProjects', 'projects']]) {
    const orig = window[name]; if (typeof orig !== 'function') continue;
    window[name] = (...a) => { const h = orig(...a); return (curProject() ? helpCard(k) : '') + h; };
  }
  ROUTES.guide = t => t ? view(t) : overview();
})();
