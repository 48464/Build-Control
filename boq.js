'use strict';
/* Phase 2 — drawings, measurements and the transparent BOQ / quantity takeoff engine.
   Nothing here guesses a dimension, a price or a waste allowance: every number is entered by a person,
   every formula is shown, and an item is only "Verified" when its inputs are confirmed. */

const DRAWING_TYPES = ['Architectural floor plan', 'Foundation plan', 'Structural – column layout', 'Structural – beam layout', 'Slab plan', 'Roof plan', 'Elevation', 'Building section', 'Electrical drawing', 'Plumbing drawing', 'Site plan', 'Other'];
const TAKEOFF_SET = ['Architectural floor plan', 'Foundation plan', 'Structural – column layout', 'Structural – beam layout', 'Slab plan', 'Roof plan', 'Elevation', 'Building section'];
const BOQ_SECTIONS = [['A', 'Preliminary works'], ['B', 'Earthworks'], ['C', 'Foundation and substructure'], ['D', 'Structural works'], ['E', 'Masonry'], ['F', 'Roofing'], ['G', 'Doors and windows'], ['H', 'Plastering and finishing'], ['I', 'Electrical installations'], ['J', 'Plumbing and sanitation'], ['K', 'External works']];
const UNITS = ['m', 'm²', 'm³', 'kg', 't', 'nr', 'LS'];
const SOURCES = { written: 'Written dimension on drawing', cad: 'CAD / BIM data', scaled: 'Scaled from drawing (uncertain)', estimate: 'Estimate (uncertain)' };
const UNCERTAIN = ['scaled', 'estimate'];
const MAX_FILE = 30 * 1024 * 1024;
const TEMPLATES = [
  { n: 'Excavation volume (L × W × D)', sec: 'B', unit: 'm³', expr: 'L*W*D', vars: ['L', 'W', 'D'], desc: 'Excavation' },
  { n: 'Concrete volume (L × W × H)', sec: 'C', unit: 'm³', expr: 'L*W*H', vars: ['L', 'W', 'H'], desc: 'Concrete' },
  { n: 'Floor finish area (L × W)', sec: 'H', unit: 'm²', expr: 'L*W', vars: ['L', 'W'], desc: 'Floor finish' },
  { n: 'Masonry wall: gross area less openings', sec: 'E', unit: 'm²', expr: 'L*H', vars: ['L', 'H', 'ND', 'DA', 'NW', 'WA'], deds: [['Door openings', 'ND*DA'], ['Window openings', 'NW*WA']], desc: 'Masonry wall' },
  { n: 'Plaster (net wall area × plastered faces)', sec: 'H', unit: 'm²', expr: 'NetWall*Faces', vars: ['NetWall', 'Faces'], desc: 'Plaster' },
  { n: 'Reinforcement by verified schedule', sec: 'D', unit: 'kg', expr: 'Len*Nr*Mass', vars: ['Len', 'Nr', 'Mass'], desc: 'Reinforcement', hint: 'Take bar lengths and numbers from the verified reinforcement schedule. Mass per metre comes from the steel specification; it is not pre-filled.' },
  { n: 'Roof covering area (length × slope length)', sec: 'F', unit: 'm²', expr: 'L*S', vars: ['L', 'S'], desc: 'Roof covering', hint: 'Use actual roof geometry: slope length and overhangs from the roof plan and section.' },
  { n: 'Counted item (number)', sec: 'G', unit: 'nr', expr: 'N', vars: ['N'], desc: '' },
  { n: 'Lump sum', sec: 'A', unit: 'LS', expr: '1', vars: [], desc: '' },
  { n: 'Blank item', sec: 'A', unit: 'm²', expr: '', vars: [], desc: '' }
];

const pDrawings = () => S.drawings.filter(d => d.projectId === S.pid && !d.deleted);
const pMeas = () => S.measurements.filter(m => m.projectId === S.pid && !m.deleted);
const pItems = () => S.boqitems.filter(i => i.projectId === S.pid && !i.deleted);
const pRevs = () => S.boqrevs.filter(r => r.projectId === S.pid).sort((a, b) => a.rev - b.rev);
const canMeasure = () => can('drawings', 'e') || can('boq', 'e');
const fmt = n => n == null || !isFinite(n) ? '—' : (Math.round(n * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 });
const dkey = d => d.name.trim().toLowerCase() + '|' + d.type;
const latestRev = d => Math.max(...S.drawings.filter(x => x.projectId === d.projectId && !x.deleted && dkey(x) === dkey(d)).map(x => x.rev));
const fsize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
let URLS = [];
const revokeUrls = () => { URLS.forEach(u => URL.revokeObjectURL(u)); URLS = []; };

