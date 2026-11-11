'use strict';
/* Phase 5a — finance: expenses, payments, contracts, variations, commitments, budget vs actual.
   Rules: an expense is a cost incurred; a payment is cash paid against ONE expense, so nothing is counted twice.
   Payments can never exceed what is owed. Possible duplicate invoices are blocked. Receipts can be made mandatory above a threshold. */

const EXP_CATS = [['material', 'Materials'], ['labour', 'Labour'], ['equipment', 'Equipment'], ['transport', 'Transport'], ['subcontract', 'Subcontractor'], ['fees', 'Permits and fees'], ['tax', 'Taxes'], ['other', 'Other']];
const PAY_METHODS = [['cash', 'Cash'], ['bank', 'Bank transfer'], ['mobile', 'Mobile money'], ['cheque', 'Cheque'], ['other', 'Other']];
const catName = k => EXP_CATS.find(c => c[0] === k)?.[1] || k;
const pEx = () => P(S.expenses), pPay = () => P(S.payments), pCon = () => P(S.contracts), pVar = () => P(S.variations);
const paidOf = e => r2(sum(pPay().filter(p => p.expenseId === e.id), 'amount'));
const outOf = e => Math.max(0, r2(Number(e.amount) - paidOf(e)));
const finSet = () => S.finsettings.find(x => x.id === S.pid && !x.deleted) || { receiptThreshold: null };
const orderValue = o => o.unitPrice != null && o.unitPrice !== '' ? r2(Number(o.qty) * Number(o.unitPrice)) : null;
const monthOf = d => d.slice(0, 7);
const needsReceipt = amt => { const t = pnum(finSet().receiptThreshold); return t != null && t > 0 && Number(amt) >= t; };
const docsFor = (type, id) => P(S.documents).filter(d => d.linkType === type && d.linkId === id);

function contractFigures(c) {
  const vars = pVar().filter(v => v.contractId === c.id && v.status === 'approved'); const extra = r2(sum(vars, 'amount'));
  const revised = r2(Number(c.value) + extra); const expensed = r2(sum(pEx().filter(e => e.contractId === c.id), 'amount'));
  return { extra, revised, expensed, remaining: c.status === 'closed' ? 0 : Math.max(0, r2(revised - expensed)) };
}
function commitments() {
  const rows = []; let unpriced = 0;
  for (const o of pOrders()) {
    if (o.status === 'cancelled') continue; const v = orderValue(o); if (v == null) { unpriced++; continue; }
    const exp = r2(sum(pEx().filter(x => x.orderId === o.id), 'amount')); rows.push({ kind: 'Order', label: `${mname(o.materialId)} · ${supName(o.supplierId)}`, value: v, expensed: exp, remaining: Math.max(0, r2(v - exp)) });
  }
  for (const c of pCon()) { const f = contractFigures(c); rows.push({ kind: 'Contract', label: c.title, value: f.revised, expensed: f.expensed, remaining: f.remaining }); }
  return { rows, unpriced, remaining: r2(sum(rows, 'remaining')) };
}
function fin() {
  const ex = pEx(), pay = pPay(); const actual = r2(sum(ex, 'amount')), paid = r2(sum(pay, 'amount'));
  const byCat = {}, byStage = {}, bySup = {};
  for (const e of ex) { byCat[e.category] = r2((byCat[e.category] || 0) + Number(e.amount)); const k = e.stage || '—'; byStage[k] = r2((byStage[k] || 0) + Number(e.amount)); if (e.supplierId) { const s = bySup[e.supplierId] = bySup[e.supplierId] || { actual: 0, paid: 0 }; s.actual = r2(s.actual + Number(e.amount)); s.paid = r2(s.paid + paidOf(e)); } }
  const budget = pnum(curProject()?.budget); const E = estimate(); const cm = commitments();
  let earned = 0; for (const r of E.rows) if (r.unitRate != null) earned += itemProgress(r.it).ver * r.unitRate;
  const months = {}; for (const p of pay) months[monthOf(p.date)] = r2((months[monthOf(p.date)] || 0) + Number(p.amount));
  return { actual, paid, outstanding: r2(actual - paid), byCat, byStage, bySup, budget, est: E.tot.total, estOpen: E.open, cm, earned: r2(earned), remainingBudget: budget == null ? null : r2(budget - actual), afterCommit: budget == null ? null : r2(budget - actual - cm.remaining), months };
}
function spentKpi() { if (!can('finance')) return `<div class="kpi"><span class="muted small">Actual spent</span><b>Not shown</b><span class="tag">Finance access needed</span></div>`; const f = fin(); return `<div class="kpi"><span class="muted small">Actual spent</span><b>${money(f.actual)}</b><span class="tag">${f.budget != null ? Math.round(f.actual / f.budget * 100) + '% of budget · ' : ''}paid ${money(f.paid)}</span></div>`; }

