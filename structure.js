'use strict';
/* Structural elements — columns, beams and slabs.
   A live calculator. It uses ONLY the numbers you type: no lap lengths, hooks, waste, cover, mix ratios or
   bar sizes are assumed. Fields start empty unless YOU saved project defaults. Every result shows its formula.
   Steel mass per metre is computed from the diameter you enter: π/4 × d² × density (density editable; 7850 kg/m³ is the physical density of steel). */

const STRUCT = { col: { n: 'Column', p: 'Columns' }, beam: { n: 'Beam', p: 'Beams' }, slab: { n: 'Slab', p: 'Slabs' } };
const SFIELDS = {
  col: ['mark', 'floor', 'floors', 'qty', 'b', 'h', 'H', 'grade', 'wConc', 'nMain', 'dMain', 'lap', 'dS', 'sS', 'cover', 'hook', 'extraS', 'wSteel', 'mc', 'ms', 'ma', 'dry', 'bag'],
  beam: ['mark', 'floor', 'floors', 'qty', 'b', 'h', 'L', 'grade', 'wConc', 'nBot', 'dBot', 'nTop', 'dTop', 'nExt', 'dExt', 'lExt', 'allow', 'dS', 'sS', 'cover', 'hook', 'extraS', 'wSteel', 'mc', 'ms', 'ma', 'dry', 'bag'],
  slab: ['mark', 'floor', 'floors', 'qty', 'Lx', 'Ly', 'T', 'grade', 'wConc', 'dBx', 'sBx', 'dBy', 'sBy', 'allow', 'dTop', 'sTop', 'wSteel', 'mc', 'ms', 'ma', 'dry', 'bag']
};
const stCfg = () => S.structcfg.find(x => x.id === S.pid && !x.deleted) || {};
const pEls = () => P(S.elements);
const SN = v => v === '' || v == null ? null : (isFinite(Number(v)) ? Number(v) : null);
const blank = v => v === '' || v == null;
const spos = v => SN(v) != null && SN(v) > 0;
const rho0 = () => SN(stCfg().density) > 0 ? SN(stCfg().density) : 7850;
const mpm = (d, rho) => Math.PI / 4 * (d / 1000) ** 2 * rho;
const f3 = x => fmt(x);

