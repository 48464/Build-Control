'use strict';
/* ui.js — replaces every native <select> with a modern bottom-sheet picker.
   The native <select> stays in the DOM (hidden), so forms, FormData and change handlers keep working. */
(function () {
  const CHEV = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  const TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const picker = document.createElement('dialog'); picker.id = 'picker'; document.body.appendChild(picker);
  let current = null;

  function labelOf(sel) {
    const lab = sel.closest('label'); if (!lab) return sel.getAttribute('aria-label') || 'Choose';
    const fl = lab.querySelector(':scope>.fl'); if (fl) return fl.textContent.trim();
    let t = ''; lab.childNodes.forEach(n => { if (n.nodeType === 3) t += n.textContent; }); return t.trim() || sel.getAttribute('aria-label') || 'Choose';
  }
  function sync(sel, btn) {
    const o = sel.selectedOptions[0]; const txt = o ? o.textContent.trim() : '';
    btn.firstElementChild.textContent = txt || 'Choose…';
    btn.classList.toggle('ph', !txt || (o && o.value === '' && /^(—|-)?$/.test(txt)));
    btn.disabled = sel.disabled;
  }
  function enhance(sel) {
    if (sel.dataset.dd) return; sel.dataset.dd = '1';
    sel.classList.add('dd-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const wrap = document.createElement('div'); wrap.className = 'dd';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn'; btn.innerHTML = '<span></span>' + CHEV;
    btn.setAttribute('aria-haspopup', 'listbox');
    const aria = sel.getAttribute('aria-label'); if (aria) btn.setAttribute('aria-label', aria);
    sel.after(wrap); wrap.append(btn, sel); // keep select inside wrapper so label still contains it
    sync(sel, btn);
    btn.addEventListener('click', () => open(sel, btn));
    sel.addEventListener('change', () => sync(sel, btn));
    new MutationObserver(() => sync(sel, btn)).observe(sel, { attributes: true, childList: true, subtree: true });
  }
  function open(sel, btn) {
    current = { sel, btn };
    const opts = [...sel.options]; const many = opts.length > 8;
    picker.innerHTML = `<div class="pk-head"><div class="pk-grab"></div><div class="pk-title">${esc(labelOf(sel))}</div>${many ? '<input class="pk-search" type="search" placeholder="Search…" autocomplete="off" aria-label="Search options">' : ''}</div><div class="pk-list" role="listbox"></div>`;
    const list = picker.querySelector('.pk-list');
    const draw = q => {
      const f = opts.filter(o => !q || o.textContent.toLowerCase().includes(q.toLowerCase()));
      list.innerHTML = f.length ? f.map(o => `<button type="button" class="pk-opt ${o.selected ? 'sel' : ''}" role="option" aria-selected="${o.selected}" data-i="${opts.indexOf(o)}" ${o.disabled ? 'disabled' : ''}><span>${esc(o.textContent.trim() || '—')}</span>${o.selected ? TICK : ''}</button>`).join('') : '<div class="pk-empty">No matches</div>';
    };
    draw(''); picker.showModal(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // keep the phone keyboard closed until the user taps Search
    const s = picker.querySelector('.pk-search'); if (s) s.addEventListener('input', () => draw(s.value));
    const selected = list.querySelector('.sel'); if (selected) selected.scrollIntoView({ block: 'center' });
  }
  picker.addEventListener('click', e => {
    if (e.target === picker) return picker.close();
    const b = e.target.closest('.pk-opt'); if (!b || !current) return;
    const { sel, btn } = current; const changed = sel.selectedIndex !== Number(b.dataset.i);
    sel.selectedIndex = Number(b.dataset.i); picker.close(); sync(sel, btn);
    if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    btn.focus({ preventScroll: true });
  });
  picker.addEventListener('close', () => { current = null; });

  // short labels sit on the field's border; long explanatory labels stay above the field
  function floatLabel(lab) {
    if (lab.classList.contains('fl-on') || lab.classList.contains('chk') || lab.dataset.nofl) return;
    const ctl = [...lab.children].find(c => c.matches('input:not([type=checkbox]):not([type=hidden]):not([type=file]),textarea,.dd,select'));
    const t = [...lab.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (!ctl || !t || t.textContent.trim().length > 40) return;
    const span = document.createElement('span'); span.className = 'fl'; span.textContent = t.textContent.trim(); t.replaceWith(span); lab.classList.add('fl-on');
  }
  const scan = root => { if (!root.querySelectorAll) return; root.querySelectorAll('select:not([data-dd])').forEach(enhance); root.querySelectorAll('label:not(.fl-on)').forEach(floatLabel); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches('select:not([data-dd])')) enhance(n); scan(n); if (n.matches('label')) floatLabel(n); } }))).observe(document.body, { childList: true, subtree: true });
  scan(document);
})();
