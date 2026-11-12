'use strict';
/* prefs.js — general settings: theme, font style, text size, language.
   Stored on this device (localStorage). Language uses the dictionaries in i18n.js and translates the screen as it is drawn. */
(function () {
  const FONTS = {
    system: ['System default', 'Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Ethiopic",sans-serif'],
    sans: ['Classic sans-serif', 'Arial,Helvetica,"Noto Sans Ethiopic",sans-serif'],
    easy: ['Easy reading', 'Verdana,Tahoma,Geneva,"Noto Sans Ethiopic",sans-serif'],
    serif: ['Serif', 'Georgia,"Times New Roman","Noto Serif Ethiopic","Abyssinica SIL",serif'],
    mono: ['Monospace', 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace']
  };
  const SIZES = { s: ['Small', 0.9], m: ['Default', 1], l: ['Large', 1.15], xl: ['Extra large', 1.3] };
  const LANGS = { en: 'English', am: 'አማርኛ', om: 'Afaan Oromoo' };
  const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
  const root = document.documentElement;
  let font = get('fontStyle', 'system'), size = get('fontSize', 'm'), lang = get('lang', 'en');
  if (!FONTS[font]) font = 'system'; if (!SIZES[size]) size = 'm'; if (!LANGS[lang]) lang = 'en';

  function applyLook() {
    root.style.setProperty('--ff', FONTS[font][1]);
    root.style.setProperty('--fs', SIZES[size][1]);
    root.lang = lang;
    const s = document.getElementById('pref-sample'); if (s) { s.style.fontFamily = 'var(--ff)'; }
  }

  // ----- translation -----
  window.__tr = tr;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);
  const reCache = {};
  function tr(s) {
    if (lang === 'en' || !s) return s;
    const I = window.I18N || {}; const d = I[lang]; if (!d) return s;
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/); const core = m[2]; if (!core) return s;
    if (Object.prototype.hasOwnProperty.call(d, core)) return m[1] + d[core] + m[3];
    for (const [re, rep] of (I.patterns && I.patterns[lang]) || []) {
      const r = reCache[re] || (reCache[re] = new RegExp(re)); const x = core.match(r);
      if (x) return m[1] + rep.replace(/\{(\d)\}/g, (_, i) => tr(x[i] || '')).replace(/\$(\d)/g, (_, i) => x[i] || '') + m[3];
    }
    return s;
  }
  function walk(n) {
    if (n.nodeType === 3) {
      const p = n.parentElement; if (!p || SKIP.has(p.tagName) || p.closest('[data-notr]')) return;
      const v = n.nodeValue, t = tr(v); if (t !== v) n.nodeValue = t;
    } else if (n.nodeType === 1) {
      if (SKIP.has(n.tagName) || n.closest('[data-notr]')) return;
      for (const a of ['placeholder', 'aria-label', 'title']) { const v = n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
      n.childNodes.forEach(walk);
    }
  }
  const mo = new MutationObserver(ms => {
    if (lang === 'en') return;
    mo.disconnect();
    try { for (const m of ms) { if (m.type === 'characterData') walk(m.target); else m.addedNodes.forEach(walk); } }
    finally { start(); }
  });
  function start() { if (document.body) mo.observe(document.body, { childList: true, subtree: true, characterData: true }); }

  async function refresh() {
    applyLook();
    if (typeof render === 'function' && typeof S !== 'undefined' && S.user) await render(); // redraw from English, then translate
    if (document.body) walk(document.body);
  }

  // ----- settings card (used by Settings page) -----
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  window.prefsCard = function () {
    const theme = get('theme', 'auto');
    return `<div class="card"><b>Appearance & language</b>
    <label>Theme<select id="theme">${opt('auto', 'Match device', theme)}${opt('light', 'Light', theme)}${opt('dark', 'Dark', theme)}</select></label>
    <label>Font style<select id="pref-font">${Object.entries(FONTS).map(([k, v]) => opt(k, v[0], font)).join('')}</select></label>
    <label>Text size<select id="pref-size">${Object.entries(SIZES).map(([k, v]) => opt(k, v[0], size)).join('')}</select></label>
    <label>Language<select id="pref-lang">${Object.entries(LANGS).map(([k, v]) => opt(k, v, lang)).join('')}</select></label>
    ${typeof viewPrefsHtml === 'function' ? viewPrefsHtml() : ''}
    <div id="pref-sample" class="gex" data-notr style="font-family:var(--ff);margin:8px 0">Foundation concrete poured today · 12.5 m² · 45,000 ETB<br>ሰላም ኢትዮጵያ · ፋውንዴሽን ኮንክሪት</div>
    <div class="muted small">Translation covers menus, buttons, statuses and the guide titles. Other text stays in English for now. Currency is ETB; units are metric.</div>
    <div style="margin-top:8px"><button type="button" data-prefs="reset">Reset to defaults</button></div></div>`;
  };

  document.addEventListener('change', e => {
    const id = e.target && e.target.id;
    if (id === 'pref-font') { font = FONTS[e.target.value] ? e.target.value : 'system'; put('fontStyle', font); applyLook(); }
    else if (id === 'pref-size') { size = SIZES[e.target.value] ? e.target.value : 'm'; put('fontSize', size); applyLook(); }
    else if (id === 'pref-lang') { lang = LANGS[e.target.value] ? e.target.value : 'en'; put('lang', lang); refresh(); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-prefs="reset"]'); if (!b) return;
    font = 'system'; size = 'm'; lang = 'en'; put('fontStyle', font); put('fontSize', size); put('lang', lang); put('theme', 'auto');
    if (typeof applyTheme === 'function') applyTheme();
    if (typeof viewReset === 'function') viewReset();
    refresh();
  });

  applyLook(); start();
  if (lang !== 'en') window.addEventListener('load', () => document.body && walk(document.body));
})();
