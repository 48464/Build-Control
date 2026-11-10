'use strict';
/* Phase 3 — Ethiopian price database, supplier quotations, labour/equipment rates, unit-rate analysis and cost estimate.
   NO prices are built in. Every price is entered by a user with a date, source and validity, and the app labels its reliability. */

const MAT_CATS = ['Cement', 'Reinforcement steel', 'Sand', 'Coarse aggregate', 'Blocks', 'Bricks', 'Timber', 'Roofing materials', 'Paint', 'Tiles', 'Electrical materials', 'Plumbing materials', 'Doors', 'Windows', 'Glass', 'Waterproofing', 'Other'];
const LAB_CATS = ['Mason', 'Carpenter', 'Steel fixer', 'General labourer', 'Excavation worker', 'Electrician', 'Plumber', 'Painter', 'Tiler', 'Equipment operator', 'Supervisor', 'Other skilled trade'];
const EQ_CATS = ['Excavator', 'Concrete mixer', 'Compactor', 'Truck', 'Generator', 'Scaffolding', 'Other equipment'];
const MUNITS = ['bag', 'kg', 't', 'm', 'm²', 'm³', 'nr', 'piece', 'sheet', 'litre', 'bundle', 'trip', 'quintal', 'LS'];
const SRC = { supplier_quote: 'Supplier quotation', user: 'Entered by user', public: 'Public reference price', estimate: 'Unverified estimate' };
const METHODS = { lowest: 'Lowest verified offer', selected: 'Selected supplier', average: 'Average verified offer', manual: 'Manual rates only' };
const COMP_TYPES = [['material', 'Material'], ['labour', 'Labour'], ['equipment', 'Equipment'], ['transport', 'Transport'], ['other', 'Other direct cost']];
const money = n => n == null || !isFinite(n) ? '—' : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pcity = () => { const p = curProject(); return p ? cityOf(p) : ''; };
const byP = a => (a || []).filter(x => x.projectId === S.pid && !x.deleted);
const mats = () => byP(S.materials), sups = () => byP(S.suppliers), quotes = () => byP(S.quotes), labs = () => byP(S.labourrates), eqs = () => byP(S.equiprates);
const canP = () => can('boq', 'e');
const supName = id => S.suppliers.find(s => s.id === id)?.name || 'Unknown supplier';
const settings = () => S.pricing.find(x => x.id === S.pid && !x.deleted) || { method: 'lowest', oh: 0, profit: 0, cont: 0, tax: 0, supplierId: '', configured: false };
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100; // money is rounded to 2 decimals at every displayed line so figures add up
const pnum = v => v === '' || v == null ? null : (isFinite(Number(v)) ? Number(v) : null);

// ---------- quotation reliability ----------
function quoteStatus(q, siblings) {
  if (q.validDays != null && q.validDays !== '' && daysUntil(q.date) + Number(q.validDays) < 0) return 'Expired quotation';
  // only a newer real quotation supersedes an older one; estimates and public references never hide a quoted price
  const newer = siblings.some(o => o.source !== 'estimate' && o.source !== 'public' && o.id !== q.id && o.materialId === q.materialId && o.supplierId === q.supplierId && o.city === q.city && (o.date > q.date || (o.date === q.date && (o.createdAt || '') > (q.createdAt || ''))));
  if (newer) return 'Historical price';
  if (q.source === 'estimate') return 'Unverified estimate';
  if (q.source === 'public') return 'Public reference price';
  if (q.source === 'supplier_quote' && q.verified) return -daysUntil(q.date) <= 30 ? 'Recently verified' : 'Verified supplier quotation';
  return 'User-entered quotation';
}
const STATUS_CLS = { 'Recently verified': 'Completed', 'Verified supplier quotation': 'Completed', 'User-entered quotation': 'Medium', 'Public reference price': 'Low', 'Historical price': 'Low', 'Expired quotation': 'Critical', 'Unverified estimate': 'High' };
const VERIFIED = ['Recently verified', 'Verified supplier quotation'];
const UNUSABLE = ['Expired quotation', 'Historical price', 'Unverified estimate'];
const delivered = q => Number(q.price) + (Number(q.delivery) || 0);
function matQuotes(m) {
  const all = quotes().filter(q => q.materialId === m.id);
  return all.map(q => ({ q, st: quoteStatus(q, all), dp: delivered(q) }));
}

// ---------- price resolution (uses the project's visible pricing method) ----------
function resolvePrice(m, st) {
  const city = pcity(); const all = matQuotes(m); const here = all.filter(x => x.q.city === city);
  const usable = here.filter(x => !UNUSABLE.includes(x.st)); const ver = usable.filter(x => VERIFIED.includes(x.st));
  const who = x => `${supName(x.q.supplierId)}, ${x.q.date}, ${x.st}`;
  const none = () => here.length ? `Only expired, historical or unverified prices for ${m.name} in ${city}` : `No quotation for ${m.name} in ${city}`;
  if (st.method === 'lowest') { if (!ver.length) return { issue: none() + ' (method needs a verified offer)' }; const b = ver.reduce((a, x) => x.dp < a.dp ? x : a); return { price: b.dp, basis: 'Lowest verified: ' + who(b) }; }
  if (st.method === 'average') { if (!ver.length) return { issue: none() + ' (method needs verified offers)' }; return { price: ver.reduce((a, x) => a + x.dp, 0) / ver.length, basis: `Average of ${ver.length} verified offer(s)` }; }
  if (st.method === 'selected') {
    if (!st.supplierId) return { issue: 'No supplier chosen in pricing settings' };
    const mine = usable.filter(x => x.q.supplierId === st.supplierId).sort((a, b) => b.q.date.localeCompare(a.q.date));
    if (!mine.length) return { issue: `${supName(st.supplierId)} has no current quotation for ${m.name} in ${city}` };
    return { price: mine[0].dp, basis: 'Selected supplier: ' + who(mine[0]) };
  }
  return { issue: `Manual method: type a manual rate for ${m.name} in the rate analysis` };
}

