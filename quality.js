'use strict';
/* Phase 6 — Quality & Safety, compliance register, alerts, analytics, design-revision impact.
   NO Ethiopian law, standard or code text is built in. The compliance register holds only what the user types from official
   sources, with who confirmed it and when. Anything not confirmed is flagged for professional review. */

const INSP_RES = { pending: 'In progress', passed: 'Passed', failed: 'Failed' };
const CHK = { pending: 'Not checked', pass: 'Pass', fail: 'Fail', na: 'N/A' };
const INC_TYPES = ['Near miss', 'First aid', 'Injury', 'Property damage', 'Environmental', 'Other'];
const SEVER = ['Low', 'Medium', 'High', 'Critical'];
const COMP_ST = { not_checked: 'Not checked', in_progress: 'In progress', compliant: 'Compliant', non_compliant: 'Not compliant', na: 'Not applicable' };
// Topic NAMES only (not requirements). The user decides what applies and enters the real requirement from the official source.
const COMP_TOPICS = ['Building permit', 'Approved design drawings', 'Structural design review', 'Inspections required by the authority', 'Completion or occupancy approval', 'Environmental requirements', 'Occupational safety requirements', 'Utility connection approvals', 'Contractor and professional licences', 'Land holding / lease documents'];
const pInsp = () => P(S.inspections), pInc = () => P(S.incidents), pComp = () => P(S.compitems);
const inspResult = i => { const c = i.checks || []; if (c.some(x => x.r === 'fail')) return 'failed'; if (!c.length || c.some(x => x.r === 'pending')) return 'pending'; return 'passed'; };
const stageName = k => k ? `${k} · ${BOQ_SECTIONS.find(s => s[0] === k)?.[1] || ''}` : '';
const compUnverified = c => !c.confirmedBy || !c.confirmedOn || !c.reference;
const compExpiry = c => c.expires ? daysUntil(c.expires) : null;

