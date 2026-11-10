'use strict';
/* Ethiopian Construction Management Platform — Phase 1 core (offline-first PWA) */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysUntil = s => s ? Math.round((Date.parse(s + 'T00:00:00') - Date.parse(todayStr() + 'T00:00:00')) / 864e5) : null;
const etb = n => n == null || n === '' ? 'Not set' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' ETB';
const DEVICE = (() => { let d = localStorage.getItem('deviceId'); if (!d) { d = uid(); localStorage.setItem('deviceId', d); } return d; })();

// ---------- reference data ----------
const STORES = ['users', 'projects', 'members', 'tasks', 'audit', 'drawings', 'measurements', 'boqitems', 'boqrevs', 'files', 'materials', 'suppliers', 'quotes', 'labourrates', 'equiprates', 'rates', 'pricing'];
const PRICE_STORES = ['materials', 'suppliers', 'quotes', 'labourrates', 'equiprates', 'rates', 'pricing'];
const BACKUP_STORES = STORES.filter(s => s !== 'files'); // drawing files are not in backups yet
const ROUTES = {}, DASH_EXT = {}; // extension points used by boq.js
const CITIES = ['Shashamane', 'Addis Ababa', 'Hawassa', 'Adama', 'Bishoftu', 'Jimma', 'Bahir Dar', 'Dire Dawa', 'Other'];
const TYPES = ['Single-storey house', 'Multi-storey residential', 'Villa', 'Apartments', 'Small commercial', 'Other'];
const STAGES = ['Preliminary works', 'Earthworks', 'Foundation & substructure', 'Structural works', 'Masonry', 'Roofing', 'Doors & windows', 'Plastering & finishing', 'Electrical installations', 'Plumbing & sanitation', 'External works'];
const ROLE_LABEL = { owner: 'Owner', administrator: 'Administrator', contractor: 'Contractor', project_manager: 'Project manager', site_supervisor: 'Site supervisor', engineer: 'Engineer', quantity_surveyor: 'Quantity surveyor', accountant: 'Accountant', storekeeper: 'Storekeeper', labour_supervisor: 'Labour supervisor', viewer: 'Read-only viewer' };
// Access levels per area: e = edit, v = view, n = none
const AREAS = ['tasks', 'finance', 'drawings', 'boq', 'inventory', 'labour', 'quality', 'files', 'compliance', 'reports', 'members', 'admin'];
const ROLE_ACCESS = {
  owner: 'eeeeeeeeeeee', administrator: 'eeeeeeeeeeee', contractor: 'evvveeeevvnn', project_manager: 'eveeeeeeeevn',
  site_supervisor: 'envveeeevvnn', engineer: 'vneevveeevnn', quantity_surveyor: 'vvvevvvevenn', accountant: 'venvvvnenvnn',
  storekeeper: 'vnnvevvenvnn', labour_supervisor: 'envnvevenvnn', viewer: 'vnvvvvvvvvnn'
};
const can = (area, need = 'v') => {
  const r = myRole(); if (!r) return false;
  const l = ROLE_ACCESS[r][AREAS.indexOf(area)];
  return need === 'e' ? l === 'e' : l === 'e' || l === 'v';
};

// area null = always visible. phase = phase in which the full module arrives.
const SECTIONS = [
  { k: 'dashboard', n: 'Dashboard', i: '🏠', a: null, ph: 1, live: true },
  { k: 'daily', n: 'Daily Activities', i: '📅', a: 'tasks', ph: 4, live: true, note: 'Task-based view. Labour, materials and expenses arrive in Phase 4–5.' },
  { k: 'projects', n: 'Projects', i: '🏗️', a: null, ph: 1, live: true },
  { k: 'drawings', n: 'Design & Drawings', i: '📐', a: 'drawings', ph: 2, plan: ['Upload PDF, image, DXF, DWG, IFC', 'Drawing revisions', 'User-confirmed dimensions; uncertain values flagged'] },
  { k: 'boq', n: 'BOQ & Quantity Takeoff', i: '📋', a: 'boq', ph: 2, plan: ['Transparent formulas for every item', 'Gross, deductions, net, waste (editable)', 'Approval with preserved versions'] },
  { k: 'cost', n: 'Cost Estimation', i: '🧮', a: 'boq', ph: 3, plan: ['Unit-rate analysis', 'City-specific prices', 'Visible pricing method'] },
  { k: 'finance', n: 'Budget & Finance', i: '💰', a: 'finance', ph: 5, plan: ['Estimate vs budget vs committed vs actual vs paid', 'Receipts as evidence', 'No double counting of expense and payment'] },
  { k: 'inventory', n: 'Materials & Inventory', i: '🧱', a: 'inventory', ph: 4, plan: ['Stock in, issue, consumption', 'BOQ vs stock vs ordered', 'Shortage warnings'] },
  { k: 'suppliers', n: 'Suppliers & Procurement', i: '🚚', a: 'inventory', ph: 3, plan: ['Quotations with validity dates', 'Compare equivalent materials only', 'Purchase orders'] },
  { k: 'labour', n: 'Labour & Workforce', i: '👷', a: 'labour', ph: 4, plan: ['Attendance', 'Rates and productivity (verified, dated)'] },
  { k: 'tasks', n: 'Tasks & Scheduling', i: '✅', a: 'tasks', ph: 4, live: true, note: 'Tasks are live. Gantt, dependencies and calendar arrive in Phase 4.' },
  { k: 'progress', n: 'Progress Monitoring', i: '📈', a: 'tasks', ph: 4, plan: ['Progress from verified quantities', 'Weighted overall progress with stated method'] },
  { k: 'quality', n: 'Quality & Safety', i: '🦺', a: 'quality', ph: 6, plan: ['Inspections and approvals', 'Incident and near-miss reports'] },
  { k: 'files', n: 'Files & Media', i: '📎', a: 'files', ph: 5, plan: ['Photos, receipts, drawings, contracts', 'Version history; no silent overwrite'] },
  { k: 'compliance', n: 'Ethiopian Building Compliance', i: '⚖️', a: 'compliance', ph: 6, plan: ['Regulation library with source and verification date', 'Checklist; unverified items flagged for professional review'] },
  { k: 'reports', n: 'Reports & Analytics', i: '📊', a: 'reports', ph: 5, plan: ['Daily, weekly, monthly reports', 'PDF, Excel, CSV export'] },
  { k: 'backup', n: 'Backup & Synchronization', i: '☁️', a: 'admin', ph: 7, live: true, note: 'Local encrypted export and verified restore are live. Server sync arrives in Phase 7.' },
  { k: 'settings', n: 'Settings & Administration', i: '⚙️', a: null, ph: 1, live: true }
];