// ---------- safe arithmetic evaluator (no eval) ----------
function evalExpr(src, vars) {
  const s = String(src ?? ''); const toks = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; const t = s.slice(i, j); const n = Number(t); if (t.split('.').length > 2 || !isFinite(n)) throw new Error('Bad number "' + t + '"'); toks.push({ t: 'n', v: n }); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; toks.push({ t: 'v', v: s.slice(i, j) }); i = j; continue; }
    if ('+-*/()'.includes(c)) { toks.push({ t: c }); i++; continue; }
    if (c === '×') { toks.push({ t: '*' }); i++; continue; }
    if (c === '÷') { toks.push({ t: '/' }); i++; continue; }
    throw new Error('Unexpected "' + c + '"');
  }
  let p = 0; const peek = () => toks[p]?.t;
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const o = toks[p++].t; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = unary(); while (peek() === '*' || peek() === '/') { const o = toks[p++].t; const r = unary(); if (o === '/' && r === 0) throw new Error('Division by zero'); v = o === '*' ? v * r : v / r; } return v; };
  const unary = () => { if (peek() === '-') { p++; return -unary(); } if (peek() === '+') { p++; return unary(); } return atom(); };
  const atom = () => {
    const k = toks[p++]; if (!k) throw new Error('Formula ends unexpectedly');
    if (k.t === 'n') return k.v;
    if (k.t === 'v') { if (!(k.v in vars)) throw new Error('Unknown variable "' + k.v + '"'); const x = vars[k.v]; if (x == null || !isFinite(x)) throw new Error('Variable "' + k.v + '" has no value'); return x; }
    if (k.t === '(') { const v = expr(); if (toks[p++]?.t !== ')') throw new Error('Missing )'); return v; }
    throw new Error('Unexpected "' + k.t + '"');
  };
  const v = expr(); if (p < toks.length) throw new Error('Unexpected "' + toks[p].t + '" in formula'); return v;
}

// ---------- item calculation ----------
function resolveVars(it) {
  const vars = {}, info = [];
  for (const v of it.vars || []) {
    if (!v.name) continue;
    if (v.measId) {
      const m = S.measurements.find(x => x.id === v.measId && !x.deleted);
      if (!m) { vars[v.name] = NaN; info.push({ name: v.name, value: null, problem: 'Linked measurement was removed' }); continue; }
      const d = S.drawings.find(x => x.id === m.drawingId);
      const stale = d ? d.rev < latestRev(d) : false;
      vars[v.name] = m.value;
      info.push({ name: v.name, value: m.value, unit: m.unit, label: m.label, measId: m.id, confirmed: m.status === 'confirmed', stale, rev: d?.rev, latest: d ? latestRev(d) : null });
    } else {
      const n = v.value === '' || v.value == null ? NaN : Number(v.value);
      vars[v.name] = n; info.push({ name: v.name, value: n, manual: true });
    }
  }
  return { vars, info };
}
function calcItem(it) {
  const out = { ok: false, issues: [], attention: [], gross: 0, deds: [], dedTotal: 0, net: 0, waste: 0, proc: 0 };
  const { vars, info } = resolveVars(it); out.info = info; out.vars = vars;
  for (const i of info) {
    if (i.problem) out.issues.push(i.problem + ' (' + i.name + ')');
    else if (i.manual && !isFinite(i.value)) out.issues.push('Variable "' + i.name + '" has no value yet');
    else if (!i.manual && !i.confirmed) out.attention.push('"' + i.label + '" is not confirmed');
    if (i.stale) out.attention.push('"' + i.label + '" is from drawing Rev ' + i.rev + ' but Rev ' + i.latest + ' exists');
  }
  try { out.gross = evalExpr(it.expr, vars); } catch (e) { out.issues.push(e.message); }
  for (const d of it.deds || []) {
    try { const v = evalExpr(d.expr, vars); out.deds.push({ label: d.label, expr: d.expr, val: v }); out.dedTotal += v; }
    catch (e) { out.issues.push('Deduction "' + d.label + '": ' + e.message); }
  }
  out.net = out.gross - out.dedTotal;
  if (out.issues.length === 0 && out.net < 0) out.issues.push('Deductions exceed the gross quantity');
  out.waste = out.net * ((Number(it.wastePct) || 0) / 100); out.proc = out.net + out.waste;
  out.ok = out.issues.length === 0;
  out.sig = JSON.stringify([it.unit, it.expr, it.deds, Number(it.wastePct) || 0, info.map(i => [i.name, i.value])]);
  return out;
}
function itemStatus(it, c) { if (!c.ok) return 'Error'; if (c.attention.length) return 'Needs confirmation'; return it.verifiedSig === c.sig ? 'Verified' : 'Draft'; }
const chipCls = st => ({ Error: 'Critical', 'Needs confirmation': 'High', Draft: 'Low', Verified: 'Completed' }[st] || 'Low');
const snapItem = (it, c) => ({ id: it.id, code: it.code, section: it.section, description: it.description, unit: it.unit, drawingRef: it.drawingRef, expr: it.expr, vars: c.info.map(i => ({ name: i.name, value: i.value, unit: i.unit, source: i.manual ? 'manual' : i.label })), deds: c.deds, gross: c.gross, dedTotal: c.dedTotal, net: c.net, wastePct: Number(it.wastePct) || 0, waste: c.waste, proc: c.proc });
function diffItems(prev, cur) {
  const pm = new Map(prev.map(x => [x.id, x])), cm = new Map(cur.map(x => [x.id, x]));
  return {
    added: cur.filter(x => !pm.has(x.id)), removed: prev.filter(x => !cm.has(x.id)),
    changed: cur.filter(x => pm.has(x.id) && (Math.abs(pm.get(x.id).net - x.net) > 1e-9 || Math.abs(pm.get(x.id).proc - x.proc) > 1e-9 || pm.get(x.id).unit !== x.unit))
  };
}
const sortItems = a => [...a].sort((x, y) => (x.section || '').localeCompare(y.section || '') || (parseInt((x.code || '').split('.')[1]) || 0) - (parseInt((y.code || '').split('.')[1]) || 0));
const nextCode = sec => { const n = Math.max(0, ...pItems().filter(i => i.section === sec).map(i => parseInt((i.code || '').split('.')[1]) || 0)); return `${sec}.${n + 1}`; };
function substituted(expr, vars) { return String(expr).replace(/[A-Za-z_][A-Za-z0-9_]*/g, n => n in vars && isFinite(vars[n]) ? fmt(vars[n]) : n); }