// ---------- views ----------
const finTabs = cur => `<div class="tabs">${[['overview', 'Overview'], ['expenses', 'Expenses'], ['payments', 'Payments'], ['commitments', 'Commitments']].map(([k, l]) => `<a href="#/finance/${k}" class="${cur === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const payChip = e => { const p = paidOf(e); return p <= 0 ? ['Unpaid', 'High'] : p + 0.005 >= Number(e.amount) ? ['Paid', 'Completed'] : ['Part paid', 'Medium']; };

function viewFinance(tab) {
  const g = gate('finance'); if (g) return g; tab = tab || 'overview'; const e = can('finance', 'e'); const F_ = fin(); let body = '';
  if (tab === 'overview') {
    const over = F_.budget != null && F_.actual > F_.budget; const exposure = r2(F_.actual + F_.cm.remaining);
    const row = (l, v, h) => `<div class="row small"><span>${l}${h ? `<div class="tag">${h}</div>` : ''}</span><b>${v}</b></div>`;
    body = `<div class="card"><b>Where the money stands</b><div class="tag">Each figure below is a different thing and is never added to another.</div>
    ${row('Estimated cost', F_.est ? money(F_.est) + ' ETB' : '—', F_.estOpen ? `${F_.estOpen} BOQ item(s) not priced` : 'From Cost Estimation')}
    ${row('Approved budget', F_.budget != null ? money(F_.budget) + ' ETB' : 'Not set', 'Set on the project')}
    ${row('Committed, not yet invoiced', money(F_.cm.remaining) + ' ETB', F_.cm.unpriced ? `${F_.cm.unpriced} order(s) have no price yet` : 'Open orders and contracts less what is already expensed')}
    ${row('Actual expenses', money(F_.actual) + ' ETB', 'Costs recorded')}
    ${row('Payments made', money(F_.paid) + ' ETB', 'Cash actually paid')}
    ${row('Outstanding balance owed', money(F_.outstanding) + ' ETB', 'Expenses − payments')}</div>
    <div class="card"><b>Against budget</b>${F_.budget == null ? '<p class="small muted">Set the approved budget in the project, or approve it from the estimate.</p>' : `${bar(Math.min(100, F_.actual / F_.budget * 100))}${row('Remaining budget (budget − actual)', money(F_.remainingBudget) + ' ETB')}${row('After open commitments', money(F_.afterCommit) + ' ETB')}${row('Projected final cost (actual + commitments)', money(exposure) + ' ETB', 'Not a forecast of future unbought work')}${over ? '<div class="err">⚠ Actual expenses exceed the approved budget.</div>' : F_.afterCommit < 0 ? '<div class="err" style="color:var(--high)">⚠ Commitments would take you over budget.</div>' : ''}`}
    ${e && F_.est ? `<div style="margin-top:8px"><button class="sm" data-a="approve-budget">Set budget = current estimate</button></div>` : ''}</div>
    <div class="card"><b>Value of verified work</b><p class="small">${money(F_.earned)} ETB <span class="muted">at estimate rates, from verified quantities</span></p>${F_.actual > 0 && F_.earned > 0 ? `<p class="small">Spent so far per ETB of work done: <b>${(F_.actual / F_.earned).toFixed(2)}</b> <span class="muted">(below 1 is good; above 1 means spending is ahead of verified work)</span></p>` : ''}<p class="tag">Indicative only: stocked materials and advance payments are spent before they are built.</p></div>
    ${Object.keys(F_.byCat).length ? `<h2>Actual by cost type</h2><div class="card">${Object.entries(F_.byCat).map(([k, v]) => row(catName(k), money(v))).join('')}</div>` : ''}
    ${Object.keys(F_.byStage).length ? `<h2>Actual by stage</h2><div class="card">${Object.entries(F_.byStage).sort().map(([k, v]) => row(k === '—' ? 'Not assigned' : k + ' · ' + (BOQ_SECTIONS.find(s => s[0] === k)?.[1] || ''), money(v))).join('')}</div>` : ''}
    ${Object.keys(F_.bySup).length ? `<h2>Supplier balances</h2><div class="card">${Object.entries(F_.bySup).map(([id, s]) => row(esc(supName(id)), `${money(s.actual - s.paid)} owed`, `invoiced ${money(s.actual)} · paid ${money(s.paid)}`)).join('')}</div>` : ''}
    ${Object.keys(F_.months).length ? `<h2>Cash paid by month</h2><div class="card">${Object.entries(F_.months).sort().slice(-6).map(([k, v]) => row(k, money(v))).join('')}</div>` : ''}
    ${(() => { const due = pEx().filter(x => outOf(x) > 0 && x.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6); return due.length ? `<h2>Upcoming payments due</h2>${due.map(x => `<div class="card small row"><span>${esc(x.description)} · due ${esc(x.dueDate)}${daysUntil(x.dueDate) < 0 ? ' <span class="chip Critical">overdue</span>' : ''}</span><b>${money(outOf(x))}</b></div>`).join('')}` : ''; })()}
    <div class="row" style="justify-content:flex-start">${e ? `<button class="sm" data-a="fin-settings">Receipt rule</button>` : ''}<a class="btn sm" href="#/reports/finance">Finance report</a></div>`;
  } else if (tab === 'expenses') {
    const ex = pEx().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    body = `<div class="row"><span class="muted small">${ex.length} expense(s) · ${money(F_.actual)} ETB</span>${e ? `<button class="sm primary" data-a="new-expense">+ Expense</button>` : ''}</div>${ex.map(x => { const [l, c] = payChip(x); const dc = docsFor('expense', x.id).length; return `<div class="card"><div class="row"><b>${esc(x.description)}</b><span class="chip ${c}">${l}</span></div><div>${money(x.amount)} ETB <span class="muted small">· ${esc(catName(x.category))}</span></div><div class="muted small">${esc(x.date)}${x.supplierId ? ' · ' + esc(supName(x.supplierId)) : ''}${x.invoiceRef ? ' · invoice ' + esc(x.invoiceRef) : ''}${x.stage ? ' · stage ' + esc(x.stage) : ''}<br>Paid ${money(paidOf(x))} · owed ${money(outOf(x))}${x.dueDate ? ' · due ' + esc(x.dueDate) : ''}<br>${dc ? `${dc} receipt/document(s): ${docsFor('expense', x.id).map(d => `<a href="#/doc/${d.id}"><u>open</u></a>`).join(' ')}` : (needsReceipt(x.amount) ? '<span style="color:var(--crit)">Receipt missing</span>' : 'No receipt attached')}</div>
      ${e ? `<div style="margin-top:8px">${outOf(x) > 0 ? `<button class="sm primary" data-a="new-payment" data-id="${x.id}">Record payment</button> ` : ''}<button class="sm" data-a="edit-expense" data-id="${x.id}">Edit</button> <button class="sm danger" data-a="del-expense" data-id="${x.id}">Delete</button></div>` : ''}</div>`; }).join('') || '<p class="muted">No expenses yet.</p>'}`;
  } else if (tab === 'payments') {
    const pay = pPay().sort((a, b) => b.date.localeCompare(a.date));
    body = `<p class="small muted">Payments are always against an expense. Record them from the expense card so nothing is counted twice.</p>${pay.map(p => { const x = S.expenses.find(v => v.id === p.expenseId); return `<div class="card"><div class="row"><b>${money(p.amount)} ETB</b><span class="chip Completed">${esc(PAY_METHODS.find(m => m[0] === p.method)?.[1] || p.method)}</span></div><div class="small">${esc(x?.description || 'Removed expense')}${x?.supplierId ? ' · ' + esc(supName(x.supplierId)) : ''}</div><div class="muted small">${esc(p.date)}${p.reference ? ' · ref ' + esc(p.reference) : ''} · ${esc(userName(p.by))}${docsFor('payment', p.id).length ? ' · ' + docsFor('payment', p.id).map(d => `<a href="#/doc/${d.id}"><u>receipt</u></a>`).join(' ') : ''}</div></div>`; }).join('') || '<p class="muted">No payments yet.</p>'}`;
  } else {
    const cs = pCon(); const vs = pVar().sort((a, b) => b.date.localeCompare(a.date)); const os = pOrders().filter(o => o.status !== 'cancelled');
    body = `<div class="row"><h2 style="margin:0">Contracts</h2>${e ? `<button class="sm primary" data-a="new-contract">+ Contract</button>` : ''}</div>${cs.map(c => { const f = contractFigures(c); return `<div class="card"><div class="row"><b>${esc(c.title)}</b><span class="chip ${c.status === 'closed' ? 'Low' : 'Medium'}">${c.status === 'closed' ? 'Closed' : 'Active'}</span></div><div class="small muted">${esc(c.party)}${c.date ? ' · ' + esc(c.date) : ''}${c.scope ? '<br>' + esc(c.scope) : ''}</div><div class="small">Value ${money(c.value)} · approved variations ${money(f.extra)} · <b>revised ${money(f.revised)}</b><br>Invoiced ${money(f.expensed)} · remaining ${money(f.remaining)}</div>${docsFor('contract', c.id).map(d => `<a class="small" href="#/doc/${d.id}"><u>${esc(d.name)}</u></a> `).join('')}${e ? `<div style="margin-top:8px"><button class="sm" data-a="new-variation" data-id="${c.id}">+ Variation</button> <button class="sm" data-a="edit-contract" data-id="${c.id}">Edit</button></div>` : ''}</div>`; }).join('') || '<p class="muted small">No contracts.</p>'}
    <h2>Variations</h2>${vs.map(v => { const c = S.contracts.find(x => x.id === v.contractId); const can2 = can('finance', 'e') && v.status === 'proposed'; return `<div class="card"><div class="row"><b>${esc(v.title)}</b><span class="chip ${v.status === 'approved' ? 'Completed' : v.status === 'rejected' ? 'Critical' : 'High'}">${v.status}</span></div><div class="small">${v.amount >= 0 ? '+' : ''}${money(v.amount)} ETB on ${esc(c?.title || 'removed contract')}<br><span class="muted">${esc(v.date)} · ${esc(v.reason || '')} · proposed by ${esc(userName(v.by))}</span></div>${can2 ? `<div style="margin-top:8px"><button class="sm primary" data-a="approve-variation" data-id="${v.id}">Approve</button> <button class="sm" data-a="reject-variation" data-id="${v.id}">Reject</button></div>` : ''}</div>`; }).join('') || '<p class="muted small">None.</p>'}
    <h2>Purchase orders</h2>${os.map(o => { const v = orderValue(o); return `<div class="card small row"><div><b>${esc(mname(o.materialId))}</b><div class="muted">${fmt(o.qty)} · ${esc(supName(o.supplierId))} · ${o.status}</div></div><div style="text-align:right">${v != null ? `<b>${money(v)}</b><div class="tag">${money(o.unitPrice)} each</div>` : '<span class="muted">No price</span>'}${e ? `<div><button class="sm" data-a="price-order" data-id="${o.id}">${v != null ? 'Change' : 'Set'} price</button></div>` : ''}</div></div>`; }).join('') || '<p class="muted small">No orders. Create orders under Materials & Inventory.</p>'}
    <div class="card small"><b>Committed, not yet invoiced: ${money(F_.cm.remaining)} ETB</b>${F_.cm.rows.map(r => `<div class="row"><span>${esc(r.kind)}: ${esc(r.label)}</span><span>${money(r.remaining)}</span></div>`).join('')}</div>`;
  }
  return `<h1>Budget & Finance</h1>${finTabs(tab)}${body}`;
}