// ---------- IndexedDB ----------
let db;
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open('ethiopian-construction', 3);
  r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = (store, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(store, mode); const out = fn(t.objectStore(store));
  t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
});
const dbAll = s => tx(s, 'readonly', st => st.getAll());
const dbGet = (s, id) => tx(s, 'readonly', st => st.get(id));
const dbPut = (s, o) => tx(s, 'readwrite', st => st.put(o));

async function audit(action, store, recId, summary, projectId) {
  await dbPut('audit', { id: uid(), at: new Date().toISOString(), action, store, recId, summary, projectId: projectId || null, userId: S.user?.id || null, userName: S.user?.name || null, deviceId: DEVICE });
}
// Every record carries id, version, timestamps, device and sync state. Edits are audited.
async function save(store, rec, summary) {
  const old = rec.id ? await dbGet(store, rec.id) : null;
  const now = new Date().toISOString();
  const r = { ...rec, id: rec.id || uid(), version: (old?.version || 0) + 1, createdAt: old?.createdAt || now, updatedAt: now, deviceId: DEVICE, sync: 'local' };
  await dbPut(store, r);
  await audit(old ? 'update' : 'create', store, r.id, summary, r.projectId || (store === 'projects' ? r.id : null));
  return r;
}

// ---------- crypto ----------
const te = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', te.encode(s)));
async function pwHash(pw, saltHex) {
  const km = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: 150000, hash: 'SHA-256' }, km, 256));
}
async function aesKey(pass, salt) {
  const km = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---------- state ----------
const S = { user: null, users: [], projects: [], members: [], tasks: [], drawings: [], measurements: [], boqitems: [], boqrevs: [], materials: [], suppliers: [], quotes: [], labourrates: [], equiprates: [], rates: [], pricing: [], pid: localStorage.getItem('proj') };
const myRole = () => S.user && S.pid ? S.members.find(m => m.projectId === S.pid && m.userId === S.user.id)?.role : null;
const curProject = () => S.projects.find(p => p.id === S.pid);
const userName = id => S.users.find(u => u.id === id)?.name || '';
const projTasks = () => S.tasks.filter(t => t.projectId === S.pid);
const cityOf = p => p.city === 'Other' ? (p.cityOther || 'Other') : p.city;

async function load() {
  const [users, projects, members, tasks, drawings, measurements, boqitems, boqrevs] = await Promise.all(['users', 'projects', 'members', 'tasks', 'drawings', 'measurements', 'boqitems', 'boqrevs'].map(dbAll));
  for (const s of PRICE_STORES) S[s] = await dbAll(s);
  S.users = users; S.drawings = drawings; S.measurements = measurements; S.boqitems = boqitems; S.boqrevs = boqrevs;
  S.members = members.filter(m => !m.deleted);
  const mine = S.members.filter(m => m.userId === S.user.id).map(m => m.projectId);
  S.projects = projects.filter(p => !p.deleted && mine.includes(p.id));
  S.tasks = tasks.filter(t => !t.deleted);
  if (!S.projects.find(p => p.id === S.pid)) S.pid = S.projects[0]?.id || null;
  if (S.pid) localStorage.setItem('proj', S.pid);
}
async function countLocal() {
  let n = 0; for (const s of ['users', 'projects', 'members', 'tasks', 'drawings', 'measurements', 'boqitems', 'boqrevs', ...PRICE_STORES]) n += (await dbAll(s)).filter(r => r.sync === 'local').length; return n;
}

// ---------- priority (transparent, rule-based) ----------
function priority(t) {
  if (t.status === 'done') return { level: 'Completed', score: 0, why: ['Marked complete by a user'] };
  let s = 0; const why = []; const d = daysUntil(t.due);
  if (d !== null) {
    if (d < 0) { s += 40; why.push(`Overdue by ${-d} day(s)`); }
    else if (d === 0) { s += 30; why.push('Due today'); }
    else if (d <= 2) { s += 20; why.push('Due within 2 days'); }
    else if (d <= 7) { s += 10; why.push('Due within a week'); }
  }
  if (t.safety) { s += 35; why.push('Safety risk'); }
  if (t.cost) { s += 15; why.push('Financial impact'); }
  if (t.blocks) { s += 15; why.push('Later work depends on it'); }
  if (t.status === 'blocked') { s += 10; why.push('Currently blocked'); }
  let level = s >= 60 ? 'Critical' : s >= 40 ? 'High' : s >= 20 ? 'Medium' : 'Low';
  if (t.manualPriority && t.manualPriority !== 'auto') { level = t.manualPriority; why.push('Priority set manually'); }
  return { level, score: s, why };
}
const STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };

