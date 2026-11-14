'use strict';
/* Phase 4 — daily operations, scheduling, progress from VERIFIED quantities, inventory/procurement, labour attendance, daily report.
   Progress only counts quantities a second person has verified. A passed deadline never completes anything. */

const DELAY = ['Labour shortage', 'Material shortage', 'Weather', 'Design changes', 'Financial problems', 'Equipment failure', 'Permit delays', 'Other'];
const TX_IN = ['opening', 'receipt', 'return_in'], TX_OUT = ['issue', 'consumption', 'damaged', 'return_out'];
const TX_LABEL = { opening: 'Opening stock', receipt: 'Received (delivery)', return_in: 'Returned to store from site', issue: 'Issued to site work', consumption: 'Used directly from store', damaged: 'Damaged or lost', return_out: 'Returned to supplier' };
const ATT = { present: 'Present', half: 'Half day', absent: 'Absent' };
const P = a => (a || []).filter(x => x.projectId === S.pid && !x.deleted);
const sum = (a, k) => a.reduce((x, y) => x + (Number(y[k]) || 0), 0);
const approver = () => can('boq', 'e') || can('quality', 'e');
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const weekStart = s => { const d = new Date(s + 'T00:00:00'); const k = (d.getDay() + 6) % 7; return addDays(s, -k); };
const bar = p => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p || 0)).toFixed(1)}%"></i></div>`;
const pct1 = n => n == null ? '—' : n.toFixed(1) + '%';
const gate = (area = 'tasks') => !curProject() ? emptyProject() : !can(area) ? locked() : null;
const memberCount = () => S.members.filter(m => m.projectId === S.pid).length;
const itemOf = id => S.boqitems.find(i => i.id === id && !i.deleted);
const mname = id => S.materials.find(m => m.id === id)?.name || 'Removed material';
const wname = id => S.workers.find(w => w.id === id)?.name || 'Removed worker';
let attDate = todayStr();