// ================= QUALITY & SAFETY =================
let qTab = 'inspections';
function viewQuality(tab) {
  const g = gate('quality'); if (g) return g; tab = tab || qTab; qTab = tab; const e = can('quality', 'e');
  const tabs = `<div class="tabs">${[['inspections', 'Inspections'], ['incidents', 'Incidents & near misses']].map(([k, l]) => `<a href="#/quality/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  let body = '';
  if (tab === 'inspections') {
    const L = pInsp().sort((a, b) => b.date.localeCompare(a.date));
    body = `<div class="row"><span class="muted small">${L.length} inspection(s)</span>${e ? `<button class="sm primary" data-a="new-insp">+ Inspection</button>` : ''}</div>${can('boq') ? `<a class="card small" style="display:block" href="#/quality/revisions">📐 Design revision impact: BOQ items affected by drawing revisions</a>` : ''}` + (L.map(i => { const r = inspResult(i), cl = i.signedOff; return `<a class="card" style="display:block" href="#/inspection/${i.id}"><div class="row"><b>${esc(i.title)}</b><span class="badge ${r === 'failed' ? 'High' : r === 'passed' ? 'Completed' : 'Medium'}">${INSP_RES[r]}${cl ? ' · signed off' : ''}</span></div><div class="muted small">${esc(i.date)}${i.stage ? ' · ' + esc(stageName(i.stage)) : ''} · ${(i.checks || []).length} check(s) · ${esc(userName(i.by))}</div></a>`; }).join('') || '<p class="muted">No inspections recorded.</p>');
  } else {
    const L = pInc().sort((a, b) => b.date.localeCompare(a.date));
    body = `<div class="row"><span class="muted small">${L.filter(x => x.status === 'open').length} open</span>${e ? `<button class="sm primary" data-a="new-inc">+ Report</button>` : ''}</div>` + (L.map(x => `<div class="card"><div class="row"><b>${esc(x.type)} · ${esc(x.severity)}</b><span class="badge ${x.status === 'open' ? (['High', 'Critical'].includes(x.severity) ? 'High' : 'Medium') : 'Completed'}">${x.status === 'open' ? 'Open' : 'Closed'}</span></div><div class="small">${esc(x.description)}</div><div class="muted small">${esc(x.date)}${x.location ? ' · ' + esc(x.location) : ''} · reported by ${esc(userName(x.by))}${x.cause ? '<br>Cause: ' + esc(x.cause) : ''}${x.action ? '<br>Action: ' + esc(x.action) : ''}</div>${e ? `<div class="row" style="justify-content:flex-start;margin-top:6px"><button class="sm" data-a="edit-inc" data-id="${x.id}">Update</button>${x.status === 'open' ? `<button class="sm" data-a="close-inc" data-id="${x.id}">Close</button>` : ''}</div>` : ''}</div>`).join('') || '<p class="muted">Nothing reported.</p>');
  }
  return `<h1>Quality & Safety</h1>${tabs}${body}`;
}
function viewInspection(id) {
  const g = gate('quality'); if (g) return g; const i = S.inspections.find(x => x.id === id && x.projectId === S.pid && !x.deleted); if (!i) return `<div class="card">Inspection not found.</div>`;
  const e = can('quality', 'e'), r = inspResult(i); const it = i.boqItemId ? itemOf(i.boqItemId) : null; const photos = docsFor('inspection', i.id);
  const needAct = r === 'failed' && !i.signedOff;
  const canSign = e && r === 'passed' && !i.signedOff && (i.by !== S.user.id || memberCount() <= 1);
  return `<a href="#/quality" class="small muted">← Quality & Safety</a><h1>${esc(i.title)}</h1>
  <div class="card"><span class="badge ${r === 'failed' ? 'High' : r === 'passed' ? 'Completed' : 'Medium'}">${INSP_RES[r]}</span>${i.signedOff ? ` <span class="badge Completed">Signed off by ${esc(userName(i.signedOff))} on ${esc(i.signedAt.slice(0, 10))}</span>` : ''}
  <p class="small muted">${esc(i.date)} · inspector ${esc(userName(i.by))}${i.stage ? '<br>Stage: ' + esc(stageName(i.stage)) : ''}${it ? `<br>Work item: ${esc(it.code)} ${esc(it.description)}` : ''}${i.notes ? '<br>' + esc(i.notes) : ''}</p></div>
  <h2>Checks</h2>${(i.checks || []).map((c, k) => `<div class="card"><div class="small"><b>${esc(c.t)}</b></div><div class="seg" ${e && !i.signedOff ? '' : 'style="pointer-events:none;opacity:.7"'}>${['pass', 'fail', 'na', 'pending'].map(v => `<button type="button" class="${c.r === v ? 'on' : ''}" data-a="chk-set" data-id="${id}" data-k="${k}" data-v="${v}">${CHK[v]}</button>`).join('')}</div></div>`).join('') || '<p class="muted small">No checks listed.</p>'}
  ${needAct ? `<div class="card err"><b>Failed.</b> Record the corrective action and re-check before sign-off.${i.corrective ? `<br>Corrective action: ${esc(i.corrective)}` : ''}</div>` : ''}
  <div class="row noprint" style="justify-content:flex-start;flex-wrap:wrap">${e && !i.signedOff ? `<button class="sm" data-a="insp-corr" data-id="${id}">Corrective action</button>` : ''}${e && r === 'failed' && can('tasks', 'e') && !i.taskId ? `<button class="sm" data-a="insp-task" data-id="${id}">Create fix task</button>` : ''}${canSign ? `<button class="sm primary" data-a="insp-sign" data-id="${id}">Sign off</button>` : ''}${e ? `<button class="sm" data-a="insp-photo" data-id="${id}">Add photo</button>` : ''}<button class="sm" data-a="print">Print / PDF</button></div>
  ${i.taskId ? `<p class="small">Fix task created: <a href="#/tasks">see Tasks</a></p>` : ''}${photos.length ? `<p class="small muted">${photos.length} photo(s) in <a href="#/files">Files</a>.</p>` : ''}
  ${r === 'passed' && !i.signedOff && !canSign ? `<p class="small muted">Sign-off needs a person with Quality access other than the inspector.</p>` : ''}`;
}
const inspForm = () => `<h1>New inspection</h1><form data-f="insp">${fld('What is being inspected', 'title', '', { req: 1 })}${fld('Date', 'date', todayStr(), { type: 'date', req: 1 })}${sel('Stage', 'stage', [['', '—'], ...BOQ_SECTIONS.map(([k, n]) => [k, k + ' · ' + n])], '')}${sel('BOQ item (optional)', 'boqItemId', [['', '—'], ...sortItems(pItems()).map(x => [x.id, `${x.code} ${x.description}`.slice(0, 60)])], '')}
  <label>Checks to perform (one per line — write what your engineer or the authority requires)<textarea name="checks" rows="5" required></textarea></label>${fld('Notes', 'notes')}<p class="small muted">This app does not supply required checks or acceptance limits. Enter them from your drawings, specification or the authority’s requirements.</p><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
const incForm = x => `<h1>${x ? 'Update report' : 'Report incident or near miss'}</h1><form data-f="inc"><input type="hidden" name="id" value="${x?.id || ''}">${sel('Type', 'type', INC_TYPES, x?.type)}${sel('Severity', 'severity', SEVER, x?.severity || 'Low')}${fld('Date', 'date', x?.date || todayStr(), { type: 'date', req: 1 })}${fld('Where on site', 'location', x?.location)}
  <label>What happened<textarea name="description" rows="3" required>${esc(x?.description || '')}</textarea></label>${fld('Cause (if known)', 'cause', x?.cause)}${fld('Action taken / to prevent it happening again', 'action', x?.action)}<p class="small muted">Do not enter medical details about a person. Say who to contact, not their condition.</p><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