// ---------- views: drawings ----------
function viewDrawings() {
  if (!curProject()) return emptyProject(); if (!can('drawings')) return locked();
  const ds = pDrawings(); const groups = {};
  ds.forEach(d => (groups[dkey(d)] = groups[dkey(d)] || []).push(d));
  const current = Object.values(groups).map(g => g.sort((a, b) => b.rev - a.rev)[0]).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const have = new Set(current.map(d => d.type));
  const ms = pMeas(); const needs = ms.filter(m => m.status !== 'confirmed').length;
  return `<div class="row"><h1>Design & Drawings</h1>${can('drawings', 'e') ? `<button class="primary" data-a="new-drawing">+ Upload</button>` : ''}</div>
  <div class="card small"><b>Typical set for quantity takeoff</b> <span class="muted">(a working checklist, not a legal requirement)</span><br>
  ${TAKEOFF_SET.map(t => `${have.has(t) ? '✅' : '⬜'} ${esc(t)}`).join('<br>')}</div>
  <div class="card small">Measurements: ${ms.length} · <b>${needs}</b> need confirmation. Automatic reading of drawings is not built yet: you enter dimensions from the written values on the drawing, and each one stays "Needs confirmation" until checked.</div>
  ${current.length ? current.map(d => { const mm = ms.filter(m => m.drawingId === d.id); const older = groups[dkey(d)].length - 1; return `<a class="card" style="display:block" href="#/drawing/${d.id}"><div class="row"><strong>${esc(d.name)}</strong><span class="badge">Rev ${d.rev}</span></div><div class="muted small">${esc(d.type)} · ${esc(d.fileName)} · ${fsize(d.size)}${d.scale ? ' · scale ' + esc(d.scale) : ''}</div><div class="small">${mm.length} measurement(s), ${mm.filter(m => m.status !== 'confirmed').length} unconfirmed${older ? ` · ${older} older revision(s) kept` : ''}</div></a>`; }).join('') : '<p class="muted">No drawings uploaded yet.</p>'}`;
}

async function viewDrawing(id) {
  revokeUrls();
  const d = S.drawings.find(x => x.id === id && x.projectId === S.pid && !x.deleted);
  if (!d) return `<div class="card">Drawing not found in this project.</div>`; if (!can('drawings')) return locked();
  const f = await dbGet('files', id); let url = ''; if (f?.blob) { url = URL.createObjectURL(f.blob); URLS.push(url); }
  const rel = pDrawings().filter(x => dkey(x) === dkey(d)).sort((a, b) => b.rev - a.rev); const latest = rel[0];
  const ms = pMeas().filter(m => m.drawingId === id); const un = ms.filter(m => m.status !== 'confirmed').length;
  const preview = !url ? `<p class="small muted">The file is not on this device (backups do not include drawing files yet).</p>`
    : d.mime?.startsWith('image/') ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(d.name)}" style="width:100%;border-radius:10px"></a><p class="small muted">Tap the image to open full size.</p>`
      : `<p class="small muted">${/pdf/.test(d.mime || '') ? 'PDF' : 'CAD / BIM files'} are stored safely but not previewed in the app yet.</p>`;
  const checks = [[!!d.scale, 'Drawing scale recorded'], [ms.length > 0, 'At least one measurement entered'], [ms.length > 0 && un === 0, 'All measurements confirmed'], [latest.id === d.id, 'This is the latest revision']];
  return `<a href="#/drawings" class="small muted">← Drawings</a><h1>${esc(d.name)} · Rev ${d.rev}</h1>
  ${latest.id !== d.id ? `<div class="card err">Superseded by Rev ${latest.rev}. Values measured here may be outdated; BOQ items linked to them will ask for re-confirmation.</div>` : ''}
  <div class="card">${preview}<div class="row" style="justify-content:flex-start">${url ? `<a class="btn sm" href="${url}" ${/pdf/.test(d.mime || '') ? 'target="_blank" rel="noopener"' : `download="${esc(d.fileName)}"`}>${/pdf/.test(d.mime || '') ? 'Open PDF' : 'Download'}</a>` : ''}</div>
  <div class="small muted" style="margin-top:6px">${esc(d.type)} · ${esc(d.fileName)} · ${fsize(d.size)}<br>Scale: ${esc(d.scale || 'not recorded')} · Uploaded ${esc((d.createdAt || '').slice(0, 10))} by ${esc(userName(d.uploadedBy))}${d.reason ? '<br>Reason: ' + esc(d.reason) : ''}</div></div>
  <div class="card small"><b>Drawing check</b><br>${checks.map(([ok, t]) => `${ok ? '✅' : '⬜'} ${t}`).join('<br>')}</div>
  <div class="row"><h2>Measurements</h2>${canMeasure() && latest.id === d.id ? `<button class="sm primary" data-a="new-meas" data-id="${id}">+ Measurement</button>` : ''}</div>
  ${ms.length ? ms.map(m => `<div class="card"><div class="row"><b>${esc(m.label)}</b><span class="chip ${m.status === 'confirmed' ? 'Completed' : 'High'}">${m.status === 'confirmed' ? 'Confirmed' : 'Needs confirmation'}</span></div>
    <div>${fmt(m.value)} ${esc(m.unit)}</div><div class="muted small">${esc(SOURCES[m.source] || m.source)}${m.ref ? ' · ' + esc(m.ref) : ''}${m.note ? '<br>' + esc(m.note) : ''}${m.status === 'confirmed' ? `<br>Confirmed by ${esc(userName(m.confirmedBy))} on ${esc((m.confirmedAt || '').slice(0, 10))}` : ''}</div>
    ${canMeasure() ? `<div class="row" style="margin-top:8px;justify-content:flex-start"><button class="sm" data-a="edit-meas" data-id="${m.id}">Edit</button>${m.status !== 'confirmed' ? `<button class="sm primary" data-a="confirm-meas" data-id="${m.id}">Confirm</button>` : ''}<button class="sm danger" data-a="del-meas" data-id="${m.id}">Delete</button></div>` : ''}</div>`).join('') : '<p class="muted small">No measurements yet.</p>'}
  <h2>Revisions of this drawing</h2>${rel.map(r => `<a class="card small" style="display:block" href="#/drawing/${r.id}">Rev ${r.rev} · ${esc((r.createdAt || '').slice(0, 10))} · ${esc(r.reason || 'First upload')}${r.id === id ? ' · (viewing)' : ''}</a>`).join('')}
  ${can('drawings', 'e') ? `<p class="small muted">To add a revision, upload with the same name and type. Older revisions are never overwritten.</p>` : ''}`;
}