function calcEl(e, rho) {
  rho = rho || rho0(); const t = e.type;
  const R = { issues: [], bars: [], rows: { conc: [], main: [], top: [], stir: [], mix: [], sum: [] }, net: null, order: null, form: null, steel: { main: 0, stir: 0 }, steelNet: 0, steelOrder: 0, mixv: null, members: null };
  const row = (k, l, v, u, f) => R.rows[k].push({ l, v, u, f }); const need = (k, m) => R.rows[k].push({ hint: m }); const bad = m => { if (!R.issues.includes(m)) R.issues.push(m); };
  const opt = (name, label, max) => { const v = e[name]; if (blank(v)) return 0; const n = SN(v); if (n == null || n < 0 || (max != null && n > max)) { bad(`${label} must be a number from 0${max != null ? ' to ' + max : ''}`); return 0; } return n; };
  const q = SN(e.qty), fl = blank(e.floors) ? 1 : SN(e.floors);
  if (!(Number.isInteger(q) && q >= 1)) bad('Quantity per floor must be a whole number, 1 or more');
  if (!(Number.isInteger(fl) && fl >= 1)) bad('Number of floors must be a whole number, 1 or more');
  const members = Number.isInteger(q) && q >= 1 && Number.isInteger(fl) && fl >= 1 ? q * fl : null; R.members = members;
  const wC = opt('wConc', 'Concrete waste %', 100), wS = opt('wSteel', 'Steel waste %', 100);
  // ---- concrete and formwork
  let v1 = null, f1 = null, span = null, B = null, Hh = null;
  if (t === 'col') {
    if (spos(e.b) && spos(e.h) && spos(e.H)) { B = SN(e.b); Hh = SN(e.h); span = SN(e.H); v1 = B * Hh * span; f1 = 2 * (B + Hh) * span; row('conc', 'Concrete per member', v1, 'm³', `${f3(B)} × ${f3(Hh)} × ${f3(span)}`); row('conc', 'Formwork per member (4 sides)', f1, 'm²', `2 × (${f3(B)} + ${f3(Hh)}) × ${f3(span)}`); } else { need('conc', 'Enter width, depth and height'); if (!blank(e.b) || !blank(e.h) || !blank(e.H)) bad('Width, depth and height must be more than zero'); }
  } else if (t === 'beam') {
    if (spos(e.b) && spos(e.h) && spos(e.L)) { B = SN(e.b); Hh = SN(e.h); span = SN(e.L); v1 = B * Hh * span; f1 = (B + 2 * Hh) * span; row('conc', 'Concrete per member', v1, 'm³', `${f3(B)} × ${f3(Hh)} × ${f3(span)}`); row('conc', 'Formwork per member (soffit + 2 sides)', f1, 'm²', `(${f3(B)} + 2 × ${f3(Hh)}) × ${f3(span)}`); } else { need('conc', 'Enter width, depth and length'); if (!blank(e.b) || !blank(e.h) || !blank(e.L)) bad('Width, depth and length must be more than zero'); }
  } else {
    if (spos(e.Lx) && spos(e.Ly) && spos(e.T)) { const lx = SN(e.Lx), ly = SN(e.Ly), th = SN(e.T); v1 = lx * ly * th; f1 = lx * ly; row('conc', 'Concrete per member', v1, 'm³', `${f3(lx)} × ${f3(ly)} × ${f3(th)}`); row('conc', 'Formwork per member (soffit only)', f1, 'm²', `${f3(lx)} × ${f3(ly)}`); } else { need('conc', 'Enter length, width and thickness'); if (!blank(e.Lx) || !blank(e.Ly) || !blank(e.T)) bad('Length, width and thickness must be more than zero'); }
  }
  if (v1 != null) {
    if (members) {
      R.net = v1 * members; R.form = f1 * members; R.order = R.net * (1 + wC / 100);
      row('conc', `Concrete, ${members} member(s)`, R.net, 'm³', `${f3(v1)} × ${q} × ${fl} floor(s)`);
      row('conc', `Concrete to order (${wC}% waste${wC ? '' : ': none applied'})`, R.order, 'm³', `${f3(R.net)} × (1 + ${wC} ÷ 100)`);
      row('conc', 'Formwork area, all members', R.form, 'm²', `${f3(f1)} × ${members}`);
    } else need('conc', 'Enter quantity and floors to get totals');
  }
  // ---- bars
  const bar = (sec, name, role, nPer, d, lenEach, lenF) => {
    const mass = mpm(d, rho);
    row(sec, `${name}: length each`, lenEach, 'm', lenF);
    if (!members) { need(sec, 'Enter quantity and floors to total this'); return; }
    const totalLen = nPer * lenEach * members, weight = totalLen * mass;
    R.bars.push({ name, role, d, nPer, lenEach, members, totalLen, mass, weight }); R.steel[role] += weight;
    row(sec, `${name}: total length`, totalLen, 'm', `${nPer} × ${f3(lenEach)} × ${members} member(s)`);
    row(sec, `${name}: weight`, weight, 'kg', `${f3(totalLen)} m × ${mass.toFixed(4)} kg/m  [π/4 × ${d}² mm × ${rho} kg/m³]`);
  };
  const intn = v => SN(v) != null && Number.isInteger(SN(v)) && SN(v) >= 1;
  const group = (sec, name, nKey, dKey, build, hint) => {
    const n = e[nKey], d = e[dKey]; if (blank(n) && blank(d)) { if (hint) need(sec, hint); return; }
    if (!(spos(d) && intn(n))) { bad(`${name}: enter the diameter (mm) and a whole number of bars`); need(sec, `${name}: enter diameter and number of bars`); return; }
    if (span == null && t !== 'slab') { need(sec, 'Enter the member dimensions first'); return; }
    build(SN(n), SN(d));
  };
  if (t === 'col') {
    const lap = opt('lap', 'Lap length factor');
    group('main', 'Main bars', 'nMain', 'dMain', (n, d) => bar('main', 'Main bars', 'main', n, d, span + lap * d / 1000, `${f3(span)} + ${lap} × ${d} ÷ 1000`), 'Optional: enter bar diameter and number of bars');
  } else if (t === 'beam') {
    const al = opt('allow', 'End allowance factor');
    group('main', 'Bottom bars', 'nBot', 'dBot', (n, d) => bar('main', 'Bottom bars', 'main', n, d, span + al * d / 1000, `${f3(span)} + ${al} × ${d} ÷ 1000`), 'Optional: enter bottom bar diameter and number');
    group('main', 'Top bars', 'nTop', 'dTop', (n, d) => bar('main', 'Top bars', 'main', n, d, span + al * d / 1000, `${f3(span)} + ${al} × ${d} ÷ 1000`));
    const nx = e.nExt, dx = e.dExt, lx = e.lExt;
    if (!blank(nx) || !blank(dx) || !blank(lx)) {
      if (!(spos(dx) && intn(nx) && spos(lx))) { bad('Extra bars: enter diameter, number and length'); need('main', 'Extra bars: enter diameter, number and length'); }
      else bar('main', 'Extra bars', 'main', SN(nx), SN(dx), SN(lx) + al * SN(dx) / 1000, `${f3(SN(lx))} + ${al} × ${SN(dx)} ÷ 1000`);
    }
  } else {
    const al = opt('allow', 'Bar allowance factor'); const lx = SN(e.Lx), ly = SN(e.Ly);
    const mat = (sec, nm, dK, sK, dir) => {
      const d = e[dK], s = e[sK]; if (blank(d) && blank(s)) return false;
      if (!(spos(d) && spos(s))) { bad(`${nm}: enter diameter and spacing (both more than zero)`); need(sec, `${nm}: enter diameter and spacing`); return true; }
      if (!(spos(e.Lx) && spos(e.Ly))) { need(sec, 'Enter the slab length and width first'); return true; }
      const dd = SN(d), ss = SN(s); const along = dir === 'x' ? lx : ly, across = dir === 'x' ? ly : lx;
      const n = Math.floor(across * 1000 / ss) + 1; row(sec, `${nm}: bars`, n, 'nr', `floor(${f3(across)} × 1000 ÷ ${ss}) + 1`);
      bar(sec, nm, 'main', n, dd, along + al * dd / 1000, `${f3(along)} + ${al} × ${dd} ÷ 1000`); return true;
    };
    const a1 = mat('main', 'Bottom bars along length', 'dBx', 'sBx', 'x'), a2 = mat('main', 'Bottom bars along width', 'dBy', 'sBy', 'y');
    if (!a1 && !a2) need('main', 'Optional: enter bar diameter and spacing for each direction');
    if (!blank(e.dTop) || !blank(e.sTop)) {
      const d = e.dTop, s = e.sTop;
      if (!(spos(d) && spos(s))) { bad('Top mat: enter diameter and spacing'); need('top', 'Top mat: enter diameter and spacing'); }
      else { mat('top', 'Top bars along length', 'dTop', 'sTop', 'x'); mat('top', 'Top bars along width', 'dTop', 'sTop', 'y'); }
    } else need('top', 'Optional: leave empty if there is no top steel');
  }
  // ---- stirrups
  if (t !== 'slab') {
    const ds = e.dS, ss = e.sS, cv = e.cover;
    if (blank(ds) && blank(ss) && blank(cv)) need('stir', 'Optional: enter stirrup diameter, spacing and cover');
    else if (!(spos(ds) && spos(ss) && spos(cv))) { bad('Stirrups: enter diameter, spacing and cover (all more than zero)'); need('stir', 'Enter stirrup diameter, spacing and cover'); }
    else if (v1 == null) need('stir', 'Enter the member dimensions first');
    else {
      const d = SN(ds), s = SN(ss), c = SN(cv), hk = opt('hook', 'Hook allowance factor'), ex = opt('extraS', 'Extra stirrups');
      const bi = B - 2 * c / 1000, hi = Hh - 2 * c / 1000;
      if (!(bi > 0 && hi > 0)) { bad('Cover is too large for this section'); need('stir', 'Cover is too large for this section'); }
      else {
        row('stir', 'Stirrup inner size', null, '', `${f3(B)} − 2 × ${c} ÷ 1000 = ${f3(bi)} m; ${f3(Hh)} − 2 × ${c} ÷ 1000 = ${f3(hi)} m`);
        const len = 2 * (bi + hi) + hk * d / 1000, n = Math.floor(span * 1000 / s) + 1 + ex;
        row('stir', 'Number per member', n, 'nr', `floor(${f3(span)} × 1000 ÷ ${s}) + 1${ex ? ' + ' + ex + ' extra' : ''}`);
        bar('stir', 'Stirrups', 'stir', n, d, len, `2 × (${f3(bi)} + ${f3(hi)}) + ${hk} × ${d} ÷ 1000`);
      }
    }
  }
  // ---- steel totals
  R.steelNet = R.steel.main + R.steel.stir; R.steelOrder = R.steelNet * (1 + wS / 100);
  // ---- mix (optional)
  const mc = e.mc, ms = e.ms, ma = e.ma, dr = e.dry, bg = e.bag;
  if (![mc, ms, ma, dr, bg].every(blank)) {
    if (!(spos(mc) && spos(ms) && spos(ma) && spos(dr))) { bad('Mix: enter all three ratio parts and the dry-volume factor'); need('mix', 'Enter cement : sand : aggregate and the dry-volume factor'); }
    else if (!blank(bg) && !spos(bg)) { bad('Cement bag volume must be more than zero'); }
    else if (R.order == null) need('mix', 'Enter dimensions, quantity and floors first');
    else {
      const parts = SN(mc) + SN(ms) + SN(ma), dry = R.order * SN(dr);
      R.mixv = { dry, cement: dry * SN(mc) / parts, sand: dry * SN(ms) / parts, agg: dry * SN(ma) / parts };
      row('mix', 'Dry volume of materials', dry, 'm³', `${f3(R.order)} × ${SN(dr)}`);
      row('mix', 'Cement', R.mixv.cement, 'm³', `${f3(dry)} × ${SN(mc)} ÷ ${parts}`); row('mix', 'Sand', R.mixv.sand, 'm³', `${f3(dry)} × ${SN(ms)} ÷ ${parts}`); row('mix', 'Coarse aggregate', R.mixv.agg, 'm³', `${f3(dry)} × ${SN(ma)} ÷ ${parts}`);
      if (spos(bg)) { R.mixv.bags = R.mixv.cement / SN(bg); row('mix', 'Cement bags', R.mixv.bags, 'bags', `${f3(R.mixv.cement)} ÷ ${SN(bg)} m³ per bag`); }
    }
  }
  // ---- summary
  const S_ = R.rows.sum;
  if (R.net != null) S_.push({ l: 'Concrete (net)', v: R.net, u: 'm³', tot: 1 }, { l: 'Concrete to order', v: R.order, u: 'm³' }, { l: 'Formwork', v: R.form, u: 'm²' });
  if (R.bars.length) S_.push({ l: 'Main steel', v: R.steel.main, u: 'kg' }, { l: 'Stirrup steel', v: R.steel.stir, u: 'kg' }, { l: `Steel to order (${wS}% waste${wS ? '' : ': none applied'})`, v: R.steelOrder, u: 'kg', tot: 1, f: `(${f3(R.steel.main)} + ${f3(R.steel.stir)}) × (1 + ${wS} ÷ 100)` });
  if (R.net > 0 && R.steelNet > 0) S_.push({ l: 'Steel per m³ of concrete (for your review)', v: R.steelNet / R.net, u: 'kg/m³', f: `${f3(R.steelNet)} ÷ ${f3(R.net)}` });
  if (!S_.length) S_.push({ hint: 'Results appear as you enter values.' });
  return R;
}