F.insp = async d => {
  if (!can('quality', 'e')) throw new Error('Your role cannot record inspections.'); if (!trim(d.title)) throw new Error('Say what is inspected.'); if (!d.date || d.date > todayStr()) throw new Error('Date cannot be in the future.');
  const lines = (d.checks || '').split(/\r?\n/).map(trim).filter(Boolean); if (!lines.length) throw new Error('List at least one check.');
  await save('inspections', { projectId: S.pid, title: trim(d.title), date: d.date, stage: d.stage, boqItemId: d.boqItemId, checks: lines.map(t => ({ t, r: 'pending' })), notes: trim(d.notes), by: S.user.id }, `Inspection created: ${trim(d.title)}`);
};
F.inc = async d => {
  if (!can('quality', 'e')) throw new Error('Your role cannot report incidents.'); if (!trim(d.description)) throw new Error('Describe what happened.'); if (!d.date || d.date > todayStr()) throw new Error('Date cannot be in the future.');
  const old = d.id ? S.incidents.find(x => x.id === d.id) : null;
  await save('incidents', { ...(old || {}), id: d.id || undefined, projectId: S.pid, type: d.type, severity: d.severity, date: d.date, location: trim(d.location), description: trim(d.description), cause: trim(d.cause), action: trim(d.action), status: old?.status || 'open', by: old?.by || S.user.id }, `${old ? 'Updated' : 'Reported'} ${d.type} (${d.severity})`);
};
F.corr = async d => { const i = S.inspections.find(x => x.id === d.id); if (!trim(d.text)) throw new Error('Describe the corrective action.'); await save('inspections', { ...i, corrective: trim(d.text) }, 'Corrective action recorded'); };
Object.assign(A, {
  'new-insp': () => openSheet(inspForm()), 'new-inc': () => openSheet(incForm()), 'edit-inc': id => openSheet(incForm(S.incidents.find(x => x.id === id))),
  async 'close-inc'(id) { if (!can('quality', 'e')) throw new Error('No access.'); const x = S.incidents.find(v => v.id === id); if (!trim(x.action)) throw new Error('Record the action taken (Update) before closing.'); if (!confirm('Close this report?')) return; await save('incidents', { ...x, status: 'closed', closedBy: S.user.id, closedAt: new Date().toISOString() }, `Closed ${x.type}`); await render(); },
  async 'chk-set'(id) { const el = window.__lastEl; const k = Number(el.dataset.k), v = el.dataset.v; const i = S.inspections.find(x => x.id === id); if (!can('quality', 'e') || i.signedOff) throw new Error('This inspection cannot be changed.'); const checks = i.checks.map((c, n) => n === k ? { ...c, r: v, by: S.user.id, at: new Date().toISOString() } : c); await save('inspections', { ...i, checks }, `Check ${k + 1} set to ${CHK[v]}`); await render(); },
  'insp-corr'(id) { const i = S.inspections.find(x => x.id === id); openSheet(`<h1>Corrective action</h1><form data-f="corr"><input type="hidden" name="id" value="${id}">${fld('What will be done', 'text', i.corrective || '', { req: 1 })}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`); },
  async 'insp-task'(id) { const i = S.inspections.find(x => x.id === id); const t = await save('tasks', { projectId: S.pid, title: `Fix: ${i.title}${i.corrective ? ' — ' + i.corrective : ''}`.slice(0, 140), start: '', due: addDays(todayStr(), 3), stage: i.stage || '', assignee: '', boqItemId: i.boqItemId || '', status: 'todo', blockReason: '', delayCause: '', deps: [], safety: false, cost: false, blocks: true, needsApproval: false }, 'Fix task created from failed inspection'); await save('inspections', { ...i, taskId: t.id }, 'Linked fix task'); toast('Task created'); await render(); },
  async 'insp-sign'(id) { const i = S.inspections.find(x => x.id === id); if (inspResult(i) !== 'passed') throw new Error('All checks must pass first.'); if (i.by === S.user.id && memberCount() > 1) throw new Error('Another person must sign off an inspection you recorded.'); if (!confirm('Sign off this inspection as passed?')) return; await save('inspections', { ...i, signedOff: S.user.id, signedAt: new Date().toISOString() }, 'Inspection signed off'); await render(); },
  'insp-photo'(id) { const i = S.inspections.find(x => x.id === id); openSheet(`<h1>Inspection photo</h1><form data-f="inspphoto"><input type="hidden" name="id" value="${id}"><label>Photo<input type="file" name="photo" accept="image/*" capture="environment"></label><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`); }
});
F.inspphoto = async (d, form) => { const files = new FormData(form).getAll('photo').filter(f => f && f.size); if (!files.length) throw new Error('Choose a photo.'); const i = S.inspections.find(x => x.id === d.id); for (const f of files) await saveDoc(f, { category: 'Inspection reports', linkType: 'inspection', linkId: i.id, name: `Inspection photo ${i.title}` }); };