const drawingForm = () => `<h1>Upload drawing</h1><form data-f="drawing">
  <label>File (PDF, JPG, PNG, DXF, DWG, IFC; up to 30 MB)<input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.dxf,.dwg,.ifc,image/*,application/pdf"></label>
  ${fld('Drawing name (same name + type = new revision)', 'name')}${sel('Drawing type', 'type', DRAWING_TYPES, '')}
  ${fld('Scale shown on drawing (e.g. 1:100)', 'scale')}${fld('Reason for revision (required for revisions)', 'reason')}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Upload</button></div></form>`;

const measForm = (m, drawingId) => `<h1>${m ? 'Edit measurement' : 'New measurement'}</h1><form data-f="meas"><input type="hidden" name="id" value="${m?.id || ''}"><input type="hidden" name="drawingId" value="${m?.drawingId || drawingId}">
  ${fld('What is measured (e.g. Building length, ground floor)', 'label', m?.label, { req: 1 })}${fld('Value', 'value', m?.value, { type: 'number', req: 1, attrs: 'step="any" min="0" inputmode="decimal"' })}
  ${sel('Unit', 'unit', UNITS, m?.unit || 'm')}${sel('Where did the value come from?', 'source', Object.entries(SOURCES), m?.source || 'written')}
  ${fld('Location on drawing (sheet, grid lines)', 'ref', m?.ref)}${fld('Note', 'note', m?.note)}
  ${chk('I checked this value against the written dimension or the CAD/BIM data', 'checked', m?.status === 'confirmed')}
  <p class="small muted">Scaled or estimated values can't be confirmed when entered. Verify them against a written dimension or on site, then use Confirm.</p>
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;

// ---------- views: BOQ ----------
const varRow = (v, ms) => `<div class="card vr"><div class="row" style="flex-wrap:nowrap"><input name="vname" placeholder="Name, e.g. L" value="${esc(v.name || '')}" style="flex:1;min-width:0" autocapitalize="off" autocomplete="off"><select name="vmeas" style="flex:2;min-width:0"><option value="">Manual value</option>${ms.map(m => `<option value="${m.id}" ${m.id === v.measId ? 'selected' : ''}>${esc(m.label)} (${fmt(m.value)} ${esc(m.unit)}${m.status === 'confirmed' ? '' : ', unconfirmed'})</option>`).join('')}</select></div><input name="vval" type="number" step="any" inputmode="decimal" placeholder="Manual value (used when no measurement is linked)" value="${esc(v.measId ? '' : v.value ?? '')}" style="margin-top:6px"></div>`;
const dedRow = d => `<div class="card vr"><input name="dlabel" placeholder="Deduction, e.g. Door openings" value="${esc(d.label || '')}"><input name="dexpr" placeholder="Formula, e.g. ND*DA" value="${esc(d.expr || '')}" style="margin-top:6px" autocapitalize="off" autocomplete="off"></div>`;

function itemForm(it, tpl) {
  const b = it || { section: tpl.sec, unit: tpl.unit, expr: tpl.expr, description: tpl.desc, vars: tpl.vars.map(n => ({ name: n })), deds: (tpl.deds || []).map(([label, expr]) => ({ label, expr })), wastePct: 0 };
  const ms = pMeas(); const vs = (b.vars || []).length ? b.vars : [{}];
  return `<h1>${it ? 'Edit item' : 'New item'}</h1>${tpl?.hint ? `<p class="small muted">${esc(tpl.hint)}</p>` : ''}
  <form data-f="boqitem"><input type="hidden" name="id" value="${it?.id || ''}">
  ${sel('Work section', 'section', BOQ_SECTIONS.map(([k, n]) => [k, k + ' · ' + n]), b.section)}${fld('Item code (blank = automatic)', 'code', it?.code || '')}
  ${fld('Description', 'description', b.description, { req: 1 })}${sel('Unit', 'unit', UNITS, b.unit)}${fld('Drawing reference (sheet / grid / location)', 'drawingRef', b.drawingRef)}
  ${fld('Formula (uses the variable names below)', 'expr', b.expr, { req: 1, attrs: 'autocapitalize="off" autocomplete="off" spellcheck="false"' })}
  <h2>Variables</h2><p class="small muted">Link a variable to a measurement, or type the value yourself.</p><div id="vars">${vs.map(v => varRow(v, ms)).join('')}</div><button type="button" class="sm" data-x="add-var">+ Variable</button>
  <h2>Deductions</h2><div id="deds">${(b.deds || []).map(dedRow).join('')}</div><button type="button" class="sm" data-x="add-ded">+ Deduction</button>
  <h2>Allowances</h2>${fld('Waste allowance (%). You set it; 0 means none is applied', 'wastePct', b.wastePct ?? 0, { type: 'number', attrs: 'min="0" max="100" step="any" inputmode="decimal"' })}
  <label>Notes<textarea name="notes" rows="2">${esc(b.notes || '')}</textarea></label>
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
}