// ---------- unit rate analysis ----------
function unitRate(ra, st) {
  const lines = [], issues = []; let direct = 0; const byType = {}; const city = pcity();
  for (const c of ra.components || []) {
    const q = Number(c.qty); let rate = null, basis = '', unit = c.unit || '';
    const manual = pnum(c.manualRate); const nm = c.name || 'Component';
    if (!isFinite(q) || q < 0 || c.qty === '' || c.qty == null) issues.push(`${nm}: quantity per unit is missing`);
    if (c.type === 'material' && c.refId) {
      const m = S.materials.find(x => x.id === c.refId && !x.deleted);
      if (!m) issues.push(`${nm}: material was removed`);
      else { unit = m.unit; if (manual != null) { rate = manual; basis = 'Manual override entered by user'; } else { const r = resolvePrice(m, st); if (r.price != null) { rate = r.price; basis = r.basis; } else issues.push(`${nm}: ${r.issue}`); } }
    } else if (c.type === 'labour' && c.refId) {
      const l = S.labourrates.find(x => x.id === c.refId && !x.deleted);
      if (!l) issues.push(`${nm}: labour rate was removed`); else if (l.city !== city) issues.push(`${nm}: rate is for ${l.city}, project is in ${city}`);
      else { rate = Number(l.daily); unit = 'day'; basis = `${l.category} daily rate, ${l.city}, dated ${l.date}${l.source ? ', ' + l.source : ''}`; }
    } else if (c.type === 'equipment' && c.refId) {
      const e = S.equiprates.find(x => x.id === c.refId && !x.deleted);
      if (!e) issues.push(`${nm}: equipment rate was removed`); else if (e.city !== city) issues.push(`${nm}: rate is for ${e.city}, project is in ${city}`);
      else { rate = Number(e.hire) + (Number(e.fuel) || 0); unit = 'day'; basis = `${e.name} hire${Number(e.fuel) ? ' + fuel' : ''} per day, ${e.city}, dated ${e.date}${e.source ? ', ' + e.source : ''}`; }
    } else if (manual != null) { rate = manual; basis = 'Manual rate entered by user'; }
    else issues.push(`${nm}: no rate`);
    const w = Number(c.wastePct) || 0; const effQ = isFinite(q) ? q * (1 + w / 100) : NaN;
    const cost = rate != null && isFinite(effQ) ? r2(effQ * rate) : null;
    if (cost != null) { direct += cost; byType[c.type] = (byType[c.type] || 0) + cost; }
    lines.push({ c, rate, basis, unit, effQ, cost });
  }
  return { lines, issues, direct, byType };
}
// Markups are applied once, in this stated order, so nothing is counted twice:
// overhead on direct; profit on (direct+overhead); contingency on direct; tax on everything before it.
function markups(d0, st) {
  const d = r2(d0), pc = k => (Number(st[k]) || 0) / 100;
  const oh = r2(d * pc('oh')), pr = r2((d + oh) * pc('profit')), ct = r2(d * pc('cont')), tx = r2((d + oh + pr + ct) * pc('tax'));
  return { direct: d, oh, profit: pr, cont: ct, tax: tx, total: r2(d + oh + pr + ct + tx) };
}
const raOf = id => S.rates.find(r => r.id === id && !r.deleted && r.projectId === S.pid);

function estimate() {
  const st = settings(); const rows = []; const tot = { direct: 0, oh: 0, profit: 0, cont: 0, tax: 0, total: 0 };
  const secs = {}, types = {}, sched = {};
  for (const it of sortItems(pItems())) {
    const c = calcItem(it); const ra = raOf(it.id); const row = { it, c, ra, issues: [] };
    if (!c.ok) { row.status = 'Quantity error'; row.issues = c.issues; }
    else if (!ra || !(ra.components || []).length) row.status = 'No rate analysis';
    else {
      const u = unitRate(ra, st); row.u = u;
      if (u.issues.length) { row.status = 'Incomplete prices'; row.issues = u.issues; }
      else {
        const m = markups(u.direct, st); row.m = m; row.unitRate = m.total; row.total = r2(m.total * c.net);
        row.status = itemStatus(it, c) === 'Verified' ? 'Priced' : 'Priced (quantity not verified)';
        for (const k of Object.keys(tot)) tot[k] += k === 'total' ? row.total : m[k] * c.net;
        secs[it.section] = (secs[it.section] || 0) + row.total;
        for (const [t, v] of Object.entries(u.byType)) types[t] = (types[t] || 0) + v * c.net;
        for (const l of u.lines) if (l.c.type === 'material' && l.c.refId) { const s = sched[l.c.refId] = sched[l.c.refId] || { qty: 0, cost: 0, unit: l.unit }; s.qty += l.effQ * c.net; s.cost += l.cost * c.net; }
      }
    }
    rows.push(row);
  }
  const p = curProject();
  return { st, rows, tot, secs, types, sched, perM2: p?.area ? tot.total / p.area : null, priced: rows.filter(r => r.total != null).length, open: rows.filter(r => r.total == null).length };
}

