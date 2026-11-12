'use strict';
/* view.js — mobile/desktop view switch, desktop sidebar, quick-add button and accessibility options.
   One tap on the screen icon in the top bar switches between mobile and desktop view. Settings has Auto / Mobile / Desktop. */
(function () {
  const root = document.documentElement;
  const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
  const T = s => (typeof window.__tr === 'function' ? window.__tr(s) : s);
  const $ = (q, r) => (r || document).querySelector(q);
  const mq = window.matchMedia ? matchMedia('(min-width: 900px)') : { matches: false };
  const vp = document.querySelector('meta[name=viewport]');
  const VP_DEFAULT = vp ? vp.content : '';
  let mode = get('viewMode', 'auto'); if (!['auto', 'mobile', 'desktop'].includes(mode)) mode = 'auto';

  const layout = () => mode === 'desktop' ? 'desktop' : mode === 'mobile' ? 'mobile' : (mq.matches ? 'desktop' : 'mobile');

  function applyView() {
    // Desktop view on a phone: draw the page 1100px wide and let the browser scale it down (pinch to zoom still works).
    const phone = Math.min(screen.width || 9999, screen.height || 9999) < 700;
    if (vp) vp.content = (mode === 'desktop' && phone) ? 'width=1100,viewport-fit=cover' : VP_DEFAULT;
    root.dataset.layout = layout(); root.dataset.viewmode = mode;
    decorate();
  }
  function applyA11y() {
    root.dataset.contrast = get('a11yContrast', '0') === '1' ? 'high' : 'normal';
    root.dataset.motion = get('a11yMotion', '0') === '1' ? 'reduce' : 'normal';
    root.dataset.targets = get('a11yTargets', '0') === '1' ? 'large' : 'normal';
    root.dataset.side = get('sideCollapsed', '0') === '1' ? 'collapsed' : 'open';
  }

  // ----- top bar toggle -----
  const ICON_DESKTOP = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  const ICON_PHONE = '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';
  function decorate() {
    const top = $('#top'); if (!top) return;
    let b = top.querySelector('[data-view-toggle]');
    const L = layout();
    const label = T(L === 'desktop' ? 'Switch to mobile view' : 'Switch to desktop view');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'iconbtn'; b.setAttribute('data-view-toggle', ''); top.appendChild(b); }
    b.setAttribute('aria-label', label); b.title = label; b.innerHTML = L === 'desktop' ? ICON_PHONE : ICON_DESKTOP;
  }
  function toggle() {
    mode = layout() === 'desktop' ? 'mobile' : 'desktop'; put('viewMode', mode); applyView();
    const sel = $('#pref-view'); if (sel) sel.value = mode;
    if (typeof toast === 'function') toast(mode === 'desktop' ? 'Desktop view' : 'Mobile view');
  }

  // ----- desktop sidebar -----
  const ALIAS = { drawing: 'drawings', material: 'suppliers', rate: 'cost', progitem: 'progress', inspection: 'quality', doc: 'files' };
  function currentKey() {
    const parts = (location.hash || '#/dashboard').replace(/^#\//, '').split('/');
    let k = parts[0] || 'dashboard'; if (k === 's') return parts[1] || '';
    return ALIAS[k] || k;
  }
  function markActive() {
    const k = currentKey();
    document.querySelectorAll('#side a[data-k]').forEach(a => { const on = a.dataset.k === k; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.querySelectorAll('#bottom a').forEach(a => { if (a.classList.contains('on')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function side() {
    const app = $('#app'); if (!app) return;
    let a = $('#side');
    if (!a) { a = document.createElement('aside'); a.id = 'side'; a.setAttribute('aria-label', 'Sections'); app.insertBefore(a, $('#main')); }
    if (typeof SECTIONS === 'undefined' || typeof can !== 'function' || !(typeof curProject === 'function' && curProject())) { a.innerHTML = ''; return; }
    const items = SECTIONS.filter(s => s.a === null || can(s.a));
    const link = (k, href, ico, name) => `<a href="${href}" data-k="${k}" title="${esc(name)}"><span class="si" aria-hidden="true">${ico}</span><span class="sl">${esc(name)}</span></a>`;
    const col = root.dataset.side === 'collapsed';
    a.innerHTML = `<div class="side-brand"><span class="logo" aria-hidden="true">🏗️</span><b class="sl">EthioBuild</b></div>
      <nav class="side-nav" aria-label="Sections">${link('guide', '#/guide', '📖', 'Guide')}${items.map(s => link(s.k, '#/' + (s.live ? s.k : 's/' + s.k), s.i, s.n)).join('')}</nav>
      <button type="button" class="side-toggle" data-side-toggle aria-label="${T(col ? 'Expand menu' : 'Collapse menu')}" title="${T(col ? 'Expand menu' : 'Collapse menu')}"><svg viewBox="0 0 24 24"><path d="${col ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}"/></svg><span class="sl">${T('Collapse menu')}</span></button>`;
    markActive();
  }

  // ----- quick add -----
  function proxy(action) { const b = document.createElement('button'); b.dataset.a = action; b.hidden = true; document.body.appendChild(b); b.click(); setTimeout(() => b.remove(), 0); }
  function fab() {
    const app = $('#app'); if (!app) return;
    let f = $('#fab'); if (!f) { f = document.createElement('div'); f.id = 'fab'; app.appendChild(f); }
    if (!(typeof curProject === 'function' && curProject()) || typeof can !== 'function') { f.innerHTML = ''; return; }
    const fin = (SECTIONS.find(s => s.k === 'finance') || {}).a;
    const items = [];
    try { if (can('tasks', 'e')) items.push(['task', '✅', 'New task']); } catch { }
    try { if (fin && can(fin, 'e')) items.push(['expense', '💰', 'New expense']); } catch { }
    items.push(['work', '📈', 'Record work'], ['file', '📎', 'Files & photos']);
    f.innerHTML = `<div class="fab-menu" role="menu" hidden>${items.map(([k, i, n]) => `<button type="button" role="menuitem" class="fab-item" data-fab="${k}"><span aria-hidden="true">${i}</span>${n}</button>`).join('')}</div>
      <button type="button" class="fab-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Quick add"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
  }
  function closeFab() { const f = $('#fab'); if (!f) return; const m = $('.fab-menu', f), b = $('.fab-btn', f); if (m) m.hidden = true; if (b) { b.setAttribute('aria-expanded', 'false'); } f.classList.remove('open'); }
  function fabAction(k) {
    closeFab();
    if (k === 'task') proxy('new-task');
    else if (k === 'expense') { if (!/^#\/finance/.test(location.hash)) location.hash = '#/finance'; setTimeout(() => proxy('new-expense'), 350); }
    else if (k === 'work') location.hash = '#/progress';
    else if (k === 'file') location.hash = '#/files';
  }

  // ----- accessibility helpers -----
  function skipLink() {
    if ($('.skip')) return;
    const s = document.createElement('button'); s.type = 'button'; s.className = 'skip'; s.textContent = T('Skip to content');
    s.addEventListener('click', () => { const m = $('#main'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } });
    document.body.insertBefore(s, document.body.firstChild);
  }

  // ----- settings card part -----
  window.viewPrefsHtml = function () {
    const ck = k => get(k, '0') === '1' ? 'checked' : '';
    return `<label>Layout<select id="pref-view">${[['auto', 'Auto (by screen width)'], ['mobile', 'Mobile view'], ['desktop', 'Desktop view']].map(([v, l]) => `<option value="${v}" ${v === mode ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="muted small" style="margin:2px 0 4px">The screen icon in the top bar switches between mobile and desktop view in one tap.</div>
    <h2 style="margin:14px 0 6px">Accessibility</h2>
    <label class="chk"><input type="checkbox" id="pref-contrast" ${ck('a11yContrast')}>High contrast</label>
    <label class="chk"><input type="checkbox" id="pref-motion" ${ck('a11yMotion')}>Reduce motion</label>
    <label class="chk"><input type="checkbox" id="pref-targets" ${ck('a11yTargets')}>Larger buttons and tap areas</label>`;
  };
  window.viewReset = function () { mode = 'auto'; ['viewMode', 'a11yContrast', 'a11yMotion', 'a11yTargets', 'sideCollapsed'].forEach(k => put(k, k === 'viewMode' ? 'auto' : '0')); applyA11y(); applyView(); side(); };

  // ----- events -----
  document.addEventListener('click', e => {
    const t = e.target; if (!t.closest) return;
    if (t.closest('[data-view-toggle]')) { toggle(); return; }
    if (t.closest('[data-side-toggle]')) { put('sideCollapsed', root.dataset.side === 'collapsed' ? '0' : '1'); applyA11y(); side(); return; }
    const fi = t.closest('[data-fab]'); if (fi) { fabAction(fi.dataset.fab); return; }
    const fb = t.closest('.fab-btn');
    if (fb) { const f = $('#fab'), m = $('.fab-menu', f), open = m.hidden; m.hidden = !open; fb.setAttribute('aria-expanded', String(open)); f.classList.toggle('open', open); if (open) { const first = m.querySelector('button'); if (first) first.focus(); } return; }
    if (!t.closest('#fab')) closeFab();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeFab(); const b = $('.fab-btn'); if (b && document.activeElement && document.activeElement.closest('#fab')) b.focus(); } });
  document.addEventListener('change', e => {
    const id = e.target && e.target.id;
    if (id === 'pref-view') { mode = ['auto', 'mobile', 'desktop'].includes(e.target.value) ? e.target.value : 'auto'; put('viewMode', mode); applyView(); }
    else if (id === 'pref-contrast') { put('a11yContrast', e.target.checked ? '1' : '0'); applyA11y(); }
    else if (id === 'pref-motion') { put('a11yMotion', e.target.checked ? '1' : '0'); applyA11y(); }
    else if (id === 'pref-targets') { put('a11yTargets', e.target.checked ? '1' : '0'); applyA11y(); }
  });
  window.addEventListener('hashchange', () => setTimeout(markActive, 0));
  window.addEventListener('resize', () => { if (mode === 'auto') { const L = layout(); if (root.dataset.layout !== L) applyView(); } });
  if (mq.addEventListener) mq.addEventListener('change', () => { if (mode === 'auto') applyView(); }); else if (mq.addListener) mq.addListener(() => { if (mode === 'auto') applyView(); });
  window.addEventListener('scroll', () => { const t = $('#top'); if (t) t.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });

  // draw the extras after every page render
  const orig = window.renderShell;
  if (typeof orig === 'function') {
    window.renderShell = async function (...a) {
      const r = await orig.apply(this, a);
      try { decorate(); side(); fab(); markActive(); const m = $('#main'); if (m) m.setAttribute('tabindex', '-1'); } catch (err) { console.warn('view.js', err); }
      return r;
    };
  }
  applyA11y(); applyView(); skipLink();
})();