// ---------- UI helpers ----------
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
const openSheet = h => { $('#sheet').innerHTML = `<div class="sheet-body">${h}</div>`; $('#sheet').showModal(); };
const closeSheet = () => $('#sheet').open && $('#sheet').close();
const fld = (label, name, val = '', o = {}) => `<label>${label}<input name="${name}" value="${esc(val)}" type="${o.type || 'text'}" ${o.req ? 'required' : ''} ${o.attrs || ''}></label>`;
const sel = (label, name, opts, val) => `<label>${label}<select name="${name}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
const chk = (label, name, on) => `<label class="chk"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
const cancelBtn = `<button type="button" data-a="close">Cancel</button>`;

// ---------- auth ----------
async function createUser(name, email, pw) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return save('users', { name, email, salt, hash: await pwHash(pw, salt) }, `User ${name} created`);
}
function authView(mode) {
  const create = mode === 'create';
  $('#app').hidden = true; $('#auth').hidden = false;
  $('#auth').innerHTML = `<div class="auth-box card"><h1>${create ? 'Create your account' : 'Sign in'}</h1>
  <p class="muted small">Accounts are stored on this device only until server sync is added (Phase 7).</p>
  <form data-f="${create ? 'signup' : 'login'}">
    ${create ? fld('Full name', 'name', '', { req: 1 }) : ''}
    ${fld('Email', 'email', '', { type: 'email', req: 1 })}
    ${fld('Password' + (create ? ' (8+ characters)' : ''), 'password', '', { type: 'password', req: 1, attrs: 'autocomplete="' + (create ? 'new-password' : 'current-password') + '" minlength="' + (create ? 8 : 1) + '"' })}
    <div class="err"></div>
    <button class="primary" style="width:100%">${create ? 'Create account' : 'Sign in'}</button>
  </form>
  <p class="small"><a href="#" data-a="${create ? 'to-login' : 'to-create'}"><u>${create ? 'I already have an account' : 'Create a new account'}</u></a></p>
  <label class="small">Restore from a backup file<input type="file" id="restore-auth" accept=".json,application/json"></label></div>`;
}