// ================= PROGRESS (verified quantities only) =================
const progCfg = () => S.progcfg.find(x => x.id === S.pid && !x.deleted) || { method: 'cost', weights: {} };
const pUpdates = () => P(S.progress);
function itemProgress(it) {
  const c = calcItem(it); const ups = pUpdates().filter(u => u.itemId === it.id);
  const ver = sum(ups.filter(u => u.status === 'verified'), 'qty'), pend = sum(ups.filter(u => u.status === 'submitted'), 'qty');
  const plan = c.ok ? c.net : null;
  return { c, ver, pend, plan, pct: plan > 0 ? Math.min(1, ver / plan) : null, remaining: plan != null ? Math.max(0, plan - ver) : null };
}
function overall() {
  const cfg = progCfg(); const E = cfg.method === 'cost' ? estimate() : null; const rows = []; let W = 0, acc = 0; const secs = {};
  for (const it of sortItems(pItems())) {
    const ip = itemProgress(it);
    const w = cfg.method === 'cost' ? (E.rows.find(r => r.it.id === it.id)?.total ?? null) : pnum(cfg.weights?.[it.id]);
    const inc = w > 0 && ip.pct != null; rows.push({ it, ip, w, inc });
    if (inc) { W += w; acc += w * ip.pct; const s = secs[it.section] = secs[it.section] || { w: 0, a: 0 }; s.w += w; s.a += w * ip.pct; }
  }
  const weeks = {};
  for (const u of pUpdates().filter(x => x.status === 'verified')) {
    const r = rows.find(x => x.it.id === u.itemId); if (!r || !r.inc) continue;
    const k = weekStart(u.date); weeks[k] = (weeks[k] || 0) + (u.qty / r.ip.plan) * r.w / W * 100;
  }
  const first = pUpdates().filter(u => u.status === 'verified').map(u => u.date).sort()[0];
  const pct = W > 0 ? acc / W * 100 : null; let forecast = null;
  if (pct != null && pct > 0 && first) { const el = Math.max(1, -daysUntil(first) + 1); if (el >= 7) forecast = pct >= 100 ? todayStr() : addDays(todayStr(), Math.ceil((100 - pct) / (pct / el))); }
  return { cfg, rows, pct, secs: Object.fromEntries(Object.entries(secs).map(([k, v]) => [k, v.a / v.w * 100])), weeks, forecast, incl: rows.filter(r => r.inc).length, total: rows.length };
}
function physKpi() {
  if (!can('boq')) return `<div class="kpi"><span class="muted small">Physical progress</span><b>Not shown</b></div>`;
  const o = overall();
  return `<div class="kpi"><span class="muted small">Physical progress</span><b>${o.pct == null ? 'Not measured' : pct1(o.pct)}</b><span class="tag">${o.pct == null ? 'Needs verified quantities' : (o.cfg.method === 'cost' ? 'Weighted by estimated cost' : 'Weighted by your weights')}</span></div>`;
}
async function shrink(file) {
  try { const bmp = await createImageBitmap(file); const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); return (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8))) || file; } catch { return file; }
}
async function savePhotos(files) {
  const ids = []; const list = [...files].filter(f => f && f.size);
  if (list.length > 8) throw new Error('Add at most 8 photos per update.');
  for (const f of list) { if (!/^image\//.test(f.type)) throw new Error('Photos must be image files.'); if (f.size > 25 * 1048576) throw new Error('A photo is larger than 25 MB.'); const id = uid(); await dbPut('files', { id, blob: await shrink(f) }); ids.push(id); }
  return ids;
}

function viewProgress() {
  const g = gate('tasks'); if (g) return g; const o = overall(); const e = can('tasks', 'e');
  const pend = pUpdates().filter(u => u.status === 'submitted');
  const delays = {}; for (const t of P(S.tasks)) { if (t.status === 'done') continue; const late = daysUntil(t.due) !== null && daysUntil(t.due) < 0; if (t.status === 'blocked' || late) { const k = t.delayCause || 'Cause not recorded'; (delays[k] = delays[k] || []).push(t); } }
  const wk = Object.entries(o.weeks).sort().slice(-8).reverse();
  const tasksDue = P(S.tasks).filter(t => t.due && t.due <= todayStr()); const tasksDoneOfDue = tasksDue.filter(t => t.status === 'done').length;
  return `<div class="row"><h1>Progress</h1>${e ? `<button class="primary" data-a="new-progress">+ Record work</button>` : ''}</div>
  <div class="card"><div class="muted small">Overall physical progress</div><div style="font-size:34px;font-weight:800;letter-spacing:-1px">${o.pct == null ? 'Not measured' : pct1(o.pct)}</div>${bar(o.pct)}
  <div class="small muted" style="margin-top:8px">Method: <b>${o.cfg.method === 'cost' ? 'weighted by estimated cost of each BOQ item' : 'weighted by the weights you set'}</b>. Only verified quantities count. ${o.incl} of ${o.total} BOQ items are included${o.total - o.incl ? ` (items without a ${o.cfg.method === 'cost' ? 'complete price' : 'weight'} or valid quantity are left out, not guessed)` : ''}.</div>
  ${approver() ? `<div style="margin-top:8px"><button class="sm" data-a="prog-settings">Weighting method</button></div>` : ''}</div>
  ${approver() && pend.length ? `<h2>Waiting for verification (${pend.length})</h2>${pend.map(u => updCard(u, true)).join('')}` : ''}
  ${Object.keys(o.secs).length ? `<h2>By construction stage</h2><div class="card">${Object.entries(o.secs).sort().map(([k, v]) => `<div class="small row"><span>${k} · ${esc(BOQ_SECTIONS.find(s => s[0] === k)?.[1] || '')}</span><b>${pct1(v)}</b></div>${bar(v)}`).join('')}</div>` : ''}
  ${wk.length ? `<h2>Weekly performance</h2><div class="card">${wk.map(([k, v]) => `<div class="small row"><span>Week of ${k}</span><b>+${v.toFixed(1)} points</b></div>`).join('')}</div>` : ''}
  <h2>Schedule signals</h2><div class="card small">Tasks due to date: ${tasksDue.length} · completed: ${tasksDoneOfDue}${o.forecast ? `<br>Forecast completion: <b>${o.forecast}</b><br><span class="muted">Assumes the average pace since the first verified work continues. It is a projection, not a commitment.</span>` : '<br><span class="muted">Forecast appears after a week of verified progress.</span>'}</div>
  ${Object.keys(delays).length ? `<h2>Delay causes</h2><div class="card">${Object.entries(delays).map(([k, v]) => `<div class="small row"><span>${esc(k)}</span><b>${v.length} task(s)</b></div>`).join('')}</div>` : ''}
  <h2>BOQ items</h2>${o.rows.map(({ it, ip, inc }) => `<a class="card" style="display:block" href="#/progitem/${it.id}"><div class="row"><b>${esc(it.code)} ${esc(it.description)}</b><span class="small">${ip.pct == null ? '—' : pct1(ip.pct * 100)}</span></div>${bar(ip.pct == null ? 0 : ip.pct * 100)}<div class="muted small">${ip.plan == null ? 'No valid BOQ quantity' : `${fmt(ip.ver)} of ${fmt(ip.plan)} ${esc(it.unit)} verified`}${ip.pend ? ` · ${fmt(ip.pend)} awaiting verification` : ''}${inc ? '' : ' · not in overall'}</div></a>`).join('') || '<p class="muted">Create BOQ items first.</p>'}`;
}
function updCard(u, withName, urls) {
  const it = itemOf(u.itemId); const cls = { submitted: 'High', verified: 'Completed', rejected: 'Critical' }[u.status];
  const me = S.user.id; const canV = approver() && u.status === 'submitted' && (u.recordedBy !== me || memberCount() <= 1);
  return `<div class="card"><div class="row"><b>${withName && it ? esc(it.code + ' ' + it.description) : fmt(u.qty) + ' ' + esc(it?.unit || '')}</b><span class="chip ${cls}">${u.status === 'submitted' ? 'Awaiting verification' : u.status === 'verified' ? 'Verified' : 'Sent back'}</span></div>
  <div class="small">${withName ? fmt(u.qty) + ' ' + esc(it?.unit || '') + ' · ' : ''}${esc(u.date)} · ${esc(userName(u.recordedBy))}${u.location ? ' · ' + esc(u.location) : ''}</div>${u.comment ? `<div class="muted small">${esc(u.comment)}</div>` : ''}
  ${u.status === 'verified' ? `<div class="muted small">Verified by ${esc(userName(u.verifiedBy))} on ${esc((u.verifiedAt || '').slice(0, 10))}</div>` : ''}${u.status === 'rejected' ? `<div class="small err">Sent back: ${esc(u.rejectReason || '')}</div>` : ''}
  ${urls && u.photos?.length ? `<div class="photos">${u.photos.map(id => urls[id] ? `<a href="${urls[id]}" target="_blank" rel="noopener"><img src="${urls[id]}" alt="Site photo"></a>` : '').join('')}</div>` : (u.photos?.length ? `<div class="tag">${u.photos.length} photo(s)</div>` : '')}
  ${canV ? `<div class="row" style="margin-top:8px;justify-content:flex-start"><button class="sm primary" data-a="verify-prog" data-id="${u.id}">Verify</button><button class="sm" data-a="reject-prog" data-id="${u.id}">Send back</button></div>` : (u.status === 'submitted' && approver() ? '<div class="tag" style="margin-top:6px">Another person must verify this update.</div>' : '')}</div>`;
}
async function viewProgItem(id) {
  revokeUrls(); const g = gate('tasks'); if (g) return g; const it = itemOf(id); if (!it || it.projectId !== S.pid) return `<div class="card">Item not found.</div>`;
  const ip = itemProgress(it); const ups = pUpdates().filter(u => u.itemId === id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const urls = {}; for (const u of ups) for (const f of u.photos || []) { const r = await dbGet('files', f); if (r?.blob) { urls[f] = URL.createObjectURL(r.blob); URLS.push(urls[f]); } }
  return `<a href="#/progress" class="small muted">← Progress</a><h1>${esc(it.code)} ${esc(it.description)}</h1>
  <div class="card"><div class="small">Planned (BOQ net): <b>${ip.plan == null ? 'not available' : fmt(ip.plan) + ' ' + esc(it.unit)}</b><br>Verified complete: <b>${fmt(ip.ver)} ${esc(it.unit)}</b>${ip.pct != null ? ` = ${pct1(ip.pct * 100)}` : ''}<br>Awaiting verification: ${fmt(ip.pend)} ${esc(it.unit)}<br>Remaining: <b>${ip.remaining == null ? '—' : fmt(ip.remaining) + ' ' + esc(it.unit)}</b></div>${bar(ip.pct == null ? 0 : ip.pct * 100)}
  ${can('tasks', 'e') && ip.plan != null ? `<div style="margin-top:10px"><button class="primary sm" data-a="new-progress" data-id="${id}">+ Record work</button></div>` : ''}</div>
  <h2>Updates</h2>${ups.map(u => updCard(u, false, urls)).join('') || '<p class="muted small">None yet.</p>'}`;
}
const progForm = itemId => {
  const its = sortItems(pItems()).filter(i => calcItem(i).ok); if (!its.length) return `<h1>No BOQ items</h1><p class="muted">Create BOQ items with valid quantities first.</p><button data-a="close">OK</button>`;
  return `<h1>Record completed work</h1><form data-f="pupdate">${sel('BOQ item', 'itemId', its.map(i => [i.id, `${i.code} ${i.description} (${i.unit})`]), itemId || its[0].id)}
  ${fld('Quantity completed in this update (in the item’s unit)', 'qty', '', { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Work date', 'date', todayStr(), { type: 'date', req: 1 })}${fld('Site location (grid, block, floor)', 'location')}${fld('Comments', 'comment')}
  <label>Photos (camera or gallery, up to 8)<input type="file" name="photos" accept="image/*" multiple></label><p class="small muted">This is only counted in progress after another person verifies it.</p>
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Submit</button></div></form>`;
};
const progSettingsForm = () => {
  const c = progCfg(); const its = sortItems(pItems());
  return `<h1>Weighting method</h1><form data-f="progcfg">${sel('How to weight BOQ items in overall progress', 'method', [['cost', 'By estimated cost of each item'], ['manual', 'By weights I set']], c.method)}
  <p class="small muted">With “by weights” only items with a weight count. Weights can be any positive numbers (for example % of contract).</p>${its.map(i => fld(`${i.code} ${i.description}: weight`, 'w_' + i.id, c.weights?.[i.id] ?? '', { type: 'number', attrs: 'min="0" step="any"' })).join('')}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
};

// ================= INVENTORY & PROCUREMENT =================
const pTx = () => P(S.invtx), pOrders = () => P(S.orders);
const stockOf = mid => pTx().filter(t => t.materialId === mid).reduce((q, t) => q + (TX_IN.includes(t.type) ? 1 : -1) * Number(t.qty), 0);
const usedOf = mid => pTx().filter(t => t.materialId === mid && (t.type === 'issue' || t.type === 'consumption')).reduce((q, t) => q + Number(t.qty), 0);
const receivedFor = o => sum(pTx().filter(t => t.orderId === o.id && t.type === 'receipt'), 'qty');
const openOrdered = mid => pOrders().filter(o => o.materialId === mid && o.status === 'ordered').reduce((q, o) => q + Math.max(0, Number(o.qty) - receivedFor(o)), 0);
function materialNeeds() {
  const need = {};
  for (const it of pItems()) {
    const c = calcItem(it); const ra = raOf(it.id); if (!c.ok || !ra) continue;
    for (const comp of ra.components || []) if (comp.type === 'material' && comp.refId && isFinite(Number(comp.qty))) {
      const q = Number(comp.qty) * (1 + (Number(comp.wastePct) || 0) / 100) * c.net; const n = need[comp.refId] = need[comp.refId] || { qty: 0, bySec: {}, items: [] };
      n.qty += q; n.bySec[it.section] = (n.bySec[it.section] || 0) + q; n.items.push(it.id);
    }
  }
  return need;
}
function procurement() {
  const need = materialNeeds(); const rows = [];
  for (const m of mats()) {
    const n = need[m.id]; const stock = stockOf(m.id), used = usedOf(m.id), open = openOrdered(m.id);
    if (!n && !pTx().some(t => t.materialId === m.id) && !open) continue;
    const required = n?.qty || 0; const remaining = Math.max(0, required - used);
    rows.push({ m, required, used, stock, open, remaining, toBuy: Math.max(0, remaining - stock - open), bySec: n?.bySec || {}, items: n?.items || [] });
  }
  return rows;
}
let _memo = { sig: '', rows: null };
function shortageForItem(itemId) {
  const sig = [S.invtx, S.orders, S.rates, S.boqitems, S.measurements].map(a => a.length + ':' + a.reduce((m, x) => x.updatedAt > m ? x.updatedAt : m, '')).join('|') + S.pid;
  if (_memo.sig !== sig) _memo = { sig, rows: procurement() };
  return _memo.rows.some(r => r.toBuy > 1e-9 && r.items.includes(itemId));
}
const invTabs = cur => `<div class="tabs">${[['stock', 'Stock'], ['procurement', 'To buy'], ['orders', 'Orders'], ['log', 'Log']].map(([k, l]) => `<a href="#/inventory/${k}" class="${cur === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
function viewInventory(tab) {
  const g = gate('inventory'); if (g) return g; tab = tab || 'stock'; const e = can('inventory', 'e'); let body = '';
  if (!mats().length) return `<h1>Materials & Inventory</h1><div class="card">Add materials first under Suppliers & Prices → Materials.</div>`;
  if (tab === 'stock') body = `<div class="row"><span class="muted small">Stock on hand (store)</span>${e ? `<button class="sm primary" data-a="new-tx">+ Record movement</button>` : ''}</div>` + mats().map(m => { const s = stockOf(m.id); return `<div class="card row"><div><b>${esc(m.name)}</b><div class="muted small">Used so far: ${fmt(usedOf(m.id))} ${esc(m.unit)}</div></div><b style="color:${s < 0 ? 'var(--crit)' : 'inherit'}">${fmt(s)} ${esc(m.unit)}</b></div>`; }).join('');
  else if (tab === 'procurement') {
    const rows = procurement(); const by = {};
    body = `<p class="small muted">From BOQ rate analyses (your coefficients and waste %). To buy = still needed − in stock − on open orders. Items without a rate analysis are not counted yet.</p>` +
      (rows.map(r => `<div class="card"><div class="row"><b>${esc(r.m.name)}</b>${r.toBuy > 1e-9 ? `<span class="chip Critical">Shortage</span>` : `<span class="chip Completed">Covered</span>`}</div><div class="small">Required in total: ${fmt(r.required)} · used: ${fmt(r.used)} · still needed: ${fmt(r.remaining)} ${esc(r.m.unit)}<br>In stock: ${fmt(r.stock)} · on order: ${fmt(r.open)}<br><b>To buy: ${fmt(r.toBuy)} ${esc(r.m.unit)}</b></div></div>`).join('') || '<p class="muted">No material requirements yet. Add components to BOQ rate analyses (Cost Estimation).</p>');
    for (const r of rows) for (const [sec, q] of Object.entries(r.bySec)) (by[sec] = by[sec] || []).push(`${esc(r.m.name)}: ${fmt(q)} ${esc(r.m.unit)}`);
    if (Object.keys(by).length) body += `<h2>Requirement by construction stage</h2>${Object.entries(by).sort().map(([k, v]) => `<div class="card small"><b>${k} · ${esc(BOQ_SECTIONS.find(s => s[0] === k)?.[1] || '')}</b><br>${v.join('<br>')}</div>`).join('')}`;
  } else if (tab === 'orders') {
    body = `<div class="row"><span class="muted small">Purchase orders</span>${e ? `<button class="sm primary" data-a="new-order">+ Order</button>` : ''}</div>` + (pOrders().sort((a, b) => b.date.localeCompare(a.date)).map(o => { const r = receivedFor(o); return `<div class="card"><div class="row"><b>${esc(mname(o.materialId))}</b><span class="chip ${o.status === 'ordered' ? 'Medium' : o.status === 'cancelled' ? 'Low' : 'Completed'}">${o.status === 'ordered' ? 'Open' : o.status === 'cancelled' ? 'Cancelled' : 'Received'}</span></div><div class="small">${fmt(o.qty)} ${esc(S.materials.find(m => m.id === o.materialId)?.unit || '')} from ${esc(supName(o.supplierId))} · ordered ${esc(o.date)}${o.expected ? ' · expected ' + esc(o.expected) : ''}<br>Received so far: ${fmt(r)}</div>${e && o.status === 'ordered' ? `<div style="margin-top:8px"><button class="sm danger" data-a="cancel-order" data-id="${o.id}">Cancel order</button></div>` : ''}</div>`; }).join('') || '<p class="muted">No orders yet.</p>') + `<p class="small muted">Orders become “Received” when receipts recorded against them cover the quantity. Money and invoices arrive in Phase 5.</p>`;
  } else body = pTx().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 80).map(t => `<div class="card small"><div class="row"><b>${esc(TX_LABEL[t.type])}</b><b>${TX_IN.includes(t.type) ? '+' : '−'}${fmt(t.qty)} ${esc(S.materials.find(m => m.id === t.materialId)?.unit || '')}</b></div>${esc(mname(t.materialId))} · ${esc(t.date)} · ${esc(userName(t.by))}${t.note ? '<br>' + esc(t.note) : ''}</div>`).join('') || '<p class="muted">No movements yet.</p>';
  return `<h1>Materials & Inventory</h1>${invTabs(tab)}${body}`;
}
const txForm = type => `<h1>Record stock movement</h1><form data-f="tx">${sel('What happened', 'type', Object.entries(TX_LABEL), type || 'receipt')}${sel('Material', 'materialId', mats().map(m => [m.id, `${m.name} (${m.unit})`]), '')}
  ${fld('Quantity', 'qty', '', { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Date', 'date', todayStr(), { type: 'date', req: 1 })}
  ${sel('Against order (for deliveries)', 'orderId', [['', '—'], ...pOrders().filter(o => o.status === 'ordered').map(o => [o.id, `${mname(o.materialId)} · ${fmt(o.qty)} · ${supName(o.supplierId)}`])], '')}
  ${sel('Used for stage (optional)', 'section', [['', '—'], ...BOQ_SECTIONS.map(([k, n]) => [k, k + ' · ' + n])], '')}${fld('Note', 'note')}
  <p class="small muted">Issued = taken from the store to the work. Use “Used directly” only for material not issued first, so nothing is counted twice.</p><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
const orderForm = () => sups().length ? `<h1>New purchase order</h1><form data-f="order">${sel('Material', 'materialId', mats().map(m => [m.id, `${m.name} (${m.unit})`]), '')}${sel('Supplier', 'supplierId', sups().map(s => [s.id, s.name]), '')}${fld('Quantity', 'qty', '', { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Order date', 'date', todayStr(), { type: 'date', req: 1 })}${fld('Expected delivery', 'expected', '', { type: 'date' })}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>` : `<h1>Add a supplier first</h1><button data-a="close">OK</button>`;

// ================= LABOUR / ATTENDANCE =================
const attId = (d, w) => `${S.pid}|${d}|${w}`;
function viewLabour(tab) {
  const g = gate('labour'); if (g) return g; tab = tab || 'attendance'; const e = can('labour', 'e'); const ws = P(S.workers).sort((a, b) => a.name.localeCompare(b.name));
  const tb = `<div class="tabs">${[['attendance', 'Attendance'], ['workers', 'Workers']].map(([k, l]) => `<a href="#/labour/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  if (tab === 'workers') return `<div class="row"><h1>Labour & Workforce</h1>${e ? `<button class="sm primary" data-a="new-worker">+ Worker</button>` : ''}</div>${tb}${ws.map(w => `<div class="card row"><div><b>${esc(w.name)}</b><div class="muted small">${esc(w.category)}${w.phone ? ' · ' + esc(w.phone) : ''}</div></div>${e ? `<button class="sm" data-a="edit-worker" data-id="${w.id}">Edit</button>` : ''}</div>`).join('') || '<p class="muted">No workers yet.</p>'}`;
  const recs = P(S.attendance).filter(a => a.date === attDate); const get = id => recs.find(a => a.workerId === id)?.status;
  const present = ws.filter(w => get(w.id) === 'present').length, half = ws.filter(w => get(w.id) === 'half').length;
  return `<div class="row"><h1>Labour & Workforce</h1></div>${tb}<label>Date<input type="date" id="attdate" value="${attDate}" max="${todayStr()}"></label>
  <div class="card small">Present: <b>${present}</b> · half day: ${half} · absent: ${ws.filter(w => get(w.id) === 'absent').length} · not recorded: ${ws.filter(w => !get(w.id)).length}<br>Labour-days: <b>${present + half / 2}</b></div>
  ${ws.map(w => `<div class="card"><b>${esc(w.name)}</b> <span class="muted small">${esc(w.category)}</span><div class="seg">${Object.entries(ATT).map(([k, l]) => e ? `<button class="${get(w.id) === k ? 'on' : ''}" data-a="att" data-id="${w.id}" data-s="${k}">${l}</button>` : `<span class="${get(w.id) === k ? 'on' : ''}">${l}</span>`).join('')}</div></div>`).join('') || '<p class="muted">Add workers first (Workers tab).</p>'}`;
}
const workerForm = w => `<h1>${w ? 'Edit worker' : 'New worker'}</h1><form data-f="worker"><input type="hidden" name="id" value="${w?.id || ''}">${fld('Name', 'name', w?.name, { req: 1 })}${sel('Trade', 'category', LAB_CATS, w?.category)}${fld('Phone', 'phone', w?.phone)}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;

// ================= DAILY, TASKS, SCHEDULE =================
function viewDailyNew(date) {
  const g = gate('tasks'); if (g) return g; const d = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : todayStr(); const isToday = d === todayStr();
  const ts = P(S.tasks); const open = ts.filter(t => t.status !== 'done');
  const planned = open.filter(t => t.due === d), overdue = open.filter(t => daysUntil(t.due) !== null && daysUntil(t.due) < 0 && isToday);
  const doneD = ts.filter(t => t.status === 'done' && t.doneDate === d), blocked = open.filter(t => t.status === 'blocked');
  const att = P(S.attendance).filter(a => a.date === d), rec = pTx().filter(t => t.date === d && t.type === 'receipt'), ups = pUpdates().filter(u => u.date === d);
  const present = att.filter(a => a.status === 'present').length + att.filter(a => a.status === 'half').length / 2;
  const photos = sum(ups.map(u => ({ n: (u.photos || []).length })), 'n'); const next = byScore(open)[0]; const rep = P(S.dailyreports).find(r => r.date === d);
  const e = can('tasks', 'e');
  return `<div class="row"><h1>${isToday ? 'Today' : 'Day'} · ${d}</h1>${e ? `<button class="primary" data-a="new-task">+ Task</button>` : ''}</div>
  <div class="grid"><div class="kpi"><span class="muted small">Planned</span><b>${planned.length + doneD.length}</b><span class="tag">${doneD.length} completed</span></div><div class="kpi"><span class="muted small">Overdue</span><b>${overdue.length}</b></div><div class="kpi"><span class="muted small">Labour-days</span><b>${present}</b></div><div class="kpi"><span class="muted small">Work records</span><b>${ups.length}</b><span class="tag">${photos} photo(s)</span></div></div>
  ${e || can('labour', 'e') || can('inventory', 'e') ? `<div class="quick">${can('labour', 'e') ? `<a class="btn sm" href="#/labour">Attendance</a>` : ''}${can('inventory', 'e') ? `<button class="sm" data-a="new-tx-receipt">Material received</button><button class="sm" data-a="new-tx-issue">Material used</button>` : ''}${e ? `<button class="sm" data-a="new-progress">Record work</button>` : ''}<a class="btn sm" href="#/report/${d}">Daily report</a></div>` : `<a class="btn sm" href="#/report/${d}">Daily report</a>`}
  ${isToday && next ? `<h2>Next most important action</h2>${taskCard(next)}` : ''}
  <h2>Planned for this day (${planned.length})</h2>${taskList(byScore(planned), 'No open tasks due.')}
  ${isToday ? `<h2>Overdue (${overdue.length})</h2>${taskList(byScore(overdue), 'None. Overdue tasks stay open until someone completes them.')}` : ''}
  <h2>Completed (${doneD.length})</h2>${taskList(doneD, 'None.')}
  <h2>What is delaying the project (${blocked.length})</h2>${taskList(blocked, 'No blocked tasks.')}
  <div class="card small">${rec.length} delivery record(s) · report: ${rep ? `<b>submitted</b> by ${esc(rep.byName)}` : 'not submitted yet'}</div>`;
}
function viewTasksNew(tab) {
  const g = gate('tasks'); if (g) return g;
  const tb = `<div class="tabs">${[['list', 'List'], ['schedule', 'Schedule']].map(([k, l]) => `<a href="#/tasks/${k}" class="${(tab || 'list') === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  return tab === 'schedule' ? `<div class="row"><h1>Schedule</h1>${can('tasks', 'e') ? `<button class="primary" data-a="new-task">+ Task</button>` : ''}</div>${tb}${gantt()}` : tb + viewTasks();
}
function gantt() {
  const ts = P(S.tasks).filter(t => t.due).sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due)); if (!ts.length) return '<p class="muted">Tasks with due dates appear here. Add start dates to see durations.</p>';
  const all = [...ts.map(t => t.start || t.due), ...ts.map(t => t.due), todayStr()].sort(); const min = all[0], max = all[all.length - 1];
  const days = -daysUntil(min) * -1; const span = Math.round((Date.parse(max) - Date.parse(min)) / 864e5) + 1; const PX = 22; const W = span * PX;
  const off = s => Math.round((Date.parse(s) - Date.parse(min)) / 864e5) * PX;
  const col = t => t.status === 'done' ? 'var(--done)' : t.status === 'blocked' ? 'var(--crit)' : (daysUntil(t.due) < 0 ? 'var(--high)' : 'var(--brand)');
  return `<div class="gantt"><div style="width:${W + 8}px;position:relative"><div class="g-today" style="left:${off(todayStr()) + PX / 2}px"></div><div class="small muted" style="display:flex;justify-content:space-between"><span>${min}</span><span>${max}</span></div>
  ${ts.map(t => { const s = off(t.start || t.due), w = Math.max(PX, off(t.due) - s + PX); const deps = (t.deps || []).map(id => S.tasks.find(x => x.id === id)?.title).filter(Boolean); return `<div class="g-row"><div class="g-label small">${esc(t.title)} <span class="muted">· ${STATUS[t.status] || ''}${deps.length ? ' · after ' + esc(deps.join(', ')) : ''}</span></div><div class="g-track"><div class="g-bar" style="left:${s}px;width:${w}px;background:${col(t)}"></div></div></div>`; }).join('')}</div></div><p class="small muted">Bars run from start date to due date. Red = blocked, orange = overdue, green = done, line = today.</p>`;
}
function taskExtra(t) {
  const lines = []; const deps = (t.deps || []).map(id => S.tasks.find(x => x.id === id && !x.deleted)).filter(Boolean); const wait = deps.filter(d => d.status !== 'done');
  if (wait.length) lines.push(`<span style="color:var(--high)">Waiting on: ${esc(wait.map(d => d.title).join(', '))}</span>`);
  if (t.boqItemId) { const it = itemOf(t.boqItemId); if (it) lines.push(`BOQ: ${esc(it.code)} ${esc(it.description)}`); }
  if (t.delayCause && t.status !== 'done') lines.push(`Delay cause: ${esc(t.delayCause)}`);
  if (t.needsApproval) lines.push('Needs approval before completion');
  if (t.status === 'review') lines.push(`Submitted by ${esc(userName(t.submittedBy))}`);
  if (t.status === 'done' && t.approvedBy) lines.push(`Approved by ${esc(userName(t.approvedBy))}`);
  return lines.length ? `<div class="small muted">${lines.join('<br>')}</div>` : '';
}

// ================= DAILY REPORT =================
function buildReport(d) {
  const ts = P(S.tasks); const att = P(S.attendance).filter(a => a.date === d); const tx = pTx().filter(t => t.date === d); const ups = pUpdates().filter(u => u.date === d);
  return {
    date: d, done: ts.filter(t => t.status === 'done' && t.doneDate === d).map(t => t.title), planned: ts.filter(t => t.due === d && t.status !== 'done').map(t => t.title),
    labour: att.map(a => `${wname(a.workerId)}: ${ATT[a.status]}`), labourDays: att.filter(a => a.status === 'present').length + att.filter(a => a.status === 'half').length / 2,
    received: tx.filter(t => t.type === 'receipt').map(t => `${mname(t.materialId)}: ${fmt(t.qty)} ${S.materials.find(m => m.id === t.materialId)?.unit || ''}`),
    used: tx.filter(t => t.type === 'issue' || t.type === 'consumption').map(t => `${mname(t.materialId)}: ${fmt(t.qty)} ${S.materials.find(m => m.id === t.materialId)?.unit || ''}`),
    progress: ups.map(u => { const it = itemOf(u.itemId); return `${it ? it.code + ' ' + it.description : 'Item'}: ${fmt(u.qty)} ${it?.unit || ''} (${u.status === 'verified' ? 'verified' : u.status === 'rejected' ? 'sent back' : 'awaiting verification'})`; }),
    photos: sum(ups.map(u => ({ n: (u.photos || []).length })), 'n'),
    expenses: typeof dayExpenses === 'function' ? dayExpenses(d) : null,
    problems: ts.filter(t => t.status === 'blocked').map(t => `${t.title}${t.delayCause ? ' (' + t.delayCause + ')' : ''}${t.blockReason ? ': ' + t.blockReason : ''}`)
  };
}
function viewReport(date) {
  const g = gate('reports'); if (g) return g; const d = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : todayStr();
  const sub = P(S.dailyreports).find(r => r.date === d); const r = sub ? sub.data : buildReport(d); const L = (a, none = 'None recorded') => a.length ? `<ul class="plain small">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="small muted">${none}</p>`;
  return `<a href="#/daily/${d}" class="small muted noprint">← Daily activities</a><h1>Daily site report · ${d}</h1>
  <div class="card small">Project: <b>${esc(curProject().name)}</b> · ${esc(pcity())}<br>${sub ? `Submitted by <b>${esc(sub.byName)}</b> on ${esc(sub.submittedAt.slice(0, 16).replace('T', ' '))} UTC. This is a frozen copy.` : '<b>Draft</b>: generated from today’s records; not submitted.'}</div>
  <div class="card"><h2 style="margin-top:0">Activities completed</h2>${L(r.done)}<h2>Planned and still open</h2>${L(r.planned)}<h2>Labour attendance (${r.labourDays} labour-days)</h2>${L(r.labour)}<h2>Materials received</h2>${L(r.received)}<h2>Materials used</h2>${L(r.used)}<h2>Work progress recorded</h2>${L(r.progress)}<p class="small">Photographs attached: ${r.photos}</p><h2>Problems and delays</h2>${L(r.problems)}${sub?.notes ? `<h2>Notes</h2><p class="small">${esc(sub.notes)}</p>` : ''}
  ${r.expenses ? `<h2>Expenses recorded</h2>${L(r.expenses)}` : ''}<p class="small muted">Equipment use is not tracked separately. Progress here includes unverified entries as labelled.</p></div>
  <div class="row noprint"><button data-a="print">Print / Save as PDF</button>${can('reports', 'e') && !sub ? `<button class="primary" data-a="submit-report" data-id="${d}">Submit report</button>` : ''}</div>`;
}

// ================= FORM HANDLERS =================
const needE = (area, msg) => { if (!can(area, 'e')) throw new Error(msg || 'Your role cannot do this.'); };
F.pupdate = async (d, form) => {
  needE('tasks'); const it = itemOf(d.itemId); if (!it) throw new Error('Choose a BOQ item.'); const ip = itemProgress(it); if (ip.plan == null) throw new Error('This item has no valid BOQ quantity.');
  const qty = reqNum(d.qty, 'Quantity'); if (qty <= 0) throw new Error('Quantity must be more than zero.'); if (!d.date || d.date > todayStr()) throw new Error('Work date cannot be in the future.');
  if (ip.ver + ip.pend + qty > ip.plan * (1 + 1e-9)) throw new Error(`This would exceed the BOQ quantity. Remaining to record: ${fmt(Math.max(0, ip.plan - ip.ver - ip.pend))} ${it.unit}. If the work is larger than the BOQ, revise the BOQ first.`);
  const photos = await savePhotos(new FormData(form).getAll('photos'));
  await save('progress', { projectId: S.pid, itemId: it.id, qty, date: d.date, location: trim(d.location), comment: trim(d.comment), photos, status: 'submitted', recordedBy: S.user.id }, `Recorded ${fmt(qty)} ${it.unit} on ${it.code}`);
};
F.rejectprog = async d => { if (!approver()) throw new Error('Only an approver can send work back.'); if (!trim(d.reason)) throw new Error('Give a reason.'); const u = S.progress.find(x => x.id === d.id); await save('progress', { ...u, status: 'rejected', rejectReason: trim(d.reason), verifiedBy: S.user.id, verifiedAt: new Date().toISOString() }, 'Sent back a progress update'); };
F.progcfg = async (d, form) => {
  if (!approver()) throw new Error('Only an approver can change the method.'); const w = {};
  for (const [k, v] of new FormData(form).entries()) if (k.startsWith('w_') && v !== '') { const n = Number(v); if (!(n >= 0)) throw new Error('Weights must be positive numbers.'); w[k.slice(2)] = n; }
  if (d.method === 'manual' && !Object.values(w).some(x => x > 0)) throw new Error('Enter at least one weight above zero.');
  const old = S.progcfg.find(x => x.id === S.pid); await save('progcfg', { ...(old || {}), id: S.pid, projectId: S.pid, method: d.method, weights: w }, 'Changed progress weighting method');
};
F.tx = async d => {
  needE('inventory'); const m = S.materials.find(x => x.id === d.materialId && !x.deleted); if (!m) throw new Error('Choose a material.'); const qty = reqNum(d.qty, 'Quantity'); if (qty <= 0) throw new Error('Quantity must be more than zero.');
  if (!d.date || d.date > todayStr()) throw new Error('Date cannot be in the future.'); if (TX_OUT.includes(d.type) && qty > stockOf(m.id) + 1e-9) throw new Error(`Only ${fmt(stockOf(m.id))} ${m.unit} in stock.`);
  if (d.orderId && d.type !== 'receipt') throw new Error('Only deliveries can be recorded against an order.');
  if (d.orderId) { const o = S.orders.find(x => x.id === d.orderId); if (o.materialId !== m.id) throw new Error('That order is for a different material.'); }
  await save('invtx', { projectId: S.pid, type: d.type, materialId: m.id, qty, date: d.date, orderId: d.orderId || '', section: d.section || '', note: trim(d.note), by: S.user.id }, `${TX_LABEL[d.type]}: ${fmt(qty)} ${m.unit} ${m.name}`);
  if (d.orderId) { const o = S.orders.find(x => x.id === d.orderId); await load(); if (receivedFor(o) >= Number(o.qty) - 1e-9) await save('orders', { ...o, status: 'received' }, 'Order fully received'); }
};
F.order = async d => { needE('inventory'); const qty = reqNum(d.qty, 'Quantity'); if (qty <= 0) throw new Error('Quantity must be more than zero.'); if (d.expected && d.expected < d.date) throw new Error('Expected date is before the order date.'); await save('orders', { projectId: S.pid, materialId: d.materialId, supplierId: d.supplierId, qty, date: d.date, expected: d.expected, status: 'ordered', by: S.user.id }, `Ordered ${fmt(qty)} ${mname(d.materialId)}`); };
F.worker = async d => { needE('labour'); if (!trim(d.name)) throw new Error('Name is required.'); const old = d.id ? S.workers.find(x => x.id === d.id) : null; await save('workers', { ...(old || {}), id: d.id || undefined, projectId: S.pid, name: trim(d.name), category: d.category, phone: trim(d.phone) }, `${old ? 'Edited' : 'Added'} worker ${trim(d.name)}`); };
F.report = async d => { needE('reports'); const date = d.date; if (P(S.dailyreports).some(r => r.date === date)) throw new Error('A report for this day was already submitted.'); await save('dailyreports', { id: `${S.pid}|${date}`, projectId: S.pid, date, notes: trim(d.notes), data: buildReport(date), submittedBy: S.user.id, byName: S.user.name, submittedAt: new Date().toISOString() }, `Submitted daily report ${date}`); };

Object.assign(A, {
  'new-progress': id => openSheet(progForm(id)), 'prog-settings': () => openSheet(progSettingsForm()),
  async 'verify-prog'(id) {
    if (!approver()) throw new Error('Only an approver can verify work.'); const u = S.progress.find(x => x.id === id); if (u.status !== 'submitted') return;
    if (u.recordedBy === S.user.id && memberCount() > 1) throw new Error('Another person must verify work you recorded.');
    if (!confirm('Confirm the work was inspected and the quantity is correct?')) return;
    await save('progress', { ...u, status: 'verified', verifiedBy: S.user.id, verifiedAt: new Date().toISOString() }, 'Verified a progress update'); await render();
  },
  'reject-prog'(id) { if (!approver()) throw new Error('Only an approver can send work back.'); openSheet(`<h1>Send back</h1><form data-f="rejectprog"><input type="hidden" name="id" value="${id}">${fld('Reason', 'reason', '', { req: 1 })}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Send back</button></div></form>`); },
  'new-tx': () => openSheet(txForm()), 'new-tx-receipt': () => openSheet(txForm('receipt')), 'new-tx-issue': () => openSheet(txForm('issue')), 'new-order': () => openSheet(orderForm()),
  async 'cancel-order'(id) { needE('inventory'); if (!confirm('Cancel this order?')) return; const o = S.orders.find(x => x.id === id); await save('orders', { ...o, status: 'cancelled' }, 'Cancelled order'); await render(); },
  'new-worker': () => openSheet(workerForm()), 'edit-worker': id => openSheet(workerForm(S.workers.find(w => w.id === id))),
  async att(id) { needE('labour'); const st = window.__lastEl.dataset.s; const old = S.attendance.find(a => a.id === attId(attDate, id)); await save('attendance', { ...(old || {}), id: attId(attDate, id), projectId: S.pid, workerId: id, date: attDate, status: st, by: S.user.id }, `Attendance ${wname(id)} ${st}`); await render(); },
  print: () => window.print(),
  'submit-report'(d) { openSheet(`<h1>Submit daily report</h1><p class="small muted">This saves a frozen copy of the report for ${d}.</p><form data-f="report"><input type="hidden" name="date" value="${d}"><label>Notes<textarea name="notes" rows="3"></textarea></label><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Submit</button></div></form>`); },
  async 'submit-task'(id) { needE('tasks'); const t = S.tasks.find(x => x.id === id); await save('tasks', { ...t, status: 'review', submittedBy: S.user.id }, `Submitted for approval: ${t.title}`); await render(); },
  async 'approve-task'(id) { if (!approver()) throw new Error('Only an approver can approve.'); const t = S.tasks.find(x => x.id === id); if (t.submittedBy === S.user.id && memberCount() > 1) throw new Error('Another person must approve work you submitted.'); await save('tasks', { ...t, status: 'done', doneDate: todayStr(), doneBy: t.submittedBy || S.user.id, approvedBy: S.user.id }, `Approved task ${t.title}`); await render(); },
  async 'reject-task'(id) { if (!approver()) throw new Error('Only an approver can send back.'); const t = S.tasks.find(x => x.id === id); await save('tasks', { ...t, status: 'doing' }, `Sent back task ${t.title}`); await render(); }
});
document.addEventListener('change', async e => { if (e.target.id === 'attdate') { attDate = e.target.value || todayStr(); if (attDate > todayStr()) attDate = todayStr(); await render(); } });

// ================= REGISTRATION =================
ROUTES.daily = viewDailyNew; ROUTES.tasks = viewTasksNew; ROUTES.progress = viewProgress; ROUTES.progitem = viewProgItem; ROUTES.inventory = viewInventory; ROUTES.labour = viewLabour; ROUTES.report = viewReport;
for (const k of ['progress', 'inventory', 'labour', 'daily', 'tasks']) Object.assign(SECTIONS.find(s => s.k === k), { live: true });
DASH_EXT.approvals = () => {
  const rv = P(S.tasks).filter(t => t.status === 'review'), pu = pUpdates().filter(u => u.status === 'submitted');
  if (!rv.length && !pu.length) return `<div class="card"><b>Needs approval</b><div class="muted small">Nothing is waiting.</div></div>`;
  return `<h2>Needs approval</h2>${rv.map(taskCard).join('')}${pu.length ? `<a class="card" style="display:block" href="#/progress"><b>${pu.length} progress update(s)</b> <span class="muted small">waiting for verification</span></a>` : ''}`;
};
DASH_EXT.materials = () => {
  if (!can('inventory')) return ''; const rows = procurement().filter(r => r.toBuy > 1e-9);
  return rows.length ? `<h2>Materials needed</h2><a class="card" style="display:block" href="#/inventory/procurement">${rows.slice(0, 4).map(r => `<div class="row small"><span>${esc(r.m.name)}</span><b>${fmt(r.toBuy)} ${esc(r.m.unit)}</b></div>`).join('')}${rows.length > 4 ? `<div class="tag">+${rows.length - 4} more</div>` : ''}</a>` : `<div class="card"><b>Materials</b><div class="muted small">No shortages against the BOQ requirement.</div></div>`;
};
DASH_EXT.labour = () => { if (!can('labour')) return ''; const att = P(S.attendance).filter(a => a.date === todayStr()); return `<a class="card" style="display:block" href="#/labour"><b>Labour today</b><div class="muted small">${att.filter(a => a.status === 'present').length} present · ${att.filter(a => a.status === 'half').length} half day · ${P(S.workers).length - att.length} not recorded</div></a>`; };