function viewBoq() {
  if (!curProject()) return emptyProject(); if (!can('boq')) return locked();
  const rows = sortItems(pItems()).map(i => { const c = calcItem(i); return { i, c, st: itemStatus(i, c) }; });
  const revs = pRevs(); const last = revs[revs.length - 1];
  const cnt = s => rows.filter(r => r.st === s).length;
  let drift = '';
  if (last) { const d = diffItems(last.items, rows.filter(r => r.c.ok).map(r => snapItem(r.i, r.c))); drift = `Working draft vs Rev ${last.rev}: ${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed.`; }
  const edit = can('boq', 'e');
  return `<div class="row"><h1>BOQ & Quantity Takeoff</h1>${edit ? `<button class="primary" data-a="new-item">+ Item</button>` : ''}</div>
  <div class="card small"><b>${rows.length}</b> item(s): ${cnt('Verified')} verified · ${cnt('Draft')} draft · ${cnt('Needs confirmation')} need confirmation · ${cnt('Error')} with errors<br>
  ${last ? `Approved revision: <b>Rev ${last.rev}</b> (${esc(last.approvedAt.slice(0, 10))}). ${drift}` : 'No approved revision yet.'}<br><span class="muted">Quantities only. Prices and costs arrive in Phase 3. Displayed values are rounded to 3 decimals.</span>
  <div class="row" style="margin-top:8px;justify-content:flex-start">${edit ? `<button class="sm primary" data-a="approve-boq">Approve revision</button>` : ''}<button class="sm" data-a="export-boq">Export CSV</button></div></div>
  ${BOQ_SECTIONS.map(([k, n]) => { const rs = rows.filter(r => r.i.section === k); return rs.length ? `<h2>${k} · ${n}</h2>${rs.map(({ i, c, st }) => `<a class="card" style="display:block" href="#/boqitem/${i.id}"><div class="row"><b>${esc(i.code)} ${esc(i.description)}</b><span class="chip ${chipCls(st)}">${st}</span></div>${c.ok ? `<div>${fmt(c.net)} ${esc(i.unit)}</div><div class="muted small">To procure: ${fmt(c.proc)} ${esc(i.unit)}${Number(i.wastePct) ? ` (includes ${i.wastePct}% waste)` : ' (no waste allowance)'}</div>` : `<div class="err">${esc(c.issues[0])}</div>`}</a>`).join('')}` : ''; }).join('')}
  ${!rows.length ? '<p class="muted">No items yet. Add one from a template; you enter the values and the app shows every step of the calculation.</p>' : ''}
  <h2>Approved revisions</h2>${revs.length ? [...revs].reverse().map(r => `<div class="card row"><div><b>Rev ${r.rev}</b> · ${esc(r.approvedAt.slice(0, 10))}<div class="muted small">${esc(r.approvedByName)} · ${r.items.length} items${r.reason ? ' · ' + esc(r.reason) : ''}</div></div><button class="sm" data-a="view-rev" data-id="${r.id}">View</button></div>`).join('') : '<p class="muted small">None yet. Approved revisions are permanent snapshots and are never overwritten.</p>'}`;
}