// ---------- rendering ----------
const secHtml = rows => rows.map(r => r.hint ? `<div class="small muted hint">${esc(r.hint)}</div>` : r.v == null && r.f ? `<div class="cl"><span>${esc(r.l)}</span></div><div class="cf">${esc(r.f)}</div>` : `<div class="cl ${r.tot ? 'tot' : ''}"><span>${esc(r.l)}</span><b>${fmt(r.v)} ${esc(r.u)}</b></div>${r.f ? `<div class="cf">${esc(r.f)}</div>` : ''}`).join('');
const sumHtml = R => (R.issues.length ? `<div class="err" style="min-height:0">${R.issues.map(i => '• ' + esc(i)).join('<br>')}</div>` : '') + secHtml(R.rows.sum);
const nf = (label, name, v, attrs = '') => fld(label, name, v ?? '', { type: 'number', attrs: `min="0" step="any" inputmode="decimal" ${attrs}` });
const secCard = (icon, title, body, out) => `<div class="card sec"><div class="sec-h"><span>${svg24(icon)}</span><b>${title}</b></div>${body}${out ? `<div class="outs" data-out="${out}"></div>` : ''}</div>`;

function elementForm(type, el, defaults) {
  const v = { ...(defaults || {}), ...(el || {}) }; const S2 = k => v[k] ?? '';
  const id = el?.id || '';
  const common = fld('Mark (e.g. C1)', 'mark', S2('mark'), { req: 1, attrs: 'autocapitalize="characters" autocomplete="off"' }) + fld('Floor or level (your label)', 'floor', S2('floor'), { attrs: 'autocomplete="off"' }) + nf('Number of identical floors', 'floors', S2('floors') === '' ? 1 : S2('floors'), 'step="1" min="1"');
  const grade = fld('Concrete grade (your spec, optional)', 'grade', S2('grade'), { attrs: 'autocomplete="off"' }) + nf('Concrete waste % (0 = none)', 'wConc', S2('wConc'), 'max="100"');
  const mix = secCard('inventory', 'Concrete mix (optional)', `<p class="small muted">Enter the mix from your specification. Nothing is assumed: the dry-volume factor and bag volume are yours.</p><div class="two">${nf('Cement part', 'mc', S2('mc'))}${nf('Sand part', 'ms', S2('ms'))}</div><div class="two">${nf('Aggregate part', 'ma', S2('ma'))}${nf('Dry-volume factor', 'dry', S2('dry'))}</div>${nf('Cement bag volume (m³), optional', 'bag', S2('bag'))}`, 'mix');
  const stir = secCard('boq', 'Stirrups / ties', `<div class="two">${nf('Stirrup dia (mm)', 'dS', S2('dS'))}${nf('Spacing (mm)', 'sS', S2('sS'))}</div>${nf('Concrete cover (mm)', 'cover', S2('cover'))}<div class="two">${nf('Hook allowance (× dia)', 'hook', S2('hook'))}${nf('Extra stirrups per member', 'extraS', S2('extraS'), 'step="1"')}</div>`, 'stir');
  let body = '';
  if (type === 'col') {
    body = secCard('structure', 'Column dimensions', `${common}<div class="two">${nf('Width (m)', 'b', S2('b'))}${nf('Depth (m)', 'h', S2('h'))}</div><div class="two">${nf('Height (m)', 'H', S2('H'))}${nf('Quantity per floor', 'qty', S2('qty') === '' ? 1 : S2('qty'), 'step="1" min="1"')}</div>${grade}`, 'conc')
      + secCard('progress', 'Main bars (longitudinal)', `<div class="two">${nf('Bar dia (mm)', 'dMain', S2('dMain'))}${nf('Number of bars', 'nMain', S2('nMain'), 'step="1"')}</div>${nf('Lap length factor (× dia)', 'lap', S2('lap'))}`, 'main') + stir;
  } else if (type === 'beam') {
    body = secCard('structure', 'Beam dimensions', `${common}<div class="two">${nf('Width (m)', 'b', S2('b'))}${nf('Depth (m)', 'h', S2('h'))}</div><div class="two">${nf('Length (m)', 'L', S2('L'))}${nf('Quantity per floor', 'qty', S2('qty') === '' ? 1 : S2('qty'), 'step="1" min="1"')}</div>${grade}`, 'conc')
      + secCard('progress', 'Longitudinal bars', `<div class="two">${nf('Bottom bar dia (mm)', 'dBot', S2('dBot'))}${nf('Bottom bars (nr)', 'nBot', S2('nBot'), 'step="1"')}</div><div class="two">${nf('Top bar dia (mm)', 'dTop', S2('dTop'))}${nf('Top bars (nr)', 'nTop', S2('nTop'), 'step="1"')}</div><div class="two">${nf('Extra bar dia (mm)', 'dExt', S2('dExt'))}${nf('Extra bars (nr)', 'nExt', S2('nExt'), 'step="1"')}</div>${nf('Extra bar length each (m)', 'lExt', S2('lExt'))}${nf('End allowance per bar (× dia)', 'allow', S2('allow'))}`, 'main') + stir;
  } else {
    body = secCard('structure', 'Slab dimensions', `${common}<div class="two">${nf('Length (m)', 'Lx', S2('Lx'))}${nf('Width (m)', 'Ly', S2('Ly'))}</div><div class="two">${nf('Thickness (m)', 'T', S2('T'))}${nf('Quantity per floor', 'qty', S2('qty') === '' ? 1 : S2('qty'), 'step="1" min="1"')}</div>${grade}`, 'conc')
      + secCard('progress', 'Bottom mat', `<div class="two">${nf('Dia, along length (mm)', 'dBx', S2('dBx'))}${nf('Spacing (mm)', 'sBx', S2('sBx'))}</div><div class="two">${nf('Dia, along width (mm)', 'dBy', S2('dBy'))}${nf('Spacing (mm)', 'sBy', S2('sBy'))}</div>${nf('Bar allowance (× dia)', 'allow', S2('allow'))}`, 'main')
      + secCard('progress', 'Top mat (optional)', `<div class="two">${nf('Top bar dia (mm)', 'dTop', S2('dTop'))}${nf('Spacing (mm)', 'sTop', S2('sTop'))}</div>`, 'top');
  }
  body += `<div class="card sec"><div class="sec-h"><span>${svg24('finance')}</span><b>Waste allowance</b></div>${nf('Steel waste % (0 = none)', 'wSteel', S2('wSteel'), 'max="100"')}</div>` + mix + secCard('reports', 'Summary', '', 'sum');
  return `<a href="#/structure" class="small muted">← Structure</a><h1>${el ? 'Edit' : 'New'} ${STRUCT[type].n.toLowerCase()}</h1>
  <form data-f="element" class="elform"><input type="hidden" name="id" value="${id}"><input type="hidden" name="type" value="${type}">${body}
  <div class="err"></div><div class="livebar"><div id="live"></div><div class="row" style="flex-wrap:nowrap"><a class="btn" href="#/structure">Cancel</a><button class="primary" style="flex:1">Save ${STRUCT[type].n.toLowerCase()}</button></div></div></form>`;
}
function liveUpdate(form) {
  const d = Object.fromEntries(new FormData(form)); const R = calcEl(d);
  form.querySelectorAll('[data-out]').forEach(o => { const k = o.dataset.out; o.innerHTML = k === 'sum' ? sumHtml(R) : secHtml(R.rows[k] || []); });
  const lv = form.querySelector('#live'); if (lv) lv.innerHTML = R.net != null ? `<div class="small">Concrete <b>${fmt(R.order)} m³</b>${R.bars.length ? ` · Steel <b>${fmt(R.steelOrder)} kg</b>` : ''} <span class="muted">(incl. waste you entered)</span></div>` : '<div class="small muted">Enter dimensions to see results</div>';
}
document.addEventListener('input', e => { const f = e.target.closest && e.target.closest('form[data-f=element]'); if (f) liveUpdate(f); });
new MutationObserver(() => { const f = document.querySelector('form[data-f=element]'); if (f && !f.dataset.live) { f.dataset.live = '1'; liveUpdate(f); } }).observe(document.body, { childList: true, subtree: true });