// ================= COMPLIANCE REGISTER =================
let compFilter = '';
function viewCompliance() {
  const g = gate('compliance'); if (g) return g; const e = can('compliance', 'e'); const L = pComp().filter(c => !compFilter || c.status === compFilter).sort((a, b) => (a.title || '').localeCompare(b.title));
  const all = pComp(); const n = k => all.filter(c => c.status === k).length;
  return `<div class="row"><h1>Compliance register</h1>${e ? `<button class="primary" data-a="new-req">+ Add</button>` : ''}</div>
  <div class="card small"><b>Read first.</b> This app contains no Ethiopian laws, standards or building codes and does not tell you what applies. Enter each requirement yourself from the official source (the permit office, the published regulation, your engineer), and record who confirmed it and when. Items without a typed reference and a confirmation are flagged <b class="err">Unverified</b> and need review by a licensed professional.</div>
  <div class="grid"><div class="kpi"><span class="muted small">Compliant</span><b>${n('compliant')}</b></div><div class="kpi"><span class="muted small">Not compliant</span><b>${n('non_compliant')}</b></div><div class="kpi"><span class="muted small">Unverified</span><b>${all.filter(compUnverified).length}</b></div></div>
  ${e && !all.length ? `<div class="card"><b>Start with topic names</b><p class="small muted">Adds blank topics to check. They are headings only, not requirements. Remove any that do not apply.</p><button class="sm" data-a="comp-topics">Add suggested topic names</button></div>` : ''}
  <label>Filter<select id="compf"><option value="">All</option>${Object.entries(COMP_ST).map(([k, l]) => `<option value="${k}" ${compFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  ${L.map(c => { const ex = compExpiry(c); return `<div class="card"><div class="row"><b>${esc(c.title)}</b><span class="badge ${c.status === 'compliant' ? 'Completed' : c.status === 'non_compliant' ? 'High' : 'Medium'}">${COMP_ST[c.status]}</span></div>
  <div class="small muted">${c.authority ? 'Authority: ' + esc(c.authority) + '<br>' : ''}${c.reference ? 'Source / reference: ' + esc(c.reference) : '<span class="err">No source or reference typed.</span>'}${c.sourceUrl ? ` · <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">link</a>` : ''}
  ${c.confirmedBy && c.confirmedOn ? `<br>Confirmed by ${esc(c.confirmedBy)} on ${esc(c.confirmedOn)}` : ''}${c.expires ? `<br>Valid until ${esc(c.expires)}${ex !== null && ex < 0 ? ' <b class="err">EXPIRED</b>' : ex !== null && ex <= 30 ? ' <b>(expires in ' + ex + ' days)</b>' : ''}` : ''}${c.note ? '<br>' + esc(c.note) : ''}</div>
  ${compUnverified(c) ? `<div class="small err">Unverified: confirm the source with a qualified professional.</div>` : ''}${docsFor('compliance', c.id).length ? `<div class="small muted">${docsFor('compliance', c.id).length} document(s) attached (see Files).</div>` : ''}
  ${e ? `<div class="row" style="justify-content:flex-start;margin-top:6px"><button class="sm" data-a="edit-req" data-id="${c.id}">Edit</button><button class="sm" data-a="del-req" data-id="${c.id}">Remove</button></div>` : ''}</div>`; }).join('') || '<p class="muted">Nothing here.</p>'}`;
}
const regForm = c => `<h1>${c ? 'Edit requirement' : 'Add requirement'}</h1><form data-f="compitem"><input type="hidden" name="id" value="${c?.id || ''}">${fld('Topic / requirement', 'title', c?.title, { req: 1 })}${fld('Authority (who requires or issues it)', 'authority', c?.authority)}
  <label>Source or reference, typed from the official document (name, number, article, date)<textarea name="reference" rows="2">${esc(c?.reference || '')}</textarea></label>${fld('Link to source (optional)', 'sourceUrl', c?.sourceUrl, { type: 'url' })}${sel('Status', 'status', Object.entries(COMP_ST), c?.status || 'not_checked')}
  ${fld('Confirmed by (name and licence / office, as you know it)', 'confirmedBy', c?.confirmedBy)}${fld('Confirmed on', 'confirmedOn', c?.confirmedOn, { type: 'date' })}${fld('Valid until (permits, licences)', 'expires', c?.expires, { type: 'date' })}${fld('Note', 'note', c?.note)}
  <label>Attach document (optional)<input type="file" name="receipts" accept="image/*,application/pdf"></label><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
F.compitem = async (d, form) => {
  if (!can('compliance', 'e')) throw new Error('Your role cannot edit the register.'); if (!trim(d.title)) throw new Error('Enter the topic.');
  if (d.status === 'compliant' && (!trim(d.reference) || !trim(d.confirmedBy) || !d.confirmedOn)) throw new Error('To mark Compliant, type the source or reference and who confirmed it, and when.');
  if (d.confirmedOn && d.confirmedOn > todayStr()) throw new Error('Confirmation date cannot be in the future.');
  const old = d.id ? S.compitems.find(x => x.id === d.id) : null;
  const rec = await save('compitems', { ...(old || {}), id: d.id || undefined, projectId: S.pid, title: trim(d.title), authority: trim(d.authority), reference: trim(d.reference), sourceUrl: trim(d.sourceUrl), status: d.status, confirmedBy: trim(d.confirmedBy), confirmedOn: d.confirmedOn, expires: d.expires, note: trim(d.note) }, `${old ? 'Edited' : 'Added'} compliance item ${trim(d.title)}`);
  for (const f of new FormData(form).getAll('receipts').filter(f => f && f.size)) await saveDoc(f, { category: 'Permits', linkType: 'compliance', linkId: rec.id, name: trim(d.title) });
};
Object.assign(A, {
  'new-req': () => openSheet(regForm()), 'edit-req': id => openSheet(regForm(S.compitems.find(x => x.id === id))),
  async 'del-req'(id) { if (!can('compliance', 'e')) throw new Error('No access.'); const c = S.compitems.find(x => x.id === id); if (!confirm(`Remove “${c.title}”? Recorded in the activity log.`)) return; await save('compitems', { ...c, deleted: true }, `Removed compliance item ${c.title}`); await render(); },
  async 'comp-topics'() { if (!can('compliance', 'e')) throw new Error('No access.'); for (const t of COMP_TOPICS) await save('compitems', { projectId: S.pid, title: t, authority: '', reference: '', sourceUrl: '', status: 'not_checked', confirmedBy: '', confirmedOn: '', expires: '', note: 'Topic name only. Enter the real requirement and its source.' }, `Added topic ${t}`); await render(); }
});
document.addEventListener('change', async e => { if (e.target.id === 'compf') { compFilter = e.target.value; await render(); } });

// ================= DESIGN REVISION IMPACT =================
function staleItems() { const out = []; for (const it of pItems()) { const c = calcItem(it); const st = (c.info || []).filter(i => i.stale); if (st.length) out.push({ it, st }); } return out; }

// ================= ALERTS (computed live from records; they clear when the cause is fixed) =================
function alerts() {
  const out = []; const add = (level, text, href) => out.push({ level, text, href }); const tz = todayStr();
  if (can('tasks')) {
    const open = P(S.tasks).filter(t => t.status !== 'done'); const od = open.filter(t => t.due && t.due < tz); if (od.length) add('high', `${od.length} overdue task(s)`, '#/tasks');
    const soon = open.filter(t => t.due && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 2); if (soon.length) add('med', `${soon.length} task(s) due within 2 days`, '#/tasks');
    const bl = open.filter(t => t.status === 'blocked'); if (bl.length) add('med', `${bl.length} blocked task(s)`, '#/tasks');
    const rv = open.filter(t => t.status === 'review'); if (rv.length && approver()) add('med', `${rv.length} task(s) awaiting your approval`, '#/tasks');
  }
  if (approver()) { const n = P(S.progress).filter(u => u.status === 'submitted').length; if (n) add('med', `${n} work update(s) waiting for verification`, '#/progress'); }
  if (can('inventory')) { try { const sh = procurement().filter(r => r.toBuy > 1e-9); if (sh.length) add('med', `${sh.length} material(s) still to buy`, '#/inventory'); } catch { } const late = pOrders().filter(o => o.status === 'ordered' && o.expected && o.expected < tz); if (late.length) add('high', `${late.length} order(s) past expected delivery date`, '#/inventory'); }
  if (can('boq')) { const qs = byP(S.quotes).filter(q => !q.deleted && q.validDays !== '' && q.validDays != null && q.source !== 'estimate'); const ex = qs.filter(q => { const d = daysUntil(q.date) + Number(q.validDays); return d >= 0 && d <= 7; }); if (ex.length) add('low', `${ex.length} quotation(s) expire within 7 days`, '#/suppliers'); const st = staleItems(); if (st.length) add('high', `${st.length} BOQ item(s) use measurements from a superseded drawing revision`, '#/quality/revisions'); }
  if (can('finance')) {
    const f = fin(); if (f.budget != null) { if (f.actual > f.budget) add('high', `Actual expenses exceed the approved budget by ${money(f.actual - f.budget)} ETB`, '#/finance'); else if (f.actual > 0.9 * f.budget) add('med', 'Actual expenses are above 90% of the approved budget', '#/finance'); else if (f.afterCommit != null && f.afterCommit < 0) add('med', 'Actual plus open commitments exceed the approved budget', '#/finance'); }
    const du = pEx().filter(x => x.dueDate && outOf(x) > 0.005 && x.dueDate < tz); if (du.length) add('high', `${du.length} unpaid expense(s) past their due date`, '#/finance/expenses');
    const nr = pEx().filter(x => needsReceipt(x.amount) && !docsFor('expense', x.id).length); if (nr.length) add('med', `${nr.length} expense(s) above the receipt limit have no receipt`, '#/finance/expenses');
  }
  if (can('quality')) {
    const oi = pInc().filter(x => x.status === 'open'); const hi = oi.filter(x => ['High', 'Critical'].includes(x.severity)); if (hi.length) add('high', `${hi.length} open high/critical safety report(s)`, '#/quality/incidents'); else if (oi.length) add('low', `${oi.length} open safety report(s)`, '#/quality/incidents');
    const fi = pInsp().filter(i => inspResult(i) === 'failed' && !i.signedOff); if (fi.length) add('high', `${fi.length} failed inspection(s) not yet resolved`, '#/quality');
  }
  if (can('compliance')) {
    const c = pComp(); const nc = c.filter(x => x.status === 'non_compliant'); if (nc.length) add('high', `${nc.length} compliance item(s) marked not compliant`, '#/compliance');
    const ex = c.filter(x => compExpiry(x) !== null && compExpiry(x) < 0); if (ex.length) add('high', `${ex.length} permit/licence record(s) expired`, '#/compliance'); const so = c.filter(x => compExpiry(x) !== null && compExpiry(x) >= 0 && compExpiry(x) <= 30); if (so.length) add('med', `${so.length} permit/licence record(s) expire within 30 days`, '#/compliance');
    const uv = c.filter(x => x.status !== 'na' && compUnverified(x)); if (uv.length) add('low', `${uv.length} compliance item(s) unverified; need professional review`, '#/compliance');
  }
  if (can('admin')) { const lb = JSON.parse(localStorage.getItem('lastBackup') || 'null'); if (!lb) add('med', 'No backup file has been created yet', '#/backup'); else if ((Date.now() - Date.parse(lb.at)) / 864e5 > 7) add('low', 'Last backup is more than 7 days old', '#/backup'); }
  if (typeof syncAlerts === 'function') out.push(...syncAlerts());
  const rank = { high: 0, med: 1, low: 2 }; return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
const LV = { high: ['High', 'Urgent'], med: ['Medium', 'Soon'], low: ['Low', 'Note'] };
function viewAlerts() {
  const a = alerts(); const np = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return `<h1>Alerts</h1><p class="small muted">Worked out live from your records. An alert disappears when its cause is fixed.</p>
  ${a.map(x => `<a class="card" style="display:block" href="${x.href}"><div class="row"><span>${esc(x.text)}</span><span class="badge ${LV[x.level][0]}">${LV[x.level][1]}</span></div></a>`).join('') || '<div class="card">Nothing needs attention.</div>'}
  <h2>Alerts on this phone</h2><div class="card small">${np === 'granted' ? 'Enabled. A summary is shown once a day when you open the app.' : np === 'denied' ? 'Blocked in your browser settings.' : np === 'unsupported' ? 'Not supported by this browser.' : `<button class="sm" data-a="enable-notify">Allow summary notification</button>`}<div class="muted">The app is offline-first and has no server yet, so it cannot alert you while closed. That arrives with server sync (Phase 7).</div></div>`;
}
A['enable-notify'] = async () => { if (typeof Notification === 'undefined') throw new Error('Not supported here.'); const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Enabled' : 'Not allowed'); await render(); };
async function dailyNotify() { try { if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !S.user || !S.pid) return; const k = 'notified:' + S.pid + ':' + todayStr(); if (localStorage.getItem(k)) return; const a = alerts().filter(x => x.level === 'high'); if (!a.length) return; localStorage.setItem(k, '1'); const reg = await navigator.serviceWorker?.getRegistration(); const o = { body: a.slice(0, 3).map(x => x.text).join('\n'), icon: 'icon-192.png', tag: 'daily' }; if (reg) reg.showNotification(`${a.length} urgent item(s) · ${curProject().name}`, o); } catch { } }
DASH_EXT.alerts = () => { const a = alerts(); setTimeout(dailyNotify, 500); if (!a.length) return ''; const hi = a.filter(x => x.level === 'high').length; return `<a class="card" style="display:block" href="#/alerts"><div class="row"><b>🔔 ${a.length} alert(s)</b><span class="badge ${hi ? 'High' : 'Medium'}">${hi ? hi + ' urgent' : 'Review'}</span></div><div class="small muted">${esc(a.slice(0, 2).map(x => x.text).join(' · '))}</div></a>`; };
DASH_EXT.compliance = () => { if (!can('compliance')) return ''; const c = pComp(); return `<a class="card" style="display:block" href="#/compliance"><b>⚖️ Compliance register</b><div class="small muted">${c.length ? `${c.filter(x => x.status === 'compliant').length} compliant · ${c.filter(x => x.status === 'non_compliant').length} not compliant · ${c.filter(compUnverified).length} unverified` : 'Nothing entered yet.'}</div></a>`; };

// ================= ANALYTICS =================
function viewAnalytics() {
  const g = gate('reports'); if (g) return g; const rows = []; const sec = (t, b) => `<div class="card"><b>${t}</b>${b}</div>`; const ln = (l, v, h) => `<div class="row small"><span>${l}${h ? `<div class="tag">${h}</div>` : ''}</span><b>${v}</b></div>`;
  const ts = P(S.tasks); const done = ts.filter(t => t.status === 'done'); const timed = done.filter(t => t.due && t.doneDate); const late = timed.filter(t => t.doneDate > t.due);
  const sched = timed.length ? ln('Finished by their due date', `${timed.length - late.length} of ${timed.length}`, `${Math.round((timed.length - late.length) / timed.length * 100)}%`) : '<p class="small muted">No finished tasks with due dates yet.</p>';
  const dc = {}; for (const t of ts.filter(t => t.delayCause)) dc[t.delayCause] = (dc[t.delayCause] || 0) + 1; const dcs = Object.entries(dc).sort((a, b) => b[1] - a[1]);
  const o = overall(); let prog = '<p class="small muted">No verified progress yet.</p>'; if (o.pct != null) { const att = P(S.attendance); const ld = att.filter(a => a.status === 'present').length + att.filter(a => a.status === 'half').length / 2; prog = `${bar(o.pct)}${ln('Overall verified progress', fmt(o.pct) + '%')}${ln('Labour-days recorded', fmt(ld))}${ld > 0 && o.pct > 0 ? ln('Labour-days per 1% progress', fmt(ld / o.pct), 'Compare with your own planned figure') : ''}${o.forecast ? ln('Forecast completion', esc(o.forecast), 'Based on verified pace') : ''}`; }
  let fsec = '<p class="small muted">No finance access.</p>'; if (can('finance')) { const f = fin(); const m2 = pnum(curProject()?.area); fsec = ln('Estimated cost', f.est ? money(f.est) + ' ETB' : '—') + ln('Approved budget', f.budget != null ? money(f.budget) + ' ETB' : 'not set') + ln('Actual expenses', money(f.actual) + ' ETB') + (f.budget != null ? ln('Budget variance (budget − actual)', money(f.budget - f.actual) + ' ETB') : '') + (f.est ? ln('Actual vs estimate', money(f.actual - f.est) + ' ETB', 'Positive means spent more than estimated; early on this only shows work not yet done') : '') + (m2 ? ln('Estimated cost per m²', f.est ? money(f.est / m2) + ' ETB' : '—') + ln('Actual spent per m²', money(f.actual / m2) + ' ETB') : '<p class="small muted">Set floor area on the project for per-m² figures.</p>') + (f.earned ? ln('Value of verified work (estimate rates)', money(f.earned) + ' ETB', 'Compare with actual spent') : '') + Object.entries(f.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="small">${esc(catName(k))} ${f.actual ? Math.round(v / f.actual * 100) : 0}%${bar(f.actual ? v / f.actual * 100 : 0)}</div>`).join(''); }
  let msec = '<p class="small muted">No material data.</p>'; try { const pr = procurement().filter(r => r.required > 0); if (pr.length) msec = pr.map(r => `<div class="small">${esc(r.m.name)}: used ${fmt(r.used)} of ${fmt(r.required)} ${esc(r.m.unit)} (${Math.round(r.used / r.required * 100)}%)${bar(Math.min(100, r.used / r.required * 100))}${r.used > r.required + 1e-9 ? '<div class="err small">Used more than the BOQ quantity</div>' : ''}</div>`).join('') + '<p class="tag">Compare to the work completed: using 100% of the material at 60% progress means waste or theft.</p>'; } catch { }
  const rec = pOrders().filter(x => x.status === 'received' && x.expected); const del = rec.map(x => { const last = pTx().filter(t => t.orderId === x.id && t.type === 'receipt').map(t => t.date).sort().pop(); return { x, d: last ? Math.round((Date.parse(last) - Date.parse(x.expected)) / 864e5) : null }; }).filter(r => r.d !== null);
  const bySup = {}; for (const r of del) { const s = bySup[r.x.supplierId] = bySup[r.x.supplierId] || { n: 0, late: 0, days: 0 }; s.n++; if (r.d > 0) { s.late++; s.days += r.d; } }
  const ssec = Object.keys(bySup).length ? Object.entries(bySup).map(([id, s]) => ln(esc(supName(id)), `${s.n - s.late} of ${s.n} on time`, s.late ? `late ones averaged ${fmt(s.days / s.late)} days` : '')).join('') : '<p class="small muted">Needs received orders with an expected date.</p>';
  const q = pInsp(), qp = q.filter(i => inspResult(i) === 'passed').length, qf = q.filter(i => inspResult(i) === 'failed').length; const inc = pInc();
  const qsec = ln('Inspections', `${q.length}`, `${qp} passed · ${qf} failed · ${q.length - qp - qf} in progress`) + ln('Safety reports', `${inc.length}`, `${inc.filter(x => x.status === 'open').length} open`) + ln('Near misses', `${inc.filter(x => x.type === 'Near miss').length}`) + (inc.length ? INC_TYPES.map(t => [t, inc.filter(x => x.type === t).length]).filter(x => x[1]).map(([t, n]) => `<div class="small">${t}: ${n}</div>`).join('') : '');
  return `<h1>Analytics</h1><p class="small muted">Only figures that can be worked out from your own records. Where data is missing, nothing is guessed.</p>
  ${sec('Progress & labour', prog)}${sec('Schedule', sched + (dcs.length ? '<div class="tag" style="margin-top:6px">Delay causes recorded</div>' + dcs.map(([k, n]) => `<div class="small">${esc(k)}: ${n}${bar(n / dcs[0][1] * 100)}</div>`).join('') : ''))}${sec('Cost', fsec)}${sec('Material use vs BOQ', msec)}${sec('Supplier delivery', ssec)}${sec('Quality & safety', qsec)}
  <div class="row noprint"><a class="btn" href="#/reports/weekly">Weekly report</a><a class="btn" href="#/reports">All reports</a></div>`;
}

// ================= DESIGN REVISION PAGE =================
function viewRevisions() {
  const g = gate('boq'); if (g) return g; const st = staleItems(); const ds = pDrawings().filter(d => d.rev > 1).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `<a href="#/quality" class="small muted">← Quality & Safety</a><h1>Design revision impact</h1><p class="small muted">BOQ quantities measured from an older drawing revision are not trusted until re-measured and re-confirmed.</p>
  <h2>BOQ items to re-check (${st.length})</h2>${st.map(({ it, st: s }) => `<a class="card" style="display:block" href="#/boqitem/${it.id}"><b>${esc(it.code)} ${esc(it.description)}</b>${s.map(i => `<div class="small err">${esc(i.name)}: measured from Rev ${i.rev}, Rev ${i.latest} exists</div>`).join('')}</a>`).join('') || '<div class="card">No BOQ items depend on a superseded revision.</div>'}
  <h2>Revision history</h2>${ds.map(d => `<a class="card small" style="display:block" href="#/drawing/${d.id}"><b>${esc(d.name)} · Rev ${d.rev}</b> · ${esc((d.createdAt || '').slice(0, 10))}<br>${esc(d.reason || '')}</a>`).join('') || '<p class="muted small">No drawing has been revised yet.</p>'}`;
}

ROUTES.quality = viewQuality; ROUTES.inspection = viewInspection; ROUTES.compliance = viewCompliance; ROUTES.alerts = viewAlerts; ROUTES.analytics = viewAnalytics;
const _vq = ROUTES.quality; ROUTES.quality = t => t === 'revisions' ? viewRevisions() : _vq(t);
for (const k of ['quality', 'compliance']) Object.assign(SECTIONS.find(s => s.k === k), { live: true });
SECTIONS.splice(SECTIONS.findIndex(s => s.k === 'backup'), 0, { k: 'alerts', n: 'Alerts', i: '🔔', a: null, ph: 6, live: true }, { k: 'analytics', n: 'Analytics', i: '📉', a: 'reports', ph: 6, live: true });