// ---------- shell ----------
async function renderShell() {
  const pending = await countLocal();
  const r = myRole();
  $('#top').innerHTML = `<span class="brand"><span class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></span>${S.projects.length ? '' : 'EthioBuild'}</span>
    ${S.projects.length ? `<select id="projsel" aria-label="Current project">${S.projects.map(p => `<option value="${p.id}" ${p.id === S.pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
    <span class="badge ${navigator.onLine ? '' : 'off'}" title="Records are stored on this device. Nothing is backed up to a server yet.">${navigator.onLine ? '' : 'Offline · '}Saved locally${pending ? ' · ' + pending : ''}</span>`;
  const h = location.hash;
  const on = k => h === '#/' + k || (k === 'dashboard' && (h === '' || h === '#/')) ? 'on' : '';
  const IC = { dashboard: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', daily: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>', projects: '<path d="M3 20h18"/><path d="M6 20V8l6-4 6 4v12"/><path d="M10 20v-5h4v5"/>', tasks: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>' };
  $('#bottom').innerHTML = [['dashboard', 'Home'], ['daily', 'Today'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['menu', 'Menu']]
    .map(([k, l]) => `<a href="#/${k}" class="${on(k) || (k === 'menu' && /#\/(s\/|settings|backup|menu|drawings?|boq|suppliers|material|cost|rate)/.test(h) ? 'on' : '')}"><svg viewBox="0 0 24 24">${IC[k]}</svg>${l}</a>`).join('');
  return r;
}

// ---------- views ----------
const emptyProject = () => `<div class="card"><h1>Welcome</h1><p>Create your first project to begin. A project holds your tasks, team and, in later phases, drawings, BOQ and costs.</p><button class="primary" data-a="new-project">Create project</button></div>`;
const locked = () => `<div class="card"><h1>No access</h1><p class="muted">Your role on this project does not include this area. The project owner controls who can see financial records, drawings and other private information.</p></div>`;

function taskCard(t) {
  const pr = priority(t); const edit = can('tasks', 'e'); const as = userName(t.assignee);
  return `<article class="card task p-${pr.level.toLowerCase()}"><div class="row"><strong>${esc(t.title)}</strong><span class="chip ${pr.level}">${pr.level}</span></div>
  <div class="muted small">${t.due ? 'Due ' + esc(t.due) : 'No due date'} · ${STATUS[t.status] || 'To do'}${t.stage ? ' · ' + esc(t.stage) : ''}${as ? ' · ' + esc(as) : ''}</div>
  ${t.status === 'blocked' && t.blockReason ? `<div class="small"><b>Blocked:</b> ${esc(t.blockReason)}</div>` : ''}
  <div class="small muted">Why: ${pr.why.length ? pr.why.map(esc).join(' · ') : 'No urgency factors recorded'}</div>
  ${edit ? `<div class="row" style="margin-top:8px;justify-content:flex-start">${t.status === 'done' ? `<button class="sm" data-a="reopen-task" data-id="${t.id}">Reopen</button>` : `<button class="sm primary" data-a="done-task" data-id="${t.id}">Mark done</button>`}<button class="sm" data-a="edit-task" data-id="${t.id}">Edit</button></div>` : ''}</article>`;
}
const taskList = (ts, empty) => ts.length ? ts.map(taskCard).join('') : `<p class="muted small">${empty}</p>`;
const soon = (title, text) => `<div class="card"><b>${title}</b><div class="muted small">${text}</div></div>`;
const byScore = ts => [...ts].sort((a, b) => priority(b).score - priority(a).score);

function openTasks() { return projTasks().filter(t => t.status !== 'done'); }

function viewDashboard() {
  const p = curProject(); if (!p) return emptyProject();
  const r = myRole(); const all = projTasks(); const open = openTasks();
  const today = open.filter(t => t.due === todayStr());
  const overdue = open.filter(t => daysUntil(t.due) !== null && daysUntil(t.due) < 0);
  const blocked = open.filter(t => t.status === 'blocked');
  const ranked = byScore(open);
  const done = all.filter(t => t.status === 'done').length;
  const C = {
    kpi: () => `<div class="grid"><div class="kpi"><span class="muted small">Approved budget</span><b>${etb(p.budget)}</b></div><div class="kpi"><span class="muted small">Actual spent</span><b>Not recorded</b><span class="tag">Expenses: Phase 5</span></div><div class="kpi"><span class="muted small">Physical progress</span><b>Not measured</b><span class="tag">From verified quantities: Phase 4</span></div><div class="kpi"><span class="muted small">Tasks completed</span><b>${done} / ${all.length}</b><span class="tag">Task count, not construction progress</span></div></div>`,
    next: () => `<h2>Next most important action</h2>${ranked[0] ? taskCard(ranked[0]) : '<p class="muted small">No open tasks.</p>'}`,
    today: () => `<h2>Today (${today.length})</h2>${taskList(byScore(today), 'Nothing is due today.')}`,
    overdue: () => `<h2>Overdue (${overdue.length})</h2>${taskList(byScore(overdue), 'Nothing is overdue. Overdue tasks stay open until someone completes them.')}`,
    blocked: () => `<h2>Delaying the project (${blocked.length})</h2>${taskList(blocked, 'No blocked tasks recorded.')}`,
    approvals: () => soon('Needs approval', 'Inspections and approvals arrive in Phase 6.'),
    materials: () => soon('Materials needed', 'Material schedules arrive with the BOQ and inventory modules (Phases 2–4).'),
    money: () => soon('Money spent', 'Expenses and payments arrive in Phase 5.'),
    drawings: () => soon('Drawings and technical reviews', 'Drawing management arrives in Phase 2.'),
    compliance: () => soon('Inspections and compliance', 'Compliance checklist arrives in Phase 6.'),
    labour: () => soon('Labour attendance', 'Attendance arrives in Phase 4.')
  };
  const LAYOUT = {
    owner: ['kpi', 'next', 'boq', 'cost', 'overdue', 'blocked', 'approvals', 'money'],
    administrator: ['kpi', 'next', 'overdue', 'blocked', 'approvals'],
    project_manager: ['next', 'boq', 'cost', 'today', 'overdue', 'blocked', 'materials'],
    contractor: ['next', 'today', 'overdue', 'blocked', 'labour', 'materials'],
    site_supervisor: ['today', 'overdue', 'blocked', 'labour', 'materials', 'approvals'],
    engineer: ['next', 'today', 'overdue', 'drawings', 'boq', 'compliance'],
    quantity_surveyor: ['next', 'drawings', 'boq', 'cost', 'money', 'overdue'],
    accountant: ['money', 'kpi', 'overdue'],
    storekeeper: ['materials', 'today', 'overdue'],
    labour_supervisor: ['labour', 'today', 'overdue', 'blocked'],
    viewer: ['kpi', 'overdue', 'blocked']
  };
  Object.assign(C, DASH_EXT);
  const keys = (LAYOUT[r] || LAYOUT.viewer).filter(k => k !== 'kpi' || can('finance') || r === 'owner');
  return `<h1>${esc(p.name)}</h1><p class="muted small">${esc(cityOf(p))} · ${ROLE_LABEL[r]} view</p>${keys.map(k => C[k]()).join('')}`;
}

function viewDaily() {
  const p = curProject(); if (!p) return emptyProject();
  if (!can('tasks')) return locked();
  const all = projTasks(); const open = all.filter(t => t.status !== 'done');
  const today = open.filter(t => t.due === todayStr());
  const overdue = open.filter(t => daysUntil(t.due) !== null && daysUntil(t.due) < 0);
  const doing = open.filter(t => t.status === 'doing');
  const doneToday = all.filter(t => t.status === 'done' && t.doneDate === todayStr());
  return `<div class="row"><h1>Today · ${todayStr()}</h1>${can('tasks', 'e') ? `<button class="primary" data-a="new-task">+ Task</button>` : ''}</div>
  <h2>Planned today (${today.length})</h2>${taskList(byScore(today), 'No tasks due today.')}
  <h2>Overdue (${overdue.length})</h2>${taskList(byScore(overdue), 'None.')}
  <h2>In progress (${doing.length})</h2>${taskList(doing, 'None.')}
  <h2>Completed today (${doneToday.length})</h2>${taskList(doneToday, 'None yet.')}
  <h2>Still to come</h2>${soon('Labour attendance · deliveries · expenses · photos', 'Recorded from Phases 4–5. The daily report will be generated from those records.')}`;
}

function viewTasks() {
  const p = curProject(); if (!p) return emptyProject();
  if (!can('tasks')) return locked();
  const ts = projTasks(); const open = byScore(ts.filter(t => t.status !== 'done')); const done = ts.filter(t => t.status === 'done');
  return `<div class="row"><h1>Tasks</h1>${can('tasks', 'e') ? `<button class="primary" data-a="new-task">+ Task</button>` : ''}</div>
  <p class="muted small">Priority is calculated from deadline, safety, financial impact and dependency flags. A passed deadline never completes a task. Material and labour availability join the score in Phase 4.</p>
  ${taskList(open, 'No open tasks.')}<h2>Completed (${done.length})</h2>${taskList(done, 'None.')}`;
}

function viewProjects() {
  return `<div class="row"><h1>Projects</h1><button class="primary" data-a="new-project">+ New project</button></div>
  ${S.projects.length ? S.projects.map(p => { const r = S.members.find(m => m.projectId === p.id && m.userId === S.user.id)?.role; return `<a class="card" style="display:block" href="#/project/${p.id}"><div class="row"><strong>${esc(p.name)}</strong><span class="badge">${p.status === 'archived' ? 'Archived' : ROLE_LABEL[r]}</span></div><div class="muted small">${esc(p.type)} · ${esc(cityOf(p))}${p.area ? ' · ' + p.area + ' m²' : ''}</div></a>`; }).join('') : emptyProject()}`;
}

function viewProject(id) {
  const p = S.projects.find(x => x.id === id); if (!p) return `<div class="card">Project not found.</div>`;
  const ms = S.members.filter(m => m.projectId === id);
  const mgr = can('members', 'e') && S.pid === id;
  return `<a href="#/projects" class="small muted">← Projects</a><h1>${esc(p.name)}</h1>
  <div class="card small">Type: ${esc(p.type)}<br>Location: ${esc(cityOf(p))}<br>Storeys: ${p.floors ?? '—'} · Floor area: ${p.area ? p.area + ' m²' : '—'}<br>Approved budget: ${etb(p.budget)}<br>Start: ${esc(p.start || '—')}<br>Status: ${p.status === 'archived' ? 'Archived' : 'Active'}${p.notes ? '<br>Notes: ' + esc(p.notes) : ''}
  ${S.pid !== id ? `<div style="margin-top:8px"><button class="sm" data-a="switch" data-id="${id}">Open this project</button></div>` : ''}
  ${mgr ? `<div class="row" style="margin-top:8px;justify-content:flex-start"><button class="sm" data-a="edit-project" data-id="${id}">Edit</button>${p.status !== 'archived' ? `<button class="sm danger" data-a="archive-project" data-id="${id}">Archive</button>` : ''}</div>` : ''}</div>
  <div class="row"><h2>Team</h2>${mgr ? `<button class="sm primary" data-a="add-member">+ Add person</button>` : ''}</div>
  ${ms.map(m => `<div class="card row"><div><b>${esc(userName(m.userId))}</b><div class="muted small">${ROLE_LABEL[m.role]}</div></div>${mgr && m.role !== 'owner' ? `<button class="sm danger" data-a="remove-member" data-id="${m.id}">Remove</button>` : ''}</div>`).join('')}
  <p class="muted small">Roles control access: for example, only owners, administrators, accountants and (view-only) managers and surveyors see finance.</p>`;
}

function viewMenu() {
  if (!curProject()) return emptyProject();
  const items = SECTIONS.filter(s => s.a === null || can(s.a));
  return `<h1>Menu</h1><div class="menu">${items.map(s => `<a href="#/${s.live ? s.k : 's/' + s.k}"><span>${s.i}</span>${esc(s.n)}<div class="tag">${s.live ? 'Available' : 'Phase ' + s.ph}</div></a>`).join('')}</div>`;
}

function viewPlanned(k) {
  const s = SECTIONS.find(x => x.k === k); if (!s) return `<div class="card">Unknown section.</div>`;
  if (s.a && !can(s.a)) return locked();
  return `<h1>${s.i} ${esc(s.n)}</h1><div class="card"><span class="badge">Planned · Phase ${s.ph}</span><p>This module is not built yet. Planned scope:</p><ul class="plain">${(s.plan || [s.note]).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}

async function viewSettings() {
  const log = (await dbAll('audit')).filter(a => !a.projectId || a.projectId === S.pid).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  const theme = localStorage.getItem('theme') || 'auto';
  return `<h1>Settings</h1>
  <div class="card"><b>${esc(S.user.name)}</b><div class="muted small">${esc(S.user.email)}</div><div style="margin-top:8px"><button data-a="signout">Sign out</button></div></div>
  <div class="card"><label>Theme<select id="theme"><option value="auto" ${theme === 'auto' ? 'selected' : ''}>Match device</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option></select></label>
  <label>Language<select disabled><option>English</option></select></label><div class="muted small">Amharic and Afaan Oromo are planned. Currency is ETB; units are metric.</div></div>
  <div class="card small"><b>This device</b><br>ID: ${esc(DEVICE.slice(0, 8))}…<br>Sign-in on this device is stored locally. Remote device revocation needs the Phase 7 server.</div>
  <h2>Activity log</h2>${log.length ? log.map(a => `<div class="small card"><b>${esc(a.summary || a.action)}</b><div class="muted">${esc(a.at.slice(0, 16).replace('T', ' '))} UTC · ${esc(a.userName || '')} · ${esc(a.store)} ${esc(a.action)}</div></div>`).join('') : '<p class="muted small">No activity.</p>'}`;
}

async function viewBackup() {
  if (!can('admin')) return locked();
  const counts = {}; for (const s of BACKUP_STORES) counts[s] = (await dbAll(s)).length;
  const last = JSON.parse(localStorage.getItem('lastBackup') || 'null'); const pending = await countLocal();
  return `<h1>Backup & Synchronization</h1>
  <div class="card"><b>Sync state</b><p>Saved locally on this device: ${pending} record(s). Server synchronization is <b>not configured</b>, so no record is synchronized or backed up off this device yet.</p>
  <p class="muted small">States that will be supported once a server exists: pending, synchronizing, synchronized, failed, conflict requires attention.</p></div>
  <div class="card"><b>Export a backup file</b><p class="small muted">Records: ${Object.entries(counts).map(([k, v]) => k + ' ' + v).join(' · ')}. The file includes account password hashes, so set a passphrase to encrypt it (AES-GCM). <b>Uploaded drawing files are not included yet</b>; keep your original drawings.</p>
  <form data-f="export"><label>Passphrase (recommended)<input type="password" name="pass" autocomplete="new-password"></label><div class="err"></div><button class="primary">Create verified backup</button></form>
  ${last ? `<p class="small muted">Last export file: ${esc(last.at.slice(0, 16).replace('T', ' '))} UTC · ${last.encrypted ? 'encrypted' : 'NOT encrypted'} · checksum ${esc(last.checksum.slice(0, 12))}…<br>This confirms a file was created and verified. It does not confirm where you stored it.</p>` : '<p class="small muted">No export made yet.</p>'}</div>
  <div class="card"><b>Restore from a backup file</b><p class="small muted">Newer local records are never overwritten. Records that differ on both sides are reported as conflicts and skipped.</p>
  <label>Backup file<input type="file" id="restore" accept=".json,application/json"></label><label>Passphrase (if encrypted)<input type="password" id="restore-pass" autocomplete="off"></label></div>`;
}

// ---------- backup logic ----------
async function readBackup(text, pass) {
  const o = JSON.parse(text); if (o.format !== 'ethcm-backup') throw new Error('This is not a backup file from this app.');
  let plain;
  if (o.encrypted) {
    if (!pass) throw new Error('This backup is encrypted. Enter the passphrase.');
    try { plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(o.iv) }, await aesKey(pass, fromB64(o.salt)), fromB64(o.cipher))); }
    catch { throw new Error('Wrong passphrase or damaged file.'); }
  } else plain = JSON.stringify(o.data);
  if (await sha256(plain) !== o.checksum) throw new Error('Integrity check failed: the file is damaged or altered.');
  return { data: JSON.parse(plain), meta: o };
}
async function makeBackup(pass) {
  const data = {}; for (const s of BACKUP_STORES) data[s] = await dbAll(s);
  const plain = JSON.stringify(data); const checksum = await sha256(plain);
  const out = { format: 'ethcm-backup', v: 1, exportedAt: new Date().toISOString(), device: DEVICE, checksum, encrypted: !!pass };
  if (pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(pass, salt), te.encode(plain));
    Object.assign(out, { salt: toB64(salt), iv: toB64(iv), cipher: toB64(new Uint8Array(ct)) });
  } else out.data = data;
  const text = JSON.stringify(out);
  const back = await readBackup(text, pass); // verify before offering the file
  if (JSON.stringify(back.data) !== plain) throw new Error('Verification failed; file not offered.');
  return { text, checksum, encrypted: !!pass };
}
async function restoreBackup(text, pass) {
  const { data } = await readBackup(text, pass); const r = { added: 0, updated: 0, skipped: 0, conflicts: 0 };
  for (const s of BACKUP_STORES) for (const rec of data[s] || []) {
    const loc = await dbGet(s, rec.id);
    if (!loc) { await dbPut(s, rec); r.added++; }
    else if ((rec.version || 0) > (loc.version || 0)) { await dbPut(s, rec); r.updated++; }
    else if ((rec.version || 0) === (loc.version || 0) && rec.updatedAt !== loc.updatedAt) r.conflicts++;
    else r.skipped++;
  }
  await audit('restore', 'backup', null, `Restore: ${r.added} added, ${r.updated} updated, ${r.conflicts} conflicts`, null);
  return r;
}

// ---------- forms ----------
const projectForm = p => `<h1>${p ? 'Edit project' : 'New project'}</h1><form data-f="project"><input type="hidden" name="id" value="${p?.id || ''}">
  ${fld('Project name', 'name', p?.name, { req: 1 })}${sel('Type', 'type', TYPES, p?.type)}${sel('Construction location (drives local prices later)', 'city', CITIES, p?.city)}
  ${fld('Other town (if Other)', 'cityOther', p?.cityOther)}${fld('Number of storeys', 'floors', p?.floors, { type: 'number', attrs: 'min="1" step="1" inputmode="numeric"' })}
  ${fld('Total floor area (m²)', 'area', p?.area, { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Approved budget (ETB), optional', 'budget', p?.budget, { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}
  ${fld('Planned start', 'start', p?.start, { type: 'date' })}<label>Notes<textarea name="notes" rows="2">${esc(p?.notes || '')}</textarea></label>
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;

const taskForm = t => {
  const ms = S.members.filter(m => m.projectId === S.pid);
  return `<h1>${t ? 'Edit task' : 'New task'}</h1><form data-f="task"><input type="hidden" name="id" value="${t?.id || ''}">
  ${fld('Title', 'title', t?.title, { req: 1 })}${fld('Due date', 'due', t?.due, { type: 'date' })}
  ${sel('Construction stage', 'stage', [['', '—'], ...STAGES], t?.stage || '')}${sel('Assigned to', 'assignee', [['', 'Unassigned'], ...ms.map(m => [m.userId, userName(m.userId)])], t?.assignee || '')}
  ${sel('Status', 'status', Object.entries(STATUS), t?.status || 'todo')}${fld('If blocked: reason', 'blockReason', t?.blockReason)}
  ${chk('Safety risk', 'safety', t?.safety)}${chk('Has financial impact', 'cost', t?.cost)}${chk('Later work depends on this', 'blocks', t?.blocks)}
  ${sel('Priority', 'manualPriority', [['auto', 'Automatic'], 'Critical', 'High', 'Medium', 'Low'], t?.manualPriority || 'auto')}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
};
const memberForm = () => `<h1>Add person</h1><form data-f="member">
  ${fld('Email', 'email', '', { type: 'email', req: 1 })}<p class="muted small">If this person has no account on this device yet, enter their name and a temporary password too.</p>
  ${fld('Name (new person only)', 'name')}${fld('Temporary password (8+ characters, new person only)', 'password', '', { type: 'password', attrs: 'autocomplete="new-password"' })}
  ${sel('Role', 'role', Object.entries(ROLE_LABEL).filter(([k]) => k !== 'owner'), 'site_supervisor')}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Add</button></div></form>`;

const F = {
  async signup(d) {
    const email = d.email.trim().toLowerCase(); if (d.password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (!d.name.trim()) throw new Error('Name is required.');
    if ((await dbAll('users')).some(u => u.email === email)) throw new Error('An account with this email already exists on this device.');
    const u = await createUser(d.name.trim(), email, d.password); await startSession(u);
  },
  async login(d) {
    const u = (await dbAll('users')).find(x => x.email === d.email.trim().toLowerCase());
    const ok = u && await pwHash(d.password, u.salt) === u.hash;
    if (!ok) { await new Promise(r => setTimeout(r, 800)); throw new Error('Email or password is incorrect.'); }
    await startSession(u);
  },
  async project(d) {
    if (!d.name.trim()) throw new Error('Project name is required.');
    const old = d.id ? S.projects.find(p => p.id === d.id) : null;
    if (old && !can('members', 'e')) throw new Error('Only the owner or an administrator can edit project details.');
    const num = (v, label) => { if (v === '' || v == null) return null; const n = Number(v); if (!(n >= 0)) throw new Error(label + ' must be a positive number.'); return n; };
    const rec = { ...(old || {}), id: d.id || undefined, name: d.name.trim(), type: d.type, city: d.city, cityOther: d.cityOther.trim(), floors: num(d.floors, 'Storeys'), area: num(d.area, 'Floor area'), budget: num(d.budget, 'Budget'), start: d.start, notes: d.notes.trim(), status: old?.status || 'active', ownerId: old?.ownerId || S.user.id };
    const p = await save('projects', rec, `${old ? 'Edited' : 'Created'} project ${rec.name}`);
    if (!old) await save('members', { projectId: p.id, userId: S.user.id, role: 'owner' }, `Owner added to ${p.name}`);
    S.pid = p.id; localStorage.setItem('proj', p.id);
  },
  async task(d) {
    if (!can('tasks', 'e')) throw new Error('Your role cannot edit tasks.');
    if (!d.title.trim()) throw new Error('Title is required.');
    const old = d.id ? S.tasks.find(t => t.id === d.id) : null;
    if (d.status === 'blocked' && !d.blockReason.trim()) throw new Error('Say why the task is blocked.');
    const rec = { ...(old || {}), id: d.id || undefined, projectId: S.pid, title: d.title.trim(), due: d.due, stage: d.stage, assignee: d.assignee, status: d.status, blockReason: d.status === 'blocked' ? d.blockReason.trim() : '', safety: !!d.safety, cost: !!d.cost, blocks: !!d.blocks, manualPriority: d.manualPriority };
    if (d.status === 'done' && !old?.doneDate) { rec.doneDate = todayStr(); rec.doneBy = S.user.id; }
    if (d.status !== 'done') { rec.doneDate = null; rec.doneBy = null; }
    await save('tasks', rec, `${old ? 'Edited' : 'Created'} task ${rec.title}`);
  },
  async member(d) {
    if (!can('members', 'e')) throw new Error('Only the owner or an administrator can add people.');
    const email = d.email.trim().toLowerCase(); let u = S.users.find(x => x.email === email);
    if (!u) { if (!d.name.trim() || d.password.length < 8) throw new Error('A new person needs a name and a password of at least 8 characters.'); u = await createUser(d.name.trim(), email, d.password); }
    if (S.members.some(m => m.projectId === S.pid && m.userId === u.id)) throw new Error('This person is already on the project.');
    await save('members', { projectId: S.pid, userId: u.id, role: d.role }, `Added ${u.name} as ${ROLE_LABEL[d.role]}`);
  },
  async export(d, form) {
    const b = await makeBackup(d.pass || '');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([b.text], { type: 'application/json' }));
    a.download = `ethiobuild-backup-${todayStr()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    localStorage.setItem('lastBackup', JSON.stringify({ at: new Date().toISOString(), checksum: b.checksum, encrypted: b.encrypted }));
    await audit('export', 'backup', null, 'Backup file created and verified', null);
    toast('Backup file created and integrity-verified');
  }
};

async function startSession(u) { S.user = u; localStorage.setItem('session', u.id); location.hash = '#/dashboard'; await render(); }

// ---------- actions ----------
const A = {
  close: closeSheet,
  'to-create': () => authView('create'), 'to-login': () => authView('login'),
  'new-project': () => openSheet(projectForm()),
  'edit-project': id => openSheet(projectForm(S.projects.find(p => p.id === id))),
  async 'archive-project'(id) {
    if (!can('members', 'e')) return;
    if (!confirm('Archive this project? Data is kept and can be restored by editing the project record in a later version.')) return;
    const p = S.projects.find(x => x.id === id); await save('projects', { ...p, status: 'archived' }, `Archived project ${p.name}`); toast('Project archived'); await render();
  },
  switch: id => { S.pid = id; localStorage.setItem('proj', id); location.hash = '#/dashboard'; },
  'new-task': () => openSheet(taskForm()),
  'edit-task': id => openSheet(taskForm(S.tasks.find(t => t.id === id))),
  async 'done-task'(id) { const t = S.tasks.find(x => x.id === id); await save('tasks', { ...t, status: 'done', doneDate: todayStr(), doneBy: S.user.id }, `Completed task ${t.title}`); await render(); },
  async 'reopen-task'(id) { const t = S.tasks.find(x => x.id === id); await save('tasks', { ...t, status: 'todo', doneDate: null, doneBy: null }, `Reopened task ${t.title}`); await render(); },
  'add-member': () => openSheet(memberForm()),
  async 'remove-member'(id) {
    if (!can('members', 'e') || !confirm('Remove this person from the project?')) return;
    const m = S.members.find(x => x.id === id); if (m.role === 'owner') return;
    await save('members', { ...m, deleted: true }, `Removed ${userName(m.userId)} from project`); await render();
  },
  signout: () => { localStorage.removeItem('session'); S.user = null; authView('login'); }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  e.preventDefault(); const f = A[el.dataset.a]; if (f) (async () => f(el.dataset.id))().catch(err => toast(err.message));
});
document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-f]'); if (!form) return; e.preventDefault();
  const d = Object.fromEntries(new FormData(form)); const err = $('.err', form); if (err) err.textContent = '';
  const btn = form.querySelector('button.primary'); if (btn) btn.disabled = true;
  try { await F[form.dataset.f](d, form); if (form.closest('dialog')) closeSheet(); if (S.user) await render(); }
  catch (x) { if (err) err.textContent = x.message; else toast(x.message); }
  finally { if (btn) btn.disabled = false; }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'projsel') { S.pid = t.value; localStorage.setItem('proj', S.pid); await render(); }
  if (t.id === 'theme') { localStorage.setItem('theme', t.value); applyTheme(); }
  if (t.id === 'restore' || t.id === 'restore-auth') {
    const file = t.files[0]; if (!file) return;
    try {
      const pass = $('#restore-pass')?.value || (JSON.parse(await file.text()).encrypted ? prompt('Backup passphrase') : '');
      const r = await restoreBackup(await file.text(), pass);
      toast(`Restore done: ${r.added} added, ${r.updated} updated, ${r.conflicts} conflicts skipped`);
      if (S.user) await render(); else authView('login');
    } catch (x) { toast(x.message); }
    t.value = '';
  }
});
window.addEventListener('hashchange', () => S.user && render());
window.addEventListener('online', () => S.user && renderShell());
window.addEventListener('offline', () => S.user && renderShell());

function applyTheme() { const t = localStorage.getItem('theme') || 'auto'; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }

// ---------- render ----------
async function render() {
  if (!S.user) return authView((await dbAll('users')).length ? 'login' : 'create');
  await load();
  $('#auth').hidden = true; $('#app').hidden = false;
  await renderShell();
  const [a, b] = (location.hash.replace(/^#\//, '') || 'dashboard').split('/');
  let html;
  if (a === 'dashboard') html = viewDashboard();
  else if (a === 'daily') html = viewDaily();
  else if (a === 'tasks') html = viewTasks();
  else if (a === 'projects') html = viewProjects();
  else if (a === 'project') html = viewProject(b);
  else if (a === 'menu') html = viewMenu();
  else if (a === 's') html = viewPlanned(b);
  else if (a === 'settings') html = await viewSettings();
  else if (a === 'backup') html = await viewBackup();
  else if (ROUTES[a]) html = await ROUTES[a](b);
  else html = viewDashboard();
  $('#main').innerHTML = html;
  const th = $('#theme'); if (th) th.value = localStorage.getItem('theme') || 'auto';
}

async function init() {
  applyTheme();
  if (!crypto?.subtle) { document.body.innerHTML = '<p style="padding:20px">This app needs a secure context (HTTPS or localhost) for encryption features.</p>'; return; }
  db = await openDB();
  const sid = localStorage.getItem('session');
  if (sid) S.user = (await dbGet('users', sid)) || null;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  await render();
}
window.addEventListener('load', init); // after boq.js has registered its routes