// ---------- views ----------
const elSummary = (e, R) => {
  const dims = e.type === 'col' ? `${e.b} × ${e.h} × ${e.H} m` : e.type === 'beam' ? `${e.b} × ${e.h} × ${e.L} m` : `${e.Lx} × ${e.Ly} × ${e.T} m`;
  return `${dims} · ${e.qty} per floor × ${e.floors || 1} floor(s)`;
};
function structTotals() {
  const T0 = { conc: 0, order: 0, form: 0, steel: 0, steelOrder: 0, n: 0, bad: 0 }; const by = { col: { ...T0 }, beam: { ...T0 }, slab: { ...T0 } }; const rows = [];
  for (const e of pEls()) { const R = calcEl(e); rows.push({ e, R }); const b = by[e.type]; if (!b) continue; b.n++; if (R.issues.length || R.net == null) { b.bad++; continue; } b.conc += R.net; b.order += R.order; b.form += R.form; b.steel += R.steelNet; b.steelOrder += R.steelOrder; }
  return { by, rows };
}
function viewStructure() {
  const g = gate('boq'); if (g) return g; const e = can('boq', 'e'); const { by, rows } = structTotals(); const cfg = stCfg();
  const all = Object.values(by).reduce((a, b) => ({ conc: a.conc + b.conc, order: a.order + b.order, form: a.form + b.form, steel: a.steel + b.steel, steelOrder: a.steelOrder + b.steelOrder }), { conc: 0, order: 0, form: 0, steel: 0, steelOrder: 0 });
  return `<div class="row"><h1>Structural elements</h1>${e ? `<button class="sm" data-a="struct-settings">Defaults</button>` : ''}</div>
  <div class="card small">Columns, beams and slabs are calculated <b>only from values you enter</b>; each result shows its formula. Lap lengths, hooks, waste, cover and mix ratios start empty unless you save project defaults. Steel mass is π/4 × d² × ${rho0()} kg/m³ (density is editable in Defaults). Check every result against the structural drawings and a qualified engineer.</div>
  ${e ? `<div class="quick"><a class="btn sm primary" href="#/element/new-col">+ Column</a><a class="btn sm primary" href="#/element/new-beam">+ Beam</a><a class="btn sm primary" href="#/element/new-slab">+ Slab</a></div>` : ''}
  <div class="grid"><div class="kpi"><span class="muted small">Concrete (net)</span><b>${fmt(all.conc)} m³</b><span class="tag">order ${fmt(all.order)} m³</span></div><div class="kpi"><span class="muted small">Reinforcement</span><b>${fmt(all.steel)} kg</b><span class="tag">order ${fmt(all.steelOrder)} kg</span></div><div class="kpi"><span class="muted small">Formwork</span><b>${fmt(all.form)} m²</b></div><div class="kpi"><span class="muted small">Elements</span><b>${rows.length}</b></div></div>
  <div class="row noprint" style="justify-content:flex-start;margin-bottom:8px"><a class="btn sm" href="#/reports/structural">Bar schedule &amp; export</a>${can('boq', 'e') && rows.length ? `<button class="sm" data-a="struct-boq">Send totals to BOQ</button>` : ''}</div>
  ${['col', 'beam', 'slab'].map(t => { const rs = rows.filter(r => r.e.type === t).sort((a, b) => (a.e.floor || '').localeCompare(b.e.floor || '') || a.e.mark.localeCompare(b.e.mark)); const b = by[t]; return `<h2>${STRUCT[t].p} (${rs.length})</h2>${rs.length ? `<div class="small muted" style="margin:-4px 0 8px">Total: ${fmt(b.conc)} m³ concrete · ${fmt(b.steel)} kg steel · ${fmt(b.form)} m² formwork${b.bad ? ` · <b class="err">${b.bad} incomplete, not counted</b>` : ''}</div>` : ''}${rs.map(({ e: el, R }) => `<div class="card"><div class="row"><b>${esc(el.mark)}${el.floor ? ' · ' + esc(el.floor) : ''}</b>${R.issues.length || R.net == null ? '<span class="chip Critical">Incomplete</span>' : '<span class="chip Completed">Calculated</span>'}</div><div class="small muted">${esc(elSummary(el, R))}${el.grade ? ' · ' + esc(el.grade) : ''}</div>${R.net != null ? `<div class="small">${fmt(R.net)} m³ · ${R.bars.length ? fmt(R.steelNet) + ' kg steel · ' : ''}${fmt(R.form)} m² formwork</div>` : ''}${e ? `<div class="row" style="justify-content:flex-start;margin-top:8px"><a class="btn sm" href="#/element/${el.id}">Open</a><a class="btn sm" href="#/element/dup-${el.id}">Duplicate</a><button class="sm danger" data-a="del-el" data-id="${el.id}">Delete</button></div>` : ''}</div>`).join('') || '<p class="muted small">None yet.</p>'}`; }).join('')}`;
}
function viewElement(arg) {
  const g = gate('boq'); if (g) return g; if (!can('boq', 'e')) return locked();
  const cfg = stCfg(); const defaults = { floors: 1, qty: 1, wConc: cfg.wConc, wSteel: cfg.wSteel, lap: cfg.lap, allow: cfg.allow, hook: cfg.hook, cover: cfg.cover, mc: cfg.mc, ms: cfg.ms, ma: cfg.ma, dry: cfg.dry, bag: cfg.bag };
  let m;
  if ((m = /^new-(col|beam|slab)$/.exec(arg || ''))) return elementForm(m[1], null, defaults);
  if (arg?.startsWith('dup-')) { const s = pEls().find(x => x.id === arg.slice(4)); if (!s) return `<div class="card">Element not found.</div>`; const c = { ...s }; delete c.id; c.mark = ''; return elementForm(s.type, null, { ...defaults, ...c }).replace('<h1>New', '<h1>Duplicate (enter a new mark)'); }
  const el = pEls().find(x => x.id === arg); if (!el) return `<div class="card">Element not found.</div>`;
  return elementForm(el.type, el);
}
const cfgForm = () => { const c = stCfg(); return `<h1>Structure defaults</h1><form data-f="structcfg"><p class="small muted">These pre-fill NEW elements only. They are your values; leave empty to enter everything per element. Existing elements are not changed.</p>
  ${fld('Steel density (kg/m³)', 'density', c.density ?? 7850, { type: 'number', attrs: 'min="1" step="any"' })}${fld('Concrete waste %', 'wConc', c.wConc ?? '', { type: 'number', attrs: 'min="0" max="100" step="any"' })}${fld('Steel waste %', 'wSteel', c.wSteel ?? '', { type: 'number', attrs: 'min="0" max="100" step="any"' })}
  ${fld('Lap length factor (× dia)', 'lap', c.lap ?? '', { type: 'number', attrs: 'min="0" step="any"' })}${fld('Bar end allowance (× dia)', 'allow', c.allow ?? '', { type: 'number', attrs: 'min="0" step="any"' })}${fld('Stirrup hook allowance (× dia)', 'hook', c.hook ?? '', { type: 'number', attrs: 'min="0" step="any"' })}${fld('Concrete cover (mm)', 'cover', c.cover ?? '', { type: 'number', attrs: 'min="0" step="any"' })}
  ${fld('Mix: cement part', 'mc', c.mc ?? '', { type: 'number', attrs: 'min="0" step="any"' })}${fld('Mix: sand part', 'ms', c.ms ?? '', { type: 'number', attrs: 'min="0" step="any"' })}${fld('Mix: aggregate part', 'ma', c.ma ?? '', { type: 'number', attrs: 'min="0" step="any"' })}${fld('Dry-volume factor', 'dry', c.dry ?? '', { type: 'number', attrs: 'min="0" step="any"' })}${fld('Cement bag volume (m³)', 'bag', c.bag ?? '', { type: 'number', attrs: 'min="0" step="any"' })}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`; };