// ---------- CSV ----------
function parseCsv(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

// ---------- views ----------
const tabs = cur => `<div class="tabs">${[['materials', 'Materials'], ['suppliers', 'Suppliers'], ['labour', 'Labour'], ['equipment', 'Equipment']].map(([k, l]) => `<a href="#/suppliers/${k}" class="${cur === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const noAccess = () => !curProject() ? emptyProject() : !can('boq') ? locked() : null;

function viewPrices(tab) {
  const x = noAccess(); if (x) return x; tab = tab || 'materials'; const st = settings(); const e = canP();
  let body = '';
  if (tab === 'materials') {
    const ms = mats().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    body = `<div class="row"><span class="muted small">Prices for <b>${esc(pcity())}</b> · method: <b>${METHODS[st.method]}</b></span>${e ? `<span><button class="sm primary" data-a="new-material">+ Material</button> <button class="sm" data-a="import-prices">Import CSV</button></span>` : ''}</div>
    ${ms.length ? ms.map(m => { const r = resolvePrice(m, st); const n = matQuotes(m).length; return `<a class="card" style="display:block" href="#/material/${m.id}"><div class="row"><b>${esc(m.name)}</b><span class="badge">${esc(m.category)}</span></div><div class="muted small">${esc(m.spec || 'No specification')}${m.brand ? ' · ' + esc(m.brand) : ''} · per ${esc(m.unit)}</div>${r.price != null ? `<div><b>${money(r.price)} ETB</b> <span class="muted small">per ${esc(m.unit)}, delivered</span></div><div class="muted small">${esc(r.basis)}</div>` : `<div class="small" style="color:var(--high)">⚠ ${esc(r.issue)}</div>`}<div class="tag">${n} quotation record(s)</div></a>`; }).join('') : '<p class="muted">No materials yet. Add a material, then add supplier quotations for it. The app never fills in market prices for you.</p>'}`;
  } else if (tab === 'suppliers') {
    const ss = sups().sort((a, b) => a.name.localeCompare(b.name));
    body = `<div class="row"><span class="muted small">${ss.length} supplier(s)</span>${e ? `<button class="sm primary" data-a="new-supplier">+ Supplier</button>` : ''}</div>${ss.map(s => `<div class="card row"><div><b>${esc(s.name)}</b><div class="muted small">${esc(s.city)}${s.phone ? ' · ' + esc(s.phone) : ''}</div></div>${e ? `<button class="sm" data-a="edit-supplier" data-id="${s.id}">Edit</button>` : ''}</div>`).join('') || '<p class="muted">No suppliers yet.</p>'}`;
  } else if (tab === 'labour') {
    const ls = labs().sort((a, b) => a.category.localeCompare(b.category));
    body = `<div class="row"><span class="muted small">Daily rates per worker</span>${e ? `<button class="sm primary" data-a="new-labour">+ Labour rate</button>` : ''}</div>${ls.map(l => `<div class="card"><div class="row"><b>${esc(l.category)}${l.skill ? ' · ' + esc(l.skill) : ''}</b><span class="chip ${l.city === pcity() ? 'Completed' : 'Low'}">${esc(l.city)}</span></div><div>${money(l.daily)} ETB / day${pnum(l.hourly) != null ? ` · ${money(l.hourly)} / hour` : ''}</div><div class="muted small">Dated ${esc(l.date)} (${-daysUntil(l.date)} days ago) · ${esc(l.source || 'no source recorded')}${l.productivity ? '<br>Productivity: ' + esc(l.productivity) : ''}${l.city !== pcity() ? '<br>Not used: different city from this project' : ''}</div>${e ? `<div style="margin-top:8px"><button class="sm" data-a="edit-labour" data-id="${l.id}">Edit</button> <button class="sm danger" data-a="del-rate" data-id="${l.id}" data-s="labourrates">Delete</button></div>` : ''}</div>`).join('') || '<p class="muted">No labour rates yet.</p>'}`;
  } else {
    const es = eqs().sort((a, b) => a.name.localeCompare(b.name));
    body = `<div class="row"><span class="muted small">Hire per day, fuel per day</span>${e ? `<button class="sm primary" data-a="new-equip">+ Equipment rate</button>` : ''}</div>${es.map(q => `<div class="card"><div class="row"><b>${esc(q.name)}</b><span class="chip ${q.city === pcity() ? 'Completed' : 'Low'}">${esc(q.city)}</span></div><div>${money(q.hire)} ETB hire / day${pnum(q.fuel) ? ` + ${money(q.fuel)} fuel` : ''}${pnum(q.transport) ? ` · transport ${money(q.transport)} per trip` : ''}</div><div class="muted small">Dated ${esc(q.date)} · ${esc(q.source || 'no source recorded')}</div>${e ? `<div style="margin-top:8px"><button class="sm" data-a="edit-equip" data-id="${q.id}">Edit</button> <button class="sm danger" data-a="del-rate" data-id="${q.id}" data-s="equiprates">Delete</button></div>` : ''}</div>`).join('') || '<p class="muted">No equipment rates yet.</p>'}`;
  }
  return `<h1>Suppliers & Prices</h1>${tabs(tab)}${body}`;
}

function viewMaterial(id) {
  const x = noAccess(); if (x) return x;
  const m = S.materials.find(v => v.id === id && v.projectId === S.pid && !v.deleted); if (!m) return `<div class="card">Material not found.</div>`;
  const st = settings(); const all = matQuotes(m).sort((a, b) => b.q.date.localeCompare(a.q.date)); const city = pcity();
  const here = all.filter(v => v.q.city === city); const other = all.filter(v => v.q.city !== city);
  const comparable = here.filter(v => !UNUSABLE.includes(v.st)).sort((a, b) => a.dp - b.dp);
  const need = estimate().sched[m.id]; const r = resolvePrice(m, st); const e = canP();
  const qcard = (v, best) => `<div class="card"><div class="row"><b>${esc(supName(v.q.supplierId))}</b><span class="chip ${STATUS_CLS[v.st]}">${v.st}</span></div>
    <div><b>${money(v.dp)} ETB</b> <span class="muted small">per ${esc(m.unit)} delivered (${money(v.q.price)} + ${money(v.q.delivery || 0)} delivery)</span>${best ? ' <span class="chip Completed">lowest usable</span>' : ''}</div>
    <div class="muted small">${esc(v.q.city)} · quoted ${esc(v.q.date)} · valid ${esc(v.q.validDays)} days · ${SRC[v.q.source]}${v.q.leadDays ? ' · lead time ' + esc(v.q.leadDays) + ' days' : ''}${v.q.terms ? '<br>Payment: ' + esc(v.q.terms) : ''}${v.q.note ? '<br>' + esc(v.q.note) : ''}</div>
    ${need && !UNUSABLE.includes(v.st) && v.q.city === city ? `<div class="small">For the estimate quantity (${fmt(need.qty)} ${esc(m.unit)}): <b>${money(v.dp * need.qty)} ETB</b></div>` : ''}
    ${e ? `<div style="margin-top:8px"><button class="sm" data-a="edit-quote" data-id="${v.q.id}">Edit</button> <button class="sm danger" data-a="del-quote" data-id="${v.q.id}">Delete</button></div>` : ''}</div>`;
  return `<a href="#/suppliers/materials" class="small muted">← Materials</a><h1>${esc(m.name)}</h1>
  <div class="card small">${esc(m.category)} · per ${esc(m.unit)}<br>Specification: ${esc(m.spec || 'not recorded')}${m.brand ? '<br>Brand: ' + esc(m.brand) : ''}
  <div style="margin-top:8px">${r.price != null ? `Price used for estimates: <b>${money(r.price)} ETB</b> per ${esc(m.unit)}<br><span class="muted">${esc(r.basis)}</span>` : `<span style="color:var(--high)">⚠ ${esc(r.issue)}</span>`}</div>
  ${e ? `<div style="margin-top:8px"><button class="sm" data-a="edit-material" data-id="${id}">Edit material</button> <button class="sm danger" data-a="del-material" data-id="${id}">Delete</button></div>` : ''}</div>
  <div class="row"><h2>Quotations in ${esc(city)}</h2>${e ? `<button class="sm primary" data-a="new-quote" data-id="${id}">+ Quotation</button>` : ''}</div>
  <p class="small muted">Only compare quotations for the same specification. “Lowest” is a pointer, not advice: check the product matches before choosing, and do not pick an inferior material only because it is cheaper.</p>
  ${here.length ? here.map(v => qcard(v, comparable[0] && comparable[0].q.id === v.q.id && comparable.length > 1)).join('') : '<p class="muted small">None for this city.</p>'}
  ${other.length ? `<h2>Other cities (not used here)</h2>${other.map(v => qcard(v, false)).join('')}` : ''}`;
}

function viewCost() {
  const x = noAccess(); if (x) return x; const E = estimate(); const st = E.st; const p = curProject(); const e = canP();
  const sec = k => BOQ_SECTIONS.find(s => s[0] === k)?.[1] || k;
  const row = r => `<a class="card" style="display:block" href="#/rate/${r.it.id}"><div class="row"><b>${esc(r.it.code)} ${esc(r.it.description)}</b><span class="chip ${r.total != null ? (r.status === 'Priced' ? 'Completed' : 'Medium') : 'High'}">${r.status}</span></div>${r.total != null ? `<div>${fmt(r.c.net)} ${esc(r.it.unit)} × ${money(r.unitRate)} = <b>${money(r.total)} ETB</b></div>` : `<div class="small" style="color:var(--high)">${r.issues.length ? '⚠ ' + esc(r.issues[0]) + (r.issues.length > 1 ? ` (+${r.issues.length - 1} more)` : '') : 'Open to add components'}</div>`}</a>`;
  const bt = Object.entries(E.types).map(([t, v]) => `<div class="row small"><span>${COMP_TYPES.find(c => c[0] === t)?.[1] || t}</span><b>${money(v)}</b></div>`).join('');
  const bs = Object.entries(E.secs).sort().map(([k, v]) => `<div class="row small"><span>${k} · ${esc(sec(k))}</span><b>${money(v)}</b></div>`).join('');
  const sc = Object.entries(E.sched).map(([id, s]) => ({ m: S.materials.find(v => v.id === id), ...s })).filter(s => s.m).sort((a, b) => a.m.category.localeCompare(b.m.category));
  return `<h1>Cost Estimation</h1>
  <div class="card"><div class="row"><b>Estimate</b><span class="badge">Not an approved budget</span></div>
  <div class="small muted">Location: ${esc(pcity())} · pricing method: <b>${METHODS[st.method]}</b>${st.method === 'selected' ? ' (' + esc(supName(st.supplierId)) + ')' : ''}<br>Overhead ${st.oh}% · profit ${st.profit}% · contingency ${st.cont}% · tax ${st.tax}%${st.configured ? '' : ' <span style="color:var(--high)">(not configured yet: all 0%)</span>'}<br>Order: overhead on direct; profit on direct + overhead; contingency on direct; tax on all of these. Priced on net quantities.</div>
  <div class="grid" style="margin:12px 0 0"><div class="kpi"><span class="muted small">Direct cost</span><b>${money(E.tot.direct)}</b></div><div class="kpi"><span class="muted small">Overhead + profit</span><b>${money(E.tot.oh + E.tot.profit)}</b></div><div class="kpi"><span class="muted small">Contingency</span><b>${money(E.tot.cont)}</b></div><div class="kpi"><span class="muted small">Tax</span><b>${money(E.tot.tax)}</b></div></div>
  <p style="margin:12px 0 0">Total (priced items only): <b style="font-size:20px">${money(E.tot.total)} ETB</b></p>
  <div class="small muted">${E.priced} of ${E.rows.length} items priced${E.open ? ` · <b>${E.open} not included</b> (see items below)` : ''}${E.perM2 != null ? `<br>Cost per m²: ${money(E.perM2)} ETB (area ${p.area} m²)` : '<br>Add the floor area to the project to see cost per m².'}</div>
  <div class="row" style="margin-top:10px;justify-content:flex-start">${e ? `<button class="sm" data-a="pricing-settings">Pricing settings</button>` : ''}<button class="sm" data-a="export-estimate">Export CSV</button><button class="sm" data-a="export-schedule">Material schedule CSV</button></div></div>
  ${E.rows.length ? '' : '<p class="muted">Create BOQ items first (BOQ & Quantity Takeoff), then price them here.</p>'}
  ${bs ? `<h2>By work section</h2><div class="card">${bs}</div>` : ''}${bt ? `<h2>By cost type (direct)</h2><div class="card">${bt}</div>` : ''}
  ${sc.length ? `<h2>Material requirement</h2><div class="card">${sc.map(s => `<div class="row small"><a href="#/material/${s.m.id}"><u>${esc(s.m.name)}</u></a><span>${fmt(s.qty)} ${esc(s.m.unit)} · ${money(s.cost)}</span></div>`).join('')}<div class="muted small" style="margin-top:6px">Quantities come from your consumption coefficients including the waste % you entered. Stock and orders arrive in Phase 4.</div></div>` : ''}
  <h2>BOQ items</h2>${E.rows.map(row).join('') || ''}`;
}

function viewRate(id) {
  const x = noAccess(); if (x) return x;
  const it = S.boqitems.find(v => v.id === id && v.projectId === S.pid && !v.deleted); if (!it) return `<div class="card">BOQ item not found.</div>`;
  const c = calcItem(it); const st = settings(); const ra = raOf(id) || { components: [] }; const u = unitRate(ra, st); const e = canP();
  const m = markups(u.direct, st);
  return `<a href="#/cost" class="small muted">← Cost estimation</a><h1>${esc(it.code)} ${esc(it.description)}</h1>
  <div class="card small">Quantity (net): <b>${c.ok ? fmt(c.net) + ' ' + esc(it.unit) : 'not available'}</b>${c.ok ? '' : '<br><span class="err">' + esc(c.issues[0] || '') + '</span>'}<br>Rates per 1 ${esc(it.unit)} of this item. Method: <b>${METHODS[st.method]}</b>. <a href="#/boqitem/${id}"><u>View quantity calculation</u></a></div>
  <div class="row"><h2>Components</h2>${e ? `<button class="sm primary" data-a="new-comp" data-id="${id}">+ Component</button>` : ''}</div>
  ${u.lines.map((l, i) => `<div class="card"><div class="row"><b>${esc(l.c.name)}</b><span class="chip Low">${COMP_TYPES.find(t => t[0] === l.c.type)?.[1]}</span></div>
    <div class="small">${fmt(l.effQ)} ${esc(l.unit)}${Number(l.c.wastePct) ? ` (incl. ${l.c.wastePct}% waste)` : ''} × ${l.rate != null ? money(l.rate) : '—'} = <b>${l.cost != null ? money(l.cost) : '—'} ETB</b></div><div class="muted small">${esc(l.basis || '')}</div>
    ${e ? `<div style="margin-top:8px"><button class="sm" data-a="edit-comp" data-id="${id}" data-i="${i}">Edit</button> <button class="sm danger" data-a="del-comp" data-id="${id}" data-i="${i}">Remove</button></div>` : ''}</div>`).join('') || '<p class="muted small">No components yet. Add the materials, labour, equipment and other costs for one unit of this item. Consumption coefficients are yours to enter: none are assumed, and concrete mixes must follow the approved structural specification.</p>'}
  ${u.issues.length ? `<div class="card"><b style="color:var(--high)">Missing or unusable prices</b><ul class="plain small">${u.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><b>Unit rate build-up (per ${esc(it.unit)})</b>
  ${Object.entries(u.byType).map(([t, v]) => `<div class="row small"><span>${COMP_TYPES.find(q => q[0] === t)?.[1]}</span><span>${money(v)}</span></div>`).join('')}
  <div class="row small"><b>Direct unit rate</b><b>${money(m.direct)}</b></div><div class="row small"><span>Overhead ${st.oh}%</span><span>${money(m.oh)}</span></div><div class="row small"><span>Profit ${st.profit}%</span><span>${money(m.profit)}</span></div><div class="row small"><span>Contingency ${st.cont}%</span><span>${money(m.cont)}</span></div><div class="row small"><span>Tax ${st.tax}%</span><span>${money(m.tax)}</span></div>
  <div class="row"><b>Unit rate</b><b>${money(m.total)} ETB</b></div>
  ${c.ok && !u.issues.length ? `<div class="row"><b>Item total = ${fmt(c.net)} × ${money(m.total)}</b><b>${money(r2(m.total * c.net))} ETB</b></div>` : '<div class="small muted">Item total appears once quantity and all prices are available.</div>'}</div>`;
}

// ---------- forms ----------
const lists = { matCats: MAT_CATS };
const materialForm = m => `<h1>${m ? 'Edit material' : 'New material'}</h1><form data-f="material"><input type="hidden" name="id" value="${m?.id || ''}">${fld('Name', 'name', m?.name, { req: 1 })}${sel('Category', 'category', MAT_CATS, m?.category || 'Cement')}${fld('Technical specification (grade, size, thickness…)', 'spec', m?.spec)}${fld('Brand (optional)', 'brand', m?.brand)}${sel('Unit of measure', 'unit', MUNITS, m?.unit || 'bag')}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
const supplierForm = s => `<h1>${s ? 'Edit supplier' : 'New supplier'}</h1><form data-f="supplier"><input type="hidden" name="id" value="${s?.id || ''}">${fld('Supplier name', 'name', s?.name, { req: 1 })}${sel('City', 'city', CITIES, s?.city || pcity())}${fld('Phone', 'phone', s?.phone)}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
const quoteForm = (q, matId) => {
  const ss = sups(); if (!ss.length) return `<h1>Add a supplier first</h1><p class="muted">A quotation needs a supplier. Add one under Suppliers.</p><button data-a="close">OK</button>`;
  return `<h1>${q ? 'Edit quotation' : 'New quotation'}</h1><form data-f="quote"><input type="hidden" name="id" value="${q?.id || ''}"><input type="hidden" name="materialId" value="${q?.materialId || matId}">
  ${sel('Supplier', 'supplierId', ss.map(s => [s.id, s.name]), q?.supplierId)}${sel('City where the price applies', 'city', CITIES, q?.city || pcity())}
  ${fld('Price per unit (ETB), excluding delivery', 'price', q?.price, { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Delivery cost per unit (ETB)', 'delivery', q?.delivery ?? 0, { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}
  ${fld('Quotation date', 'date', q?.date || todayStr(), { type: 'date', req: 1 })}${fld('Valid for (days)', 'validDays', q?.validDays ?? '', { type: 'number', req: 1, attrs: 'min="0" step="1" inputmode="numeric"' })}
  ${sel('Source', 'source', Object.entries(SRC), q?.source || 'supplier_quote')}${chk('I saw this supplier’s written or verbal quotation and confirm it', 'verified', q?.verified)}
  ${fld('Delivery time (days)', 'leadDays', q?.leadDays, { type: 'number', attrs: 'min="0" step="1"' })}${fld('Payment conditions', 'terms', q?.terms)}${fld('Note', 'note', q?.note)}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
};
const labourForm = l => `<h1>${l ? 'Edit labour rate' : 'New labour rate'}</h1><form data-f="labour"><input type="hidden" name="id" value="${l?.id || ''}">${sel('Category', 'category', LAB_CATS, l?.category)}${fld('Skill level (optional)', 'skill', l?.skill)}${sel('City', 'city', CITIES, l?.city || pcity())}${fld('Daily rate (ETB)', 'daily', l?.daily, { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Hourly rate (ETB), optional', 'hourly', l?.hourly, { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Productivity note (e.g. “m² per day”), optional', 'productivity', l?.productivity)}${fld('Date verified', 'date', l?.date || todayStr(), { type: 'date', req: 1 })}${fld('Source (who told you / which list)', 'source', l?.source)}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
const equipForm = q => `<h1>${q ? 'Edit equipment rate' : 'New equipment rate'}</h1><form data-f="equip"><input type="hidden" name="id" value="${q?.id || ''}">${fld('Equipment name', 'name', q?.name, { req: 1 })}${sel('Type', 'category', EQ_CATS, q?.category)}${sel('City', 'city', CITIES, q?.city || pcity())}${fld('Hire per day (ETB)', 'hire', q?.hire, { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Fuel per day (ETB), if not included', 'fuel', q?.fuel, { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Transport per trip (ETB), optional', 'transport', q?.transport, { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Date verified', 'date', q?.date || todayStr(), { type: 'date', req: 1 })}${fld('Source', 'source', q?.source)}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
const compForm = (itemId, i) => {
  const c = i != null ? raOf(itemId).components[i] : {}; const city = pcity();
  const opts = [['', 'Manual rate (type below)'], ...mats().map(m => ['material:' + m.id, `Material · ${m.name} (per ${m.unit})`]), ...labs().filter(l => l.city === city).map(l => ['labour:' + l.id, `Labour · ${l.category} (${money(l.daily)}/day)`]), ...eqs().filter(q => q.city === city).map(q => ['equipment:' + q.id, `Equipment · ${q.name} (${money(Number(q.hire) + (Number(q.fuel) || 0))}/day)`])];
  return `<h1>${i != null ? 'Edit component' : 'New component'}</h1><form data-f="comp"><input type="hidden" name="itemId" value="${itemId}"><input type="hidden" name="i" value="${i ?? ''}">
  ${fld('Name', 'name', c.name, { req: 1 })}${sel('Type', 'type', COMP_TYPES, c.type || 'material')}${sel('Price source', 'ref', opts, c.refId ? c.type + ':' + c.refId : '')}
  ${fld('Quantity needed per 1 unit of the BOQ item (your coefficient; days for labour/equipment)', 'qty', c.qty, { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}
  ${fld('Waste % on this component (0 = none)', 'wastePct', c.wastePct ?? 0, { type: 'number', attrs: 'min="0" max="100" step="any" inputmode="decimal"' })}
  ${fld('Manual rate (ETB per unit); required for transport/other, optional override for others', 'manualRate', c.manualRate ?? '', { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}
  ${fld('Unit label for manual rates (e.g. trip, m³)', 'unit', c.unit)}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
};
const settingsForm = () => { const s = settings(); return `<h1>Pricing settings</h1><form data-f="pricing">${sel('Pricing method', 'method', Object.entries(METHODS), s.method)}${sel('Supplier (for “Selected supplier”)', 'supplierId', [['', '—'], ...sups().map(x => [x.id, x.name])], s.supplierId || '')}
  <p class="small muted">Set these to your contract and the applicable regulations. They start at 0 and are not pre-filled.</p>
  ${fld('Overhead %', 'oh', s.oh, { type: 'number', attrs: 'min="0" step="any"' })}${fld('Profit %', 'profit', s.profit, { type: 'number', attrs: 'min="0" step="any"' })}${fld('Contingency %', 'cont', s.cont, { type: 'number', attrs: 'min="0" step="any"' })}${fld('Tax % (as applicable)', 'tax', s.tax, { type: 'number', attrs: 'min="0" step="any"' })}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`; };

// ---------- handlers ----------
const need = () => { if (!canP()) throw new Error('Your role cannot edit prices.'); };
const reqNum = (v, label, allowBlank) => { if (v === '' || v == null) { if (allowBlank) return null; throw new Error(label + ' is required.'); } const n = Number(v); if (!isFinite(n) || n < 0) throw new Error(label + ' must be a positive number.'); return n; };
F.material = async d => { need(); if (!trim(d.name)) throw new Error('Name is required.'); const old = d.id ? S.materials.find(x => x.id === d.id) : null; await save('materials', { ...(old || {}), id: d.id || undefined, projectId: S.pid, name: trim(d.name), category: d.category, spec: trim(d.spec), brand: trim(d.brand), unit: d.unit }, `${old ? 'Edited' : 'Added'} material ${trim(d.name)}`); };
F.supplier = async d => { need(); if (!trim(d.name)) throw new Error('Name is required.'); const old = d.id ? S.suppliers.find(x => x.id === d.id) : null; await save('suppliers', { ...(old || {}), id: d.id || undefined, projectId: S.pid, name: trim(d.name), city: d.city, phone: trim(d.phone) }, `${old ? 'Edited' : 'Added'} supplier ${trim(d.name)}`); };
F.quote = async d => {
  need(); const price = reqNum(d.price, 'Price'); const del = reqNum(d.delivery, 'Delivery cost', true) ?? 0; const vd = reqNum(d.validDays, 'Validity');
  if (!d.date) throw new Error('Date is required.'); if (d.date > todayStr()) throw new Error('Quotation date cannot be in the future.');
  if (d.verified && d.source !== 'supplier_quote') throw new Error('Only a supplier quotation can be marked verified. Change the source or untick the box.');
  const old = d.id ? S.quotes.find(x => x.id === d.id) : null; const m = S.materials.find(x => x.id === d.materialId);
  await save('quotes', { ...(old || {}), id: d.id || undefined, projectId: S.pid, materialId: d.materialId, supplierId: d.supplierId, city: d.city, price, delivery: del, date: d.date, validDays: vd, source: d.source, verified: !!d.verified, verifiedBy: d.verified ? S.user.id : null, leadDays: trim(d.leadDays), terms: trim(d.terms), note: trim(d.note) }, `${old ? 'Edited' : 'Added'} quotation for ${m?.name}`);
};
F.labour = async d => { need(); const daily = reqNum(d.daily, 'Daily rate'); const old = d.id ? S.labourrates.find(x => x.id === d.id) : null; await save('labourrates', { ...(old || {}), id: d.id || undefined, projectId: S.pid, category: d.category, skill: trim(d.skill), city: d.city, daily, hourly: reqNum(d.hourly, 'Hourly rate', true), productivity: trim(d.productivity), date: d.date, source: trim(d.source) }, `${old ? 'Edited' : 'Added'} labour rate ${d.category}`); };
F.equip = async d => { need(); if (!trim(d.name)) throw new Error('Name is required.'); const hire = reqNum(d.hire, 'Hire rate'); const old = d.id ? S.equiprates.find(x => x.id === d.id) : null; await save('equiprates', { ...(old || {}), id: d.id || undefined, projectId: S.pid, name: trim(d.name), category: d.category, city: d.city, hire, fuel: reqNum(d.fuel, 'Fuel', true), transport: reqNum(d.transport, 'Transport', true), date: d.date, source: trim(d.source) }, `${old ? 'Edited' : 'Added'} equipment rate ${trim(d.name)}`); };
F.pricing = async d => {
  need(); const o = {}; for (const k of ['oh', 'profit', 'cont', 'tax']) { const n = reqNum(d[k], k, true) ?? 0; if (n > 100) throw new Error('Percentages must be between 0 and 100.'); o[k] = n; }
  if (d.method === 'selected' && !d.supplierId) throw new Error('Choose the supplier for the “Selected supplier” method.');
  const old = S.pricing.find(x => x.id === S.pid); await save('pricing', { ...(old || {}), id: S.pid, projectId: S.pid, method: d.method, supplierId: d.supplierId, ...o, configured: true }, 'Changed pricing settings');
};
F.comp = async d => {
  need(); if (!trim(d.name)) throw new Error('Name is required.');
  const [kind, refId] = d.ref ? d.ref.split(':') : ['', '']; if (kind && kind !== d.type) throw new Error(`The price source is a ${kind} item but the type is ${d.type}. Make them match.`);
  const manual = reqNum(d.manualRate, 'Manual rate', true); if (!kind && manual == null) throw new Error('Choose a price source or type a manual rate.');
  const qty = reqNum(d.qty, 'Quantity'); const w = reqNum(d.wastePct, 'Waste', true) ?? 0; if (w > 100) throw new Error('Waste must be 0–100%.');
  const comp = { name: trim(d.name), type: d.type, refId: refId || '', qty, wastePct: w, manualRate: manual == null ? '' : manual, unit: trim(d.unit) };
  const old = raOf(d.itemId); const comps = [...(old?.components || [])]; if (d.i !== '') comps[Number(d.i)] = comp; else comps.push(comp);
  await save('rates', { ...(old || {}), id: d.itemId, projectId: S.pid, components: comps }, `Updated rate analysis for ${S.boqitems.find(x => x.id === d.itemId)?.code}`);
};
F.import = async d => {
  need(); const rows = parseCsv(String(d.text || '')); if (rows.length < 2) throw new Error('Paste a CSV with a header row and at least one data row.');
  const h = rows[0].map(x => x.trim().toLowerCase()); const col = n => h.indexOf(n);
  for (const n of ['material', 'unit', 'supplier', 'price', 'date', 'valid_days']) if (col(n) < 0) throw new Error('Missing column: ' + n);
  const out = []; const errs = [];
  rows.slice(1).forEach((r, i) => {
    const g = n => col(n) >= 0 ? trim(r[col(n)]) : ''; const line = i + 2;
    const price = Number(g('price')), del = g('delivery') === '' ? 0 : Number(g('delivery')), vd = Number(g('valid_days'));
    if (!g('material') || !g('supplier')) errs.push(`Row ${line}: material and supplier are required`);
    else if (!isFinite(price) || price < 0 || g('price') === '') errs.push(`Row ${line}: bad price`);
    else if (!isFinite(del) || del < 0) errs.push(`Row ${line}: bad delivery`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(g('date')) || g('date') > todayStr()) errs.push(`Row ${line}: date must be YYYY-MM-DD and not in the future`);
    else if (!isFinite(vd) || vd < 0 || g('valid_days') === '') errs.push(`Row ${line}: bad valid_days`);
    else if (!MUNITS.includes(g('unit'))) errs.push(`Row ${line}: unit must be one of ${MUNITS.join(', ')}`);
    else out.push({ material: g('material'), unit: g('unit'), category: MAT_CATS.includes(g('category')) ? g('category') : 'Other', supplier: g('supplier'), price, del, date: g('date'), vd });
  });
  if (errs.length) throw new Error(errs.slice(0, 4).join('; ') + (errs.length > 4 ? ` (+${errs.length - 4} more)` : '') + '. Nothing was imported.');
  const mcache = {}, scache = {}; let nm = 0, ns = 0;
  for (const r of out) {
    const mk = r.material.toLowerCase() + '|' + r.unit; let m = mcache[mk] || mats().find(x => x.name.toLowerCase() === r.material.toLowerCase() && x.unit === r.unit);
    if (!m) { m = await save('materials', { projectId: S.pid, name: r.material, category: r.category, spec: '', brand: '', unit: r.unit }, 'Imported material ' + r.material); S.materials.push(m); nm++; } mcache[mk] = m;
    let s = scache[r.supplier.toLowerCase()] || sups().find(x => x.name.toLowerCase() === r.supplier.toLowerCase());
    if (!s) { s = await save('suppliers', { projectId: S.pid, name: r.supplier, city: pcity(), phone: '' }, 'Imported supplier ' + r.supplier); S.suppliers.push(s); ns++; } scache[r.supplier.toLowerCase()] = s;
    const q = await save('quotes', { projectId: S.pid, materialId: m.id, supplierId: s.id, city: pcity(), price: r.price, delivery: r.del, date: r.date, validDays: r.vd, source: 'user', verified: false, leadDays: '', terms: '', note: 'Imported from CSV' }, `Imported quotation for ${r.material}`); S.quotes.push(q);
  }
  toast(`Imported ${out.length} price(s), ${nm} new material(s), ${ns} new supplier(s). Review and mark verified where appropriate.`);
};

Object.assign(A, {
  'new-material': () => openSheet(materialForm()), 'edit-material': id => openSheet(materialForm(S.materials.find(x => x.id === id))),
  'new-supplier': () => openSheet(supplierForm()), 'edit-supplier': id => openSheet(supplierForm(S.suppliers.find(x => x.id === id))),
  'new-quote': id => openSheet(quoteForm(null, id)), 'edit-quote': id => openSheet(quoteForm(S.quotes.find(x => x.id === id))),
  'new-labour': () => openSheet(labourForm()), 'edit-labour': id => openSheet(labourForm(S.labourrates.find(x => x.id === id))),
  'new-equip': () => openSheet(equipForm()), 'edit-equip': id => openSheet(equipForm(S.equiprates.find(x => x.id === id))),
  'new-comp': id => openSheet(compForm(id)), 'edit-comp': (id, el) => openSheet(compForm(id, Number(el?.dataset.i))),
  'pricing-settings': () => openSheet(settingsForm()),
  'import-prices'() { need(); openSheet(`<h1>Import prices (CSV)</h1><p class="small muted">In Excel use Save As → CSV, then paste the text. Columns: <code>material,unit,category,supplier,price,delivery,date,valid_days</code>. Date is YYYY-MM-DD. Prices apply to ${esc(pcity())} and are imported as “Entered by user”, not verified.</p><form data-f="import"><label>CSV text<textarea name="text" rows="8" placeholder="material,unit,category,supplier,price,delivery,date,valid_days"></textarea></label><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Import</button></div></form>`); },
  async 'del-quote'(id) { need(); const q = S.quotes.find(x => x.id === id); if (!confirm('Delete this quotation record?')) return; await save('quotes', { ...q, deleted: true }, 'Deleted quotation'); await render(); },
  async 'del-material'(id) { need(); const m = S.materials.find(x => x.id === id); if (!confirm(`Delete ${m.name}? Rate analyses using it will show an error.`)) return; await save('materials', { ...m, deleted: true }, 'Deleted material ' + m.name); location.hash = '#/suppliers/materials'; await render(); },
  async 'del-rate'(id, el) { need(); const s = el.dataset.s; const r = S[s].find(x => x.id === id); if (!confirm('Delete this rate?')) return; await save(s, { ...r, deleted: true }, 'Deleted rate'); await render(); },
  async 'del-comp'(id, el) { need(); if (!confirm('Remove this component?')) return; const ra = raOf(id); const comps = ra.components.filter((_, k) => k !== Number(el.dataset.i)); await save('rates', { ...ra, components: comps }, 'Removed rate component'); await render(); },
  'export-estimate'() {
    const E = estimate(); const L = [['Section', 'Code', 'Description', 'Unit', 'Net quantity', 'Direct unit rate', 'Unit rate', 'Total', 'Status', 'Pricing method'].map(csvCell).join(',')];
    for (const r of E.rows) L.push([r.it.section, r.it.code, r.it.description, r.it.unit, r.c.ok ? Math.round(r.c.net * 1e4) / 1e4 : '', r.m ? r.m.direct.toFixed(2) : '', r.m ? r.m.total.toFixed(2) : '', r.total != null ? r.total.toFixed(2) : '', r.status, METHODS[E.st.method]].map((v, k) => k >= 4 && k <= 7 && v !== '' ? String(v) : csvCell(v)).join(','));
    L.push('', ['', '', 'TOTAL (priced items only)', '', '', '', '', E.tot.total.toFixed(2), 'ESTIMATE - not an approved budget', ''].map(csvCell).join(',')); download(`cost-estimate-${todayStr()}.csv`, L.join('\r\n'));
  },
  'export-schedule'() {
    const E = estimate(); const L = [['Material', 'Category', 'Unit', 'Required quantity', 'Estimated cost'].map(csvCell).join(',')];
    for (const [id, s] of Object.entries(E.sched)) { const m = S.materials.find(x => x.id === id); if (m) L.push([csvCell(m.name), csvCell(m.category), csvCell(m.unit), (Math.round(s.qty * 1e3) / 1e3), s.cost.toFixed(2)].join(',')); }
    download(`material-schedule-${todayStr()}.csv`, L.join('\r\n'));
  }
});
// action dispatcher passes only the id; give actions that need the element access to it
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el) window.__lastEl = el; }, true);
for (const k of ['edit-comp', 'del-rate', 'del-comp']) { const f = A[k]; A[k] = id => f(id, window.__lastEl); }

// ---------- registration ----------
ROUTES.suppliers = viewPrices; ROUTES.material = viewMaterial; ROUTES.cost = viewCost; ROUTES.rate = viewRate;
Object.assign(SECTIONS.find(s => s.k === 'suppliers'), { live: true, n: 'Suppliers & Prices' });
Object.assign(SECTIONS.find(s => s.k === 'cost'), { live: true });
DASH_EXT.cost = () => { if (!can('boq')) return ''; const E = estimate(); return `<a class="card" style="display:block" href="#/cost"><b>Cost estimate</b><div class="muted small">${money(E.tot.total)} ETB (${E.priced}/${E.rows.length} items priced) · not an approved budget</div></a>`; };