function viewBoqItem(id) {
  const it = S.boqitems.find(x => x.id === id && x.projectId === S.pid && !x.deleted); if (!it) return `<div class="card">Item not found.</div>`; if (!can('boq')) return locked();
  const c = calcItem(it); const st = itemStatus(it, c); const edit = can('boq', 'e');
  return `<a href="#/boq" class="small muted">← BOQ</a><h1>${esc(it.code)} ${esc(it.description)}</h1>
  <div class="card"><div class="row"><span class="chip ${chipCls(st)}">${st}</span><span class="muted small">${esc(it.section)} · ${esc(BOQ_SECTIONS.find(s => s[0] === it.section)?.[1] || '')}</span></div>
  <p class="small">Drawing reference: ${it.drawingRef ? esc(it.drawingRef) : '<span class="err">not recorded</span>'}</p>
  ${c.issues.map(x => `<div class="err">⚠ ${esc(x)}</div>`).join('')}${c.attention.map(x => `<div class="small" style="color:var(--high)">⚠ ${esc(x)}</div>`).join('')}</div>
  <div class="card"><b>Calculation</b>
  <p class="small">Formula: <code>${esc(it.expr)}</code></p>
  <p class="small"><b>Variables</b><br>${c.info.length ? c.info.map(i => `${esc(i.name)} = ${fmt(i.value)}${i.unit ? ' ' + esc(i.unit) : ''} — ${i.manual ? 'typed in by a user' : 'measurement “' + esc(i.label || '') + '” (' + (i.confirmed ? 'confirmed' : 'NOT confirmed') + ')'}`).join('<br>') : 'None'}</p>
  ${c.ok || isFinite(c.gross) && c.gross ? `<p class="small">Gross: ${esc(substituted(it.expr, c.vars))} = <b>${fmt(c.gross)} ${esc(it.unit)}</b></p>` : ''}
  ${c.deds.map(d => `<p class="small">Less ${esc(d.label)}: ${esc(substituted(d.expr, c.vars))} = ${fmt(d.val)} ${esc(it.unit)}</p>`).join('')}
  ${c.ok ? `<p>Net quantity: <b>${fmt(c.net)} ${esc(it.unit)}</b></p><p class="small">Waste allowance: ${Number(it.wastePct) || 0}% (set by a user) = ${fmt(c.waste)} ${esc(it.unit)}<br>Procurement quantity: <b>${fmt(c.proc)} ${esc(it.unit)}</b></p>` : ''}</div>
  <a class="btn" href="#/rate/${id}" style="margin-bottom:12px">Unit rate & cost</a>
  ${it.notes ? `<div class="card small">Notes: ${esc(it.notes)}</div>` : ''}
  ${edit ? `<div class="row" style="justify-content:flex-start"><button data-a="edit-item" data-id="${id}">Edit</button>${st === 'Draft' ? `<button class="primary" data-a="verify-item" data-id="${id}">Mark verified</button>` : ''}<button class="danger" data-a="del-item" data-id="${id}">Delete</button></div><p class="small muted">Verified means a person checked the inputs and the result. Changing any input returns the item to Draft.</p>` : ''}`;
}

// ---------- form handlers ----------
const trim = v => String(v ?? '').trim();
F.drawing = async d => {
  if (!can('drawings', 'e')) throw new Error('Your role cannot upload drawings.');
  const file = d.file; if (!file || !file.size) throw new Error('Choose a file.'); if (file.size > MAX_FILE) throw new Error('File is larger than 30 MB.');
  const name = trim(d.name) || file.name.replace(/\.[^.]+$/, ''); const type = d.type || 'Other';
  const same = pDrawings().filter(x => dkey(x) === name.toLowerCase() + '|' + type); const rev = same.length ? Math.max(...same.map(x => x.rev)) + 1 : 1;
  if (rev > 1 && !trim(d.reason)) throw new Error('Give the reason for this revision.');
  const id = uid(); await dbPut('files', { id, blob: file });
  await save('drawings', { id, projectId: S.pid, name, type, rev, reason: trim(d.reason), scale: trim(d.scale), fileName: file.name, mime: file.type || '', size: file.size, uploadedBy: S.user.id }, `Uploaded drawing ${name} Rev ${rev}`);
  if (rev > 1) toast('New revision saved. Re-check measurements and linked BOQ items.');
};
F.meas = async d => {
  if (!canMeasure()) throw new Error('Your role cannot record measurements.');
  if (!trim(d.label)) throw new Error('Describe what is measured.');
  const value = Number(d.value); if (d.value === '' || !isFinite(value) || value < 0) throw new Error('Enter a valid positive value.');
  const old = d.id ? S.measurements.find(m => m.id === d.id) : null;
  let status = old ? old.status : 'needs';
  if (old && (old.value !== value || old.unit !== d.unit || old.source !== d.source)) status = 'needs';
  const uncertain = UNCERTAIN.includes(d.source);
  if (d.checked && uncertain) throw new Error('Scaled or estimated values cannot be confirmed on entry. Save it, verify against a written dimension or on site, then press Confirm.');
  const rec = { ...(old || {}), id: d.id || undefined, projectId: S.pid, drawingId: d.drawingId, label: trim(d.label), value, unit: d.unit, source: d.source, ref: trim(d.ref), note: trim(d.note) };
  if (d.checked && !uncertain) { status = 'confirmed'; rec.confirmedBy = S.user.id; rec.confirmedAt = new Date().toISOString(); }
  else if (!d.checked && status === 'confirmed') status = 'needs';
  if (status !== 'confirmed') { rec.confirmedBy = null; rec.confirmedAt = null; }
  rec.status = status;
  await save('measurements', rec, `${old ? 'Edited' : 'Recorded'} measurement ${rec.label}`);
};
F.boqitem = async (d, form) => {
  if (!can('boq', 'e')) throw new Error('Your role cannot edit the BOQ.');
  const fd = new FormData(form); const names = fd.getAll('vname'), meas = fd.getAll('vmeas'), vals = fd.getAll('vval');
  const vars = [];
  names.forEach((n, i) => { n = trim(n); if (!n && !meas[i] && vals[i] === '') return; if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error('Variable names use letters, digits and _ only, and must not start with a digit.'); vars.push({ name: n, measId: meas[i] || null, value: meas[i] ? null : vals[i] }); });
  if (new Set(vars.map(v => v.name)).size !== vars.length) throw new Error('Two variables have the same name.');
  const dl = fd.getAll('dlabel'), de = fd.getAll('dexpr'); const deds = [];
  dl.forEach((l, i) => { l = trim(l); const e = trim(de[i]); if (!l && !e) return; if (!l || !e) throw new Error('Each deduction needs a label and a formula.'); deds.push({ label: l, expr: e }); });
  const probe = Object.fromEntries(vars.map(v => [v.name, 1]));
  try { evalExpr(d.expr, probe); } catch (e) { throw new Error('Formula: ' + e.message); }
  for (const x of deds) { try { evalExpr(x.expr, probe); } catch (e) { throw new Error('Deduction "' + x.label + '": ' + e.message); } }
  const waste = d.wastePct === '' ? 0 : Number(d.wastePct); if (!(waste >= 0 && waste <= 100)) throw new Error('Waste allowance must be between 0 and 100%.');
  const old = d.id ? S.boqitems.find(i => i.id === d.id) : null;
  const rec = { ...(old || {}), id: d.id || undefined, projectId: S.pid, section: d.section, code: trim(d.code) || (old && old.section === d.section ? old.code : nextCode(d.section)), description: trim(d.description), unit: d.unit, drawingRef: trim(d.drawingRef), expr: trim(d.expr), vars, deds, wastePct: waste, notes: trim(d.notes) };
  await save('boqitems', rec, `${old ? 'Edited' : 'Added'} BOQ item ${rec.code} ${rec.description}`);
};
F.approve = async d => {
  if (!can('boq', 'e')) throw new Error('Your role cannot approve BOQ revisions.');
  const rows = pItems().map(i => { const c = calcItem(i); return { i, c, st: itemStatus(i, c) }; });
  if (!rows.length) throw new Error('There are no items to approve.');
  const bad = rows.filter(r => r.st !== 'Verified'); if (bad.length) throw new Error(`${bad.length} item(s) are not verified (for example ${bad[0].i.code}).`);
  if (!d.confirm) throw new Error('Tick the confirmation box.');
  const revs = pRevs(); const last = revs[revs.length - 1]; const items = sortItems(rows.map(r => r.i)).map(i => snapItem(i, rows.find(r => r.i.id === i.id).c));
  if (last) { const df = diffItems(last.items, items); if (!df.added.length && !df.removed.length && !df.changed.length) throw new Error('Nothing has changed since Rev ' + last.rev + '.'); if (!trim(d.reason)) throw new Error('Give the reason for this revision.'); }
  await save('boqrevs', { projectId: S.pid, rev: (last?.rev || 0) + 1, reason: trim(d.reason), approvedBy: S.user.id, approvedByName: S.user.name, approvedAt: new Date().toISOString(), items }, `Approved BOQ Rev ${(last?.rev || 0) + 1}`);
  toast('Revision approved and preserved');
};