// ---------- forms ----------
const receiptInput = '<label>Receipt or invoice (photo or PDF)<input type="file" name="receipts" accept="image/*,application/pdf" multiple></label>';
function expenseForm(x) {
  const orders = pOrders().filter(o => o.status !== 'cancelled'); const thr = pnum(finSet().receiptThreshold);
  return `<h1>${x ? 'Edit expense' : 'New expense'}</h1><form data-f="expense"><input type="hidden" name="id" value="${x?.id || ''}">
  ${fld('Description', 'description', x?.description, { req: 1 })}${sel('Cost type', 'category', EXP_CATS, x?.category || 'material')}${fld('Total amount (ETB, including any tax)', 'amount', x?.amount, { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}
  ${fld('Date', 'date', x?.date || todayStr(), { type: 'date', req: 1 })}${sel('Supplier / payee (optional)', 'supplierId', [['', '—'], ...sups().map(s => [s.id, s.name])], x?.supplierId || '')}${fld('Invoice or receipt number', 'invoiceRef', x?.invoiceRef)}
  ${sel('Stage (optional)', 'stage', [['', '—'], ...BOQ_SECTIONS.map(([k, n]) => [k, k + ' · ' + n])], x?.stage || '')}
  ${sel('Against purchase order (optional)', 'orderId', [['', '—'], ...orders.map(o => [o.id, `${mname(o.materialId)} · ${fmt(o.qty)} · ${supName(o.supplierId)}`])], x?.orderId || '')}
  ${sel('Against contract (optional)', 'contractId', [['', '—'], ...pCon().map(c => [c.id, c.title])], x?.contractId || '')}${fld('Payment due date (optional)', 'dueDate', x?.dueDate, { type: 'date' })}
  ${receiptInput}${thr ? `<p class="small muted">A receipt is required for amounts of ${money(thr)} ETB or more.</p>` : ''}
  ${x ? '' : chk('Paid in full now', 'payNow', false) + sel('Payment method (if paid now)', 'method', PAY_METHODS, 'cash')}
  <div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
}
const paymentForm = id => { const x = S.expenses.find(v => v.id === id); return `<h1>Record payment</h1><p class="small muted">${esc(x.description)} · owed ${money(outOf(x))} ETB</p><form data-f="payment"><input type="hidden" name="expenseId" value="${id}">${fld('Amount paid (ETB)', 'amount', outOf(x), { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Date', 'date', todayStr(), { type: 'date', req: 1 })}${sel('Method', 'method', PAY_METHODS, 'cash')}${fld('Reference (cheque, transfer or mobile money number)', 'reference')}${receiptInput}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`; };
const contractForm = c => `<h1>${c ? 'Edit contract' : 'New contract'}</h1><form data-f="contract"><input type="hidden" name="id" value="${c?.id || ''}">${fld('Title', 'title', c?.title, { req: 1 })}${fld('Contractor or supplier', 'party', c?.party, { req: 1 })}${fld('Contract value (ETB)', 'value', c?.value, { type: 'number', req: 1, attrs: 'min="0" step="any" inputmode="decimal"' })}${fld('Date', 'date', c?.date || todayStr(), { type: 'date' })}${fld('Scope', 'scope', c?.scope)}${sel('Status', 'status', [['active', 'Active'], ['closed', 'Closed']], c?.status || 'active')}<label>Contract document (optional)<input type="file" name="receipts" accept="image/*,application/pdf"></label><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
const variationForm = id => `<h1>New variation</h1><form data-f="variation">${sel('Contract', 'contractId', pCon().map(c => [c.id, c.title]), id)}${fld('Title', 'title', '', { req: 1 })}${fld('Amount (ETB; negative for omissions)', 'amount', '', { type: 'number', req: 1, attrs: 'step="any" inputmode="decimal"' })}${fld('Reason', 'reason', '', { req: 1 })}${fld('Date', 'date', todayStr(), { type: 'date', req: 1 })}<p class="small muted">It changes the contract value only after someone else approves it.</p><div class="err"></div><div class="row">${cancelBtn}<button class="primary">Submit</button></div></form>`;
function orderPriceForm(id) {
  const o = S.orders.find(x => x.id === id); const m = S.materials.find(x => x.id === o.materialId); const city = pcity();
  const qs = quotes().filter(q => q.materialId === o.materialId && q.city === city && q.supplierId === o.supplierId && !['Expired quotation'].includes(quoteStatus(q, quotes().filter(z => z.materialId === o.materialId))));
  return `<h1>Price this order</h1><p class="small muted">${esc(mname(o.materialId))} · ${fmt(o.qty)} ${esc(m?.unit || '')} · ${esc(supName(o.supplierId))}</p><form data-f="orderprice"><input type="hidden" name="id" value="${id}">
  ${sel('Use a quotation', 'quoteId', [['', 'Type a price instead'], ...qs.map(q => [q.id, `${money(delivered(q))} delivered · ${q.date}`])], o.quoteId || '')}${fld('Unit price (ETB, delivered), if no quotation', 'unitPrice', o.quoteId ? '' : o.unitPrice ?? '', { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`;
}

// ---------- handlers ----------
const needF = () => { if (!can('finance', 'e')) throw new Error('Your role cannot edit finance records.'); };
F.expense = async (d, form) => {
  needF(); const amount = reqNum(d.amount, 'Amount'); if (amount <= 0) throw new Error('Amount must be more than zero.'); if (!trim(d.description)) throw new Error('Description is required.');
  if (!d.date || d.date > todayStr()) throw new Error('Date cannot be in the future.'); const old = d.id ? S.expenses.find(x => x.id === d.id) : null;
  if (old && amount + 1e-9 < paidOf(old)) throw new Error(`Amount cannot be lower than the ${money(paidOf(old))} already paid.`);
  if (d.supplierId && trim(d.invoiceRef)) { const dup = pEx().find(x => x.id !== d.id && x.supplierId === d.supplierId && trim(x.invoiceRef).toLowerCase() === trim(d.invoiceRef).toLowerCase()); if (dup) throw new Error(`Invoice ${trim(d.invoiceRef)} from this supplier is already recorded (${money(dup.amount)} on ${dup.date}). Not saved, to avoid counting it twice.`); }
  const files = new FormData(form).getAll('receipts').filter(f => f && f.size);
  if (needsReceipt(amount) && !files.length && !(old && docsFor('expense', old.id).length)) throw new Error('A receipt or invoice is required for this amount.');
  const rec = await save('expenses', { ...(old || {}), id: d.id || undefined, projectId: S.pid, description: trim(d.description), category: d.category, amount: r2(amount), date: d.date, supplierId: d.supplierId, invoiceRef: trim(d.invoiceRef), stage: d.stage, orderId: d.orderId, contractId: d.contractId, dueDate: d.dueDate, by: old?.by || S.user.id }, `${old ? 'Edited' : 'Recorded'} expense ${trim(d.description)}: ${money(amount)}`);
  for (const f of files) await saveDoc(f, { category: 'Invoices', linkType: 'expense', linkId: rec.id, name: `${trim(d.description)} receipt`, note: trim(d.invoiceRef) });
  if (!old && d.payNow) await save('payments', { projectId: S.pid, expenseId: rec.id, amount: r2(amount), date: d.date, method: d.method, reference: '', by: S.user.id }, `Payment ${money(amount)} for ${trim(d.description)}`);
};
F.payment = async (d, form) => {
  needF(); const x = S.expenses.find(v => v.id === d.expenseId && v.projectId === S.pid && !v.deleted); if (!x) throw new Error('Expense not found.');
  const amount = reqNum(d.amount, 'Amount'); if (amount <= 0) throw new Error('Amount must be more than zero.'); if (!d.date || d.date > todayStr()) throw new Error('Date cannot be in the future.');
  if (amount > outOf(x) + 0.005) throw new Error(`Only ${money(outOf(x))} ETB is owed on this expense. Paying more would overpay it.`);
  const files = new FormData(form).getAll('receipts').filter(f => f && f.size); if (needsReceipt(amount) && !files.length) throw new Error('A receipt is required for this amount.');
  const p = await save('payments', { projectId: S.pid, expenseId: x.id, amount: r2(amount), date: d.date, method: d.method, reference: trim(d.reference), by: S.user.id }, `Payment ${money(amount)} for ${x.description}`);
  for (const f of files) await saveDoc(f, { category: 'Payment receipts', linkType: 'payment', linkId: p.id, name: `Payment receipt ${x.description}` });
};
F.contract = async (d, form) => {
  needF(); const value = reqNum(d.value, 'Value'); if (!trim(d.title) || !trim(d.party)) throw new Error('Title and contractor are required.'); const old = d.id ? S.contracts.find(x => x.id === d.id) : null;
  const rec = await save('contracts', { ...(old || {}), id: d.id || undefined, projectId: S.pid, title: trim(d.title), party: trim(d.party), value: r2(value), date: d.date, scope: trim(d.scope), status: d.status }, `${old ? 'Edited' : 'Added'} contract ${trim(d.title)}`);
  for (const f of new FormData(form).getAll('receipts').filter(f => f && f.size)) await saveDoc(f, { category: 'Contracts', linkType: 'contract', linkId: rec.id, name: trim(d.title) });
};
F.variation = async d => { needF(); const amt = Number(d.amount); if (d.amount === '' || !isFinite(amt) || amt === 0) throw new Error('Amount must be a number other than zero.'); if (!trim(d.title) || !trim(d.reason)) throw new Error('Title and reason are required.'); if (!d.contractId) throw new Error('Choose a contract.'); await save('variations', { projectId: S.pid, contractId: d.contractId, title: trim(d.title), amount: r2(amt), reason: trim(d.reason), date: d.date, status: 'proposed', by: S.user.id }, `Variation proposed: ${trim(d.title)}`); };
F.orderprice = async d => { needF(); const o = S.orders.find(x => x.id === d.id); let price = null, qid = ''; if (d.quoteId) { const q = S.quotes.find(x => x.id === d.quoteId); price = delivered(q); qid = q.id; } else { price = reqNum(d.unitPrice, 'Unit price'); } await save('orders', { ...o, unitPrice: r2(price), quoteId: qid }, `Priced order ${mname(o.materialId)}: ${money(price)} each`); };
F.finset = async d => { needF(); const t = d.threshold === '' ? null : reqNum(d.threshold, 'Threshold'); const old = S.finsettings.find(x => x.id === S.pid); await save('finsettings', { ...(old || {}), id: S.pid, projectId: S.pid, receiptThreshold: t }, 'Changed receipt rule'); };

Object.assign(A, {
  'new-expense': () => openSheet(expenseForm()), 'edit-expense': id => openSheet(expenseForm(S.expenses.find(x => x.id === id))), 'new-payment': id => openSheet(paymentForm(id)),
  async 'del-expense'(id) { needF(); const x = S.expenses.find(v => v.id === id); if (paidOf(x) > 0) throw new Error('This expense has payments. Delete the payments first (not allowed in this version) or edit the expense instead.'); if (!confirm('Delete this expense?')) return; await save('expenses', { ...x, deleted: true }, `Deleted expense ${x.description}`); await render(); },
  'new-contract': () => openSheet(contractForm()), 'edit-contract': id => openSheet(contractForm(S.contracts.find(x => x.id === id))), 'new-variation': id => openSheet(variationForm(id)), 'price-order': id => openSheet(orderPriceForm(id)),
  async 'approve-variation'(id) { needF(); const v = S.variations.find(x => x.id === id); if (v.by === S.user.id && memberCount() > 1) throw new Error('Another person must approve a variation you proposed.'); if (!confirm('Approve this variation? It changes the contract value.')) return; await save('variations', { ...v, status: 'approved', approvedBy: S.user.id, approvedAt: new Date().toISOString() }, `Approved variation ${v.title}`); await render(); },
  async 'reject-variation'(id) { needF(); const v = S.variations.find(x => x.id === id); await save('variations', { ...v, status: 'rejected', approvedBy: S.user.id }, `Rejected variation ${v.title}`); await render(); },
  async 'approve-budget'() {
    needF(); const E = estimate(); const p = curProject(); if (!E.tot.total) throw new Error('There is no priced estimate yet.');
    if (!confirm(`Set the approved budget to ${money(E.tot.total)} ETB${E.open ? ` (${E.open} BOQ item(s) are not priced and not included)` : ''}? The previous budget (${p.budget != null ? money(p.budget) : 'none'}) stays in the activity log.`)) return;
    await save('projects', { ...p, budget: E.tot.total }, `Approved budget ${money(E.tot.total)} (was ${p.budget != null ? money(p.budget) : 'none'})`); await render();
  },
  'fin-settings'() { openSheet(`<h1>Receipt rule</h1><form data-f="finset">${fld('Require a receipt for amounts of (ETB) or more. Leave blank for no rule.', 'threshold', finSet().receiptThreshold ?? '', { type: 'number', attrs: 'min="0" step="any" inputmode="decimal"' })}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Save</button></div></form>`); }
});
ROUTES.finance = viewFinance; Object.assign(SECTIONS.find(s => s.k === 'finance'), { live: true });
DASH_EXT.money = () => { if (!can('finance')) return ''; const f = fin(); const t = pEx().filter(x => x.date === todayStr()); return `<a class="card" style="display:block" href="#/finance"><b>Money</b><div class="muted small">Spent today ${money(sum(t, 'amount'))} · outstanding ${money(f.outstanding)} · actual ${money(f.actual)}${f.budget != null ? ' of ' + money(f.budget) + ' budget' : ''}</div></a>`; };
function dayExpenses(d) { return can('finance') ? pEx().filter(x => x.date === d).map(x => `${x.description}: ${money(x.amount)} ETB (${catName(x.category)})`) : null; }