// ---------- handlers ----------
F.element = async (d, form) => {
  if (!can('boq', 'e')) throw new Error('Your role cannot edit structural elements.');
  const type = d.type; if (!SFIELDS[type]) throw new Error('Unknown element type.');
  const rec = { projectId: S.pid, type }; for (const k of SFIELDS[type]) rec[k] = trim(d[k]);
  if (!rec.mark) throw new Error('Give the element a mark, e.g. C1.');
  if (pEls().some(x => x.id !== d.id && x.type === type && x.mark.toLowerCase() === rec.mark.toLowerCase() && (x.floor || '').toLowerCase() === rec.floor.toLowerCase())) throw new Error(`${STRUCT[type].n} ${rec.mark} already exists on that floor. Change the mark or floor, so the same element is not counted twice.`);
  const R = calcEl(rec); if (R.issues.length) throw new Error(R.issues[0]); if (R.net == null) throw new Error('Enter the dimensions, quantity and floors.');
  const old = d.id ? S.elements.find(x => x.id === d.id) : null;
  await save('elements', { ...(old || {}), ...rec, id: d.id || undefined }, `${old ? 'Edited' : 'Added'} ${STRUCT[type].n.toLowerCase()} ${rec.mark}`);
  location.hash = '#/structure'; toast(`${STRUCT[type].n} saved`);
};
F.structcfg = async d => {
  if (!can('boq', 'e')) throw new Error('Your role cannot change defaults.');
  const o = {}; for (const k of ['density', 'wConc', 'wSteel', 'lap', 'allow', 'hook', 'cover', 'mc', 'ms', 'ma', 'dry', 'bag']) { const v = trim(d[k]); if (v !== '') { const n = Number(v); if (!isFinite(n) || n < 0) throw new Error('All defaults must be positive numbers.'); if ((k === 'wConc' || k === 'wSteel') && n > 100) throw new Error('Waste must be 0–100%.'); o[k] = n; } else o[k] = ''; }
  if (!(o.density > 0)) throw new Error('Steel density is required (7850 kg/m³ is the physical value for steel).');
  const old = S.structcfg.find(x => x.id === S.pid); await save('structcfg', { ...(old || {}), id: S.pid, projectId: S.pid, ...o }, 'Changed structure defaults');
};
Object.assign(A, {
  'struct-settings': () => openSheet(cfgForm()),
  async 'del-el'(id) { if (!can('boq', 'e')) return; const x = S.elements.find(v => v.id === id); if (!confirm(`Delete ${x.mark}? Quantities already sent to the BOQ stay there until you send totals again.`)) return; await save('elements', { ...x, deleted: true }, `Deleted ${x.type} ${x.mark}`); await render(); },
  async 'struct-boq'() {
    if (!can('boq', 'e')) throw new Error('Your role cannot edit the BOQ.');
    const { rows } = structTotals(); const ok = rows.filter(r => !r.R.issues.length && r.R.net != null); const bad = rows.length - ok.length;
    const plan = [];
    for (const t of ['col', 'beam', 'slab']) {
      const es = ok.filter(r => r.e.type === t); if (!es.length) continue;
      const same = k => new Set(es.map(r => Number(r.e[k]) || 0)).size === 1 ? Number(es[0].e[k]) || 0 : 0;
      for (const [key, what, unit, get, wk] of [['conc', 'Concrete', 'm³', r => r.R.net, 'wConc'], ['steel', 'Reinforcement', 'kg', r => r.R.steelNet, 'wSteel'], ['form', 'Formwork', 'm²', r => r.R.form, null]]) {
        const parts = es.map(r => ({ r, v: get(r) })).filter(x => x.v > 0); if (!parts.length) continue;
        plan.push({ sk: `struct-${t}-${key}`, description: `${what} – ${STRUCT[t].p.toLowerCase()} (structure calculator)`, unit, parts, wastePct: wk ? same(wk) : 0, mixedWaste: wk ? new Set(es.map(r => Number(r.e[wk]) || 0)).size > 1 : false });
      }
    }
    if (!plan.length) throw new Error('No complete elements with quantities to send.');
    if (!confirm(`Create or update ${plan.length} BOQ item(s) in section D from the calculator?${bad ? `\n${bad} incomplete element(s) are left out.` : ''}\nExisting calculator items are updated in place (not duplicated) and return to Draft for re-verification.`)) return;
    for (const p of plan) {
      const old = pItems().find(i => i.structKey === p.sk);
      const vars = p.parts.map((x, i) => ({ name: 'E' + (i + 1), measId: null, value: Math.round(x.v * 1e6) / 1e6 }));
      const notes = 'From the structure calculator (values are entered, not measured): ' + p.parts.map((x, i) => `E${i + 1} = ${x.r.e.mark}${x.r.e.floor ? ' (' + x.r.e.floor + ')' : ''}`).join('; ') + (p.mixedWaste ? '. Elements have different waste %, so none is applied here; set the waste % yourself.' : '');
      const saved = await save('boqitems', { ...(old || {}), id: old?.id, projectId: S.pid, section: 'D', code: old?.code || nextCode('D'), description: p.description, unit: p.unit, drawingRef: old?.drawingRef || '', expr: vars.map(v => v.name).join('+'), vars, deds: [], wastePct: p.wastePct, notes, structKey: p.sk }, `${old ? 'Updated' : 'Added'} BOQ item from structure: ${p.description}`);
      const ix = S.boqitems.findIndex(i => i.id === saved.id); if (ix >= 0) S.boqitems[ix] = saved; else S.boqitems.push(saved);
    }
    toast(`${plan.length} BOQ item(s) saved. Add the drawing reference, then verify each.`); await render();
  }
});