// ---------- actions ----------
Object.assign(A, {
  'new-drawing': () => openSheet(drawingForm()),
  'new-meas': id => openSheet(measForm(null, id)),
  'edit-meas': id => openSheet(measForm(S.measurements.find(m => m.id === id))),
  async 'confirm-meas'(id) {
    if (!canMeasure()) return; const m = S.measurements.find(x => x.id === id);
    if (!confirm('Confirm that you checked this value against the written dimension, the CAD/BIM data, or on site?')) return;
    await save('measurements', { ...m, status: 'confirmed', confirmedBy: S.user.id, confirmedAt: new Date().toISOString() }, `Confirmed measurement ${m.label}`); await render();
  },
  async 'del-meas'(id) {
    if (!canMeasure()) return; const m = S.measurements.find(x => x.id === id);
    const used = pItems().filter(i => (i.vars || []).some(v => v.measId === id)).length;
    if (!confirm(used ? `This measurement is used by ${used} BOQ item(s), which will show an error. Delete anyway?` : 'Delete this measurement?')) return;
    await save('measurements', { ...m, deleted: true }, `Deleted measurement ${m.label}`); await render();
  },
  'new-item': () => openSheet(`<h1>New item</h1><p class="small muted">Pick a template. It only pre-fills the formula structure; you enter every value.</p>${TEMPLATES.map((t, i) => `<button class="card" style="display:block;width:100%;text-align:left" data-a="tpl" data-id="${i}">${esc(t.n)}</button>`).join('')}<button data-a="close">Cancel</button>`),
  tpl: i => openSheet(itemForm(null, TEMPLATES[Number(i)])),
  'edit-item': id => openSheet(itemForm(S.boqitems.find(x => x.id === id))),
  async 'verify-item'(id) {
    if (!can('boq', 'e')) return; const it = S.boqitems.find(x => x.id === id); const c = calcItem(it);
    if (itemStatus(it, c) !== 'Draft') throw new Error('Only error-free items with confirmed inputs can be verified.');
    if (!trim(it.drawingRef)) throw new Error('Add the drawing reference first (Edit).');
    if (!confirm(`Verify ${it.code}? You are confirming the inputs and the result (${fmt(c.net)} ${it.unit}) are correct.`)) return;
    await save('boqitems', { ...it, verifiedSig: c.sig, verifiedBy: S.user.id, verifiedAt: new Date().toISOString() }, `Verified BOQ item ${it.code}`); await render();
  },
  async 'del-item'(id) {
    if (!can('boq', 'e')) return; const it = S.boqitems.find(x => x.id === id);
    if (!confirm(`Delete ${it.code}? Approved revisions keep their copy.`)) return;
    await save('boqitems', { ...it, deleted: true }, `Deleted BOQ item ${it.code}`); location.hash = '#/boq'; await render();
  },
  'approve-boq'() {
    const rows = pItems().map(i => itemStatus(i, calcItem(i))); const bad = rows.filter(s => s !== 'Verified').length;
    if (!rows.length) throw new Error('Add items first.'); if (bad) throw new Error(`${bad} item(s) are not verified yet.`);
    const last = pRevs().slice(-1)[0];
    openSheet(`<h1>Approve revision ${(last?.rev || 0) + 1}</h1><p class="small muted">This freezes a permanent copy of all quantities. It records your internal sign-off and does not replace approval by licensed professionals or authorities.</p>
    <form data-f="approve">${last ? fld('Reason for this revision', 'reason', '', { req: 1 }) : ''}${chk('I confirm the quantities were checked by a suitably qualified person', 'confirm', false)}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Approve</button></div></form>`);
  },
  'view-rev'(id) {
    const r = S.boqrevs.find(x => x.id === id); const prev = pRevs().filter(x => x.rev < r.rev).slice(-1)[0];
    const df = prev ? diffItems(prev.items, r.items) : null;
    openSheet(`<h1>Rev ${r.rev}</h1><p class="small muted">${esc(r.approvedAt.slice(0, 16).replace('T', ' '))} UTC · ${esc(r.approvedByName)}${r.reason ? '<br>' + esc(r.reason) : ''}</p>
    ${df ? `<p class="small">Compared with Rev ${prev.rev}: ${df.added.length} added, ${df.removed.length} removed, ${df.changed.length} changed.</p>` : ''}
    ${r.items.map(x => `<div class="card small"><b>${esc(x.code)} ${esc(x.description)}</b><br>Net ${fmt(x.net)} ${esc(x.unit)} · Procure ${fmt(x.proc)} ${esc(x.unit)}<br><span class="muted">${esc(x.expr)} · waste ${x.wastePct}%</span>${df?.changed.some(c => c.id === x.id) ? '<br><span class="chip High">changed</span>' : ''}${df?.added.some(c => c.id === x.id) ? '<br><span class="chip Medium">added</span>' : ''}</div>`).join('')}
    ${df?.removed.length ? `<h2>Removed since Rev ${prev.rev}</h2>${df.removed.map(x => `<div class="card small">${esc(x.code)} ${esc(x.description)}</div>`).join('')}` : ''}<button data-a="close">Close</button>`);
  },
  'export-boq'() {
    const q = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const head = ['Section', 'Code', 'Description', 'Unit', 'Drawing reference', 'Formula', 'Variables', 'Gross', 'Deductions', 'Net', 'Waste %', 'Waste qty', 'Procurement qty', 'Status'];
    const lines = [head.map(q).join(',')];
    for (const i of sortItems(pItems())) {
      const c = calcItem(i);
      lines.push([i.section, i.code, i.description, i.unit, i.drawingRef, i.expr, c.info.map(v => `${v.name}=${fmt(v.value)}`).join('; '), c.ok ? Math.round(c.gross * 1e4) / 1e4 : '', c.ok ? Math.round(c.dedTotal * 1e4) / 1e4 : '', c.ok ? Math.round(c.net * 1e4) / 1e4 : '', Number(i.wastePct) || 0, c.ok ? Math.round(c.waste * 1e4) / 1e4 : '', c.ok ? Math.round(c.proc * 1e4) / 1e4 : '', itemStatus(i, c)].map((v, k) => k >= 7 && k !== 13 && v !== '' ? String(v) : q(v)).join(','));
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `boq-quantities-${todayStr()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('CSV exported');
  }
});

// dynamic rows inside the item form
document.addEventListener('click', e => {
  const b = e.target.closest('[data-x]'); if (!b) return; const form = b.closest('form'); if (!form) return;
  if (b.dataset.x === 'add-var') $('#vars', form).insertAdjacentHTML('beforeend', varRow({}, pMeas()));
  if (b.dataset.x === 'add-ded') $('#deds', form).insertAdjacentHTML('beforeend', dedRow({}));
});

// ---------- registration ----------
ROUTES.drawings = viewDrawings; ROUTES.drawing = viewDrawing; ROUTES.boq = viewBoq; ROUTES.boqitem = viewBoqItem;
Object.assign(SECTIONS.find(s => s.k === 'drawings'), { live: true });
Object.assign(SECTIONS.find(s => s.k === 'boq'), { live: true });
DASH_EXT.drawings = () => { const ds = pDrawings(), ms = pMeas(); const cur = new Set(ds.filter(d => d.rev === latestRev(d)).map(d => d.id)); return `<a class="card" style="display:block" href="#/drawings"><b>Drawings</b><div class="muted small">${cur.size} current drawing(s) · ${ms.filter(m => m.status !== 'confirmed').length} measurement(s) need confirmation</div></a>`; };
DASH_EXT.boq = () => { const rows = pItems().map(i => itemStatus(i, calcItem(i))); const last = pRevs().slice(-1)[0]; return `<a class="card" style="display:block" href="#/boq"><b>BOQ</b><div class="muted small">${rows.length} item(s) · ${rows.filter(s => s === 'Verified').length} verified · ${last ? 'approved Rev ' + last.rev : 'no approved revision'}</div></a>`; };