// ---------- reports ----------
REPORTS.push(['structural', 'Structural elements & bar schedule', 'BOQ']);
BUILD.structural = () => {
  const rho = rho0(); const els = pEls().sort((a, b) => a.type.localeCompare(b.type) || (a.floor || '').localeCompare(b.floor || '') || a.mark.localeCompare(b.mark));
  const sum = [], bars = [];
  for (const e of els) {
    const R = calcEl(e, rho); const ok = !R.issues.length && R.net != null;
    sum.push([STRUCT[e.type].n, e.mark, e.floor || '', e.floors || 1, e.qty, ok ? n2(R.members) : '', ok ? n2(R.net) : '', ok ? n2(R.order) : '', ok ? n2(R.form) : '', ok ? n2(R.steel.main) : '', ok ? n2(R.steel.stir) : '', ok ? n2(R.steelOrder) : '', e.grade || '', ok ? 'Calculated' : 'Incomplete (not counted)']);
    if (ok) for (const b of R.bars) bars.push([STRUCT[e.type].n, e.mark, e.floor || '', b.name, b.d, b.nPer, n2(b.lenEach), b.members, n2(b.totalLen), n2(b.mass), n2(b.weight)]);
  }
  return T('Structural elements', `steel density ${rho} kg/m³; values entered by users`, [
    { name: 'Elements', head: ['Type', 'Mark', 'Floor', 'Floors', 'Qty per floor', 'Members', 'Concrete net m³', 'Concrete to order m³', 'Formwork m²', 'Main steel kg', 'Stirrup steel kg', 'Steel to order kg', 'Grade', 'Status'], rows: sum },
    { name: 'Bar schedule', head: ['Type', 'Mark', 'Floor', 'Bar', 'Dia mm', 'Bars per member', 'Length each m', 'Members', 'Total length m', 'kg per m', 'Weight kg'], rows: bars }
  ]);
};

// ---------- registration ----------
ROUTES.structure = viewStructure; ROUTES.element = viewElement;
SECTIONS.splice(SECTIONS.findIndex(s => s.k === 'cost'), 0, { k: 'structure', n: 'Structural Elements', i: '🏛️', a: 'boq', ph: 8, live: true });
DASH_EXT.structure = () => { if (!can('boq')) return ''; const { by } = structTotals(); const n = by.col.n + by.beam.n + by.slab.n; return n ? `<a class="card" style="display:block" href="#/structure"><b>Structural elements</b><div class="muted small">${n} element(s) · ${fmt(by.col.conc + by.beam.conc + by.slab.conc)} m³ concrete · ${fmt(by.col.steel + by.beam.steel + by.slab.steel)} kg steel</div></a>` : ''; };
