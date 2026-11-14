'use strict';
/* Phase 7 — Server sync with end-to-end encryption, explicit conflict resolution, and verification.
   The server (server/server.js) only ever sees ciphertext. Records are encrypted on the phone with a key derived from the
   workspace code, which is never sent. A record changed on two devices is NEVER merged or overwritten silently:
   it becomes a conflict and the owner/administrator chooses which version to keep. */

const SYNC = { running: false, again: false, error: '', last: Number(localStorage.getItem('syncLast') || 0) || null, conflicts: 0, pending: 0, note: '' };
const SYNC_META = ['sync', 'srev'];
const syncCfg = () => { try { return JSON.parse(localStorage.getItem('sync') || 'null'); } catch { return null; } };
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmtCode = c => normCode(c).match(/.{1,4}/g)?.join('-') || '';
const newCode = () => { const al = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const b = crypto.getRandomValues(new Uint8Array(24)); let s = ''; for (let i = 0; i < 20; i++) s += al[b[i] % al.length]; return fmtCode(s); };
const nsOf = code => sha256('ethcm-ns|' + normCode(code));
let _k = null, _kc = '';
async function syncKey(code) { const c = normCode(code); if (_kc !== c) { _k = await aesKey(c, te.encode('ethcm-sync-v1')); _kc = c; } return _k; }
const strip = r => { const o = { ...r }; for (const k of SYNC_META) delete o[k]; return o; };
async function encObj(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))); return { data: toB64(new Uint8Array(ct)), iv: toB64(iv) }; }
async function decObj(key, data, iv) { try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(data)))); } catch { throw new Error('Could not decrypt data from the server. The workspace code is wrong, or the data was altered.'); } }
const dbKeys = s => tx(s, 'readonly', st => st.getAllKeys());
const syncStores = () => BACKUP_STORES.filter(s => s !== 'conflicts');
const isPending = (store, r) => r.sync === 'local' || (store === 'audit' && !r.srev);
const same = (a, b) => JSON.stringify(sortKeys(strip(a))) === JSON.stringify(sortKeys(strip(b)));
const sortKeys = o => Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])])) : o;
function okUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' || x.hostname === 'localhost' || x.hostname === '127.0.0.1'; } catch { return false; } }

async function api(cfg, path, opt = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), opt.timeout || 40000);
  try {
    const r = await fetch(cfg.url + path, { method: opt.method || 'GET', headers: { 'x-ns': cfg.ns || '', ...(opt.headers || {}), ...(opt.json ? { 'content-type': 'application/json' } : {}) }, body: opt.json ? JSON.stringify(opt.json) : opt.body, signal: ac.signal });
    if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch { } throw new Error(m || `Server answered ${r.status}`); }
    if (opt.raw) return r; try { return await r.json(); } catch { throw new Error('That address did not answer like an EthioBuild sync server.'); }
  } catch (e) { if (e.name === 'AbortError') throw new Error('The server did not answer in time.'); if (e instanceof TypeError) throw new Error('Cannot reach the server. Check the address and your connection.'); throw e; } finally { clearTimeout(t); }
}

// ---------- conflicts ----------
async function openConflict(store, id, loc, remote, rev) {
  const key = store + '|' + id; const old = await dbGet('conflicts', key);
  await dbPut('conflicts', { id: key, store, recId: id, local: loc, remote, remoteRev: rev, at: old?.at || new Date().toISOString(), status: 'open' });
  if (!old || old.status !== 'open') await audit('conflict', store, id, `Sync conflict detected on ${store}`, loc.projectId || null);
}
async function applyRemote(store, id, rev, obj, force) {
  const loc = await dbGet(store, id);
  if (!loc) { await dbPut(store, { ...obj, srev: rev, sync: 'synced' }); return 1; }
  if (!force && (loc.srev || 0) >= rev) return 0;
  if (isPending(store, loc)) {
    if (same(loc, obj)) { await dbPut(store, { ...obj, srev: rev, sync: 'synced' }); return 0; }
    if (store === 'audit') { await dbPut(store, { ...obj, srev: rev, sync: 'synced' }); return 1; }
    await openConflict(store, id, loc, obj, rev); return 0;
  }
  await dbPut(store, { ...obj, srev: rev, sync: 'synced' }); return 1;
}

// ---------- push / pull ----------
async function pushAll(cfg, key) {
  const open = new Set((await dbAll('conflicts')).filter(c => c.status === 'open').map(c => c.id)); const queue = [];
  for (const s of syncStores()) for (const r of await dbAll(s)) if (isPending(s, r) && !open.has(s + '|' + r.id)) queue.push([s, r]);
  let sent = 0, changed = 0;
  for (let i = 0; i < queue.length; i += 100) {
    const batch = queue.slice(i, i + 100); const records = [];
    for (const [s, r] of batch) records.push({ store: s, id: r.id, base: r.srev || 0, ...(await encObj(key, strip(r))) });
    const res = await api(cfg, '/api/push', { method: 'POST', json: { records } });
    for (let k = 0; k < batch.length; k++) {
      const [s, r] = batch[k], x = res.results[k]; if (!x || x.store !== s || x.id !== r.id) throw new Error('Unexpected server reply.');
      if (x.status === 'ok') { const cur = await dbGet(s, r.id); const unchanged = cur.version === r.version && cur.updatedAt === r.updatedAt; await dbPut(s, { ...cur, srev: x.rev, sync: unchanged ? 'synced' : cur.sync }); sent++; }
      else if (x.status === 'conflict') changed += await applyRemote(s, r.id, x.rev, await decObj(key, x.data, x.iv), true);
      else throw new Error(`The server refused a ${s} record.`);
    }
  }
  return { sent, changed };
}
async function requeueAll() { for (const s of syncStores()) for (const r of await dbAll(s)) { const o = { ...r }; delete o.srev; if (s !== 'audit') o.sync = 'local'; await dbPut(s, o); } }
async function pullAll(cfg, key) {
  let since = Number(localStorage.getItem('syncSeq') || 0), changed = 0, guard = 0;
  for (;;) {
    const j = await api(cfg, '/api/pull?since=' + since); if (since > j.seq) { since = 0; await requeueAll(); SYNC.again = true; } // server lost its data: send everything again
    for (const r of j.records) { changed += await applyRemote(r.store, r.id, r.rev, await decObj(key, r.data, r.iv), false); }
    since = j.records.length ? j.records[j.records.length - 1].seq : j.seq; localStorage.setItem('syncSeq', String(since));
    if (!j.more || ++guard > 200) break;
  }
  return changed;
}
async function syncBlobs(cfg, key) {
  const local = new Set(await dbKeys('files')); const srv = new Map((await api(cfg, '/api/blobs')).blobs.map(b => [b.id, b.size])); let n = 0, more = false;
  for (const id of local) { if (srv.has(id)) continue; if (n >= 15) { more = true; break; } const f = await dbGet('files', id); if (!f?.blob || f.blob.size > 25 * 1048576) continue; const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await f.blob.arrayBuffer())); const body = new Uint8Array(12 + ct.length); body.set(iv); body.set(ct, 12); await api(cfg, '/api/blob/' + encodeURIComponent(id), { method: 'PUT', body, headers: { 'x-mime': f.blob.type || '' }, timeout: 120000 }); n++; }
  for (const id of srv.keys()) { if (local.has(id)) continue; if (n >= 15) { more = true; break; } const r = await api(cfg, '/api/blob/' + encodeURIComponent(id), { raw: true, timeout: 120000 }); const u = new Uint8Array(await r.arrayBuffer()); let pt; try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12)); } catch { throw new Error('A stored file failed its integrity check.'); } await dbPut('files', { id, blob: new Blob([pt], { type: r.headers.get('x-mime') || '' }) }); n++; }
  return more;
}
async function recount() { SYNC.conflicts = (await dbAll('conflicts')).filter(c => c.status === 'open').length; SYNC.pending = await countLocal(); }
let syncTimer = null;
function syncSoon() { if (!syncCfg()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 2500); }
async function syncNow() {
  const cfg = syncCfg(); if (!cfg) return; if (SYNC.running) { SYNC.again = true; return; }
  if (!navigator.onLine) { SYNC.error = 'Offline'; return refreshSyncUI(); }
  SYNC.running = true; SYNC.error = ''; refreshSyncUI(); let changed = 0, moreBlobs = false;
  try {
    const key = await syncKey(cfg.code); const c = { ...cfg, ns: await nsOf(cfg.code) };
    const p = await pushAll(c, key); changed += p.changed; changed += await pullAll(c, key); moreBlobs = await syncBlobs(c, key);
    SYNC.last = Date.now(); localStorage.setItem('syncLast', String(SYNC.last));
  } catch (e) { SYNC.error = e.message; }
  finally { SYNC.running = false; try { await recount(); } catch { } if (changed && S.user) { await load(); softRefresh(); } else refreshSyncUI(); if (SYNC.again || moreBlobs) { SYNC.again = false; syncSoon(); } }
}
function softRefresh() { const a = document.activeElement; if ($('#sheet')?.open || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return refreshSyncUI(); render(); }
function refreshSyncUI() { if (S.user && !$('#app').hidden) renderShell().catch(() => { }); }
function syncBadge(pending) {
  const cfg = syncCfg(); const off = !navigator.onLine ? 'off' : '';
  if (!cfg) return `<span class="badge ${off}" title="Records are stored on this device. Server sync is not set up.">${off ? 'Offline · ' : ''}Saved locally${pending ? ' · ' + pending : ''}</span>`;
  const n = SYNC.pending; let t, tip = 'Synced with your server (encrypted).';
  if (SYNC.running) t = 'Syncing…'; else if (SYNC.conflicts) { t = `${SYNC.conflicts} conflict${SYNC.conflicts > 1 ? 's' : ''}`; tip = 'Open Backup & Synchronization to resolve.'; } else if (SYNC.error && SYNC.error !== 'Offline') { t = 'Sync failed' + (n ? ' · ' + n : ''); tip = SYNC.error; } else if (n) t = `${n} waiting`; else if (SYNC.last) t = 'Synced'; else t = 'Not synced yet';
  return `<a href="#/backup" class="badge ${off || (SYNC.conflicts || (SYNC.error && SYNC.error !== 'Offline') ? 'off' : '')}" title="${esc(tip)}">${off ? 'Offline · ' : ''}${esc(t)}</a>`;
}
function syncAlerts() {
  const o = []; if (!can('admin')) return o; const cfg = syncCfg();
  if (SYNC.conflicts) o.push({ level: 'high', text: `${SYNC.conflicts} sync conflict(s) need your decision`, href: '#/conflicts' });
  if (cfg && SYNC.error && SYNC.error !== 'Offline') o.push({ level: 'med', text: 'Last sync failed: ' + SYNC.error, href: '#/backup' });
  else if (cfg && SYNC.last && (Date.now() - SYNC.last) / 864e5 > 2) o.push({ level: 'med', text: 'This phone has not synced for over 2 days', href: '#/backup' });
  if (!cfg) o.push({ level: 'low', text: 'Server sync is not set up: your data exists only on this phone', href: '#/backup' });
  return o;
}

// ---------- setup / status UI ----------
async function resetSyncState() {
  for (const s of syncStores()) for (const r of await dbAll(s)) { const o = { ...r }; delete o.srev; if (s !== 'audit') o.sync = 'local'; await dbPut(s, o); }
  localStorage.setItem('syncSeq', '0'); await tx('conflicts', 'readwrite', st => st.clear());
}
const setupForm = () => `<h1>Set up server sync</h1><form data-f="syncsetup"><p class="small muted">You need a sync server (see the server folder in the download). Everything is encrypted on your phone before it is sent; the server cannot read it.</p>
  ${fld('Server address (https://…)', 'url', '', { type: 'url', req: 1, attrs: 'placeholder="https://your-server.example" autocapitalize="off"' })}
  ${sel('This is', 'mode', [['create', 'The first device: create a new workspace'], ['join', 'Another device: join an existing workspace']], 'create')}
  ${fld('Workspace code (only when joining)', 'code', '', { attrs: 'autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"' })}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Connect</button></div></form>`;
const codeSheet = code => `<h1>Your workspace code</h1><div class="card"><p style="font-size:20px;letter-spacing:1px;word-break:break-all"><b>${esc(code)}</b></p><p class="small err"><b>Write this down and keep it safe.</b> Other phones need it to join. It also unlocks the data on the server. If you lose it, the server copy cannot be read and cannot be recovered by anyone, including us.</p></div><div class="row"><button class="primary" data-a="close-sheet">I have saved it</button></div>`;
A['close-sheet'] = () => closeSheet();
async function serverCheck(url) { if (!okUrl(url)) throw new Error('The server address must start with https:// (http is allowed only for localhost).'); const r = await api({ url, ns: '' }, '/api/health', { timeout: 10000 }); if (!r.ok || r.name !== 'ethiobuild-sync') throw new Error('That address is not an EthioBuild sync server.'); }
async function connect(url, code) {
  url = url.trim().replace(/\/+$/, ''); await serverCheck(url); const ns = await nsOf(code); const lastNs = localStorage.getItem('syncNs');
  if (lastNs && lastNs !== ns) await resetSyncState(); localStorage.setItem('syncNs', ns); localStorage.setItem('sync', JSON.stringify({ url, code: fmtCode(code) })); await audit('sync', 'sync', null, 'Server sync turned on', null); await syncNow(); if (SYNC.error && SYNC.error !== 'Offline') throw new Error(SYNC.error);
}
F.syncsetup = async d => {
  if (!can('admin', 'e')) throw new Error('Only the owner or an administrator can set up sync.');
  if (d.mode === 'create') { const code = newCode(); await connect(d.url, code); setTimeout(() => openSheet(codeSheet(code)), 250); }
  else { if (normCode(d.code).length < 20) throw new Error('Enter the full workspace code from the first device.'); await connect(d.url, d.code); }
};
F.syncjoin = async d => { if (normCode(d.code).length < 20) throw new Error('Enter the full workspace code.'); await connect(d.url, d.code); toast('Joined. Now sign in with your existing account.'); await render(); };
const joinForm = () => `<h1>Join a synced workspace</h1><form data-f="syncjoin"><p class="small muted">Use the server address and workspace code from the first device. Your projects and accounts will be downloaded to this phone.</p>${fld('Server address', 'url', '', { type: 'url', req: 1, attrs: 'autocapitalize="off"' })}${fld('Workspace code', 'code', '', { req: 1, attrs: 'autocapitalize="characters" autocomplete="off"' })}<div class="err"></div><div class="row">${cancelBtn}<button class="primary">Join</button></div></form>`;
Object.assign(A, {
  'sync-setup': () => openSheet(setupForm()), 'sync-join': () => openSheet(joinForm()),
  async 'sync-now'() { if (!navigator.onLine) throw new Error('You are offline.'); await syncNow(); toast(SYNC.error || 'Synced'); await render(); },
  'sync-code'() { if (!can('admin', 'e')) throw new Error('Only the owner or an administrator can see the code.'); openSheet(codeSheet(syncCfg().code)); },
  async 'sync-off'() { if (!can('admin', 'e')) throw new Error('No access.'); if (!confirm('Turn off server sync on this phone? Your data stays here. Nothing is deleted from the server.')) return; localStorage.removeItem('sync'); await audit('sync', 'sync', null, 'Server sync turned off', null); SYNC.error = ''; await render(); },
  async 'sync-verify'() {
    const cfg = syncCfg(); if (!cfg) return; if (!navigator.onLine) throw new Error('You are offline.'); await syncNow(); if (SYNC.error) throw new Error(SYNC.error);
    const c = { ...cfg, ns: await nsOf(cfg.code) }, key = await syncKey(cfg.code); let since = 0, n = 0, ok = 0, behind = 0, missing = 0, guard = 0; const seen = new Set();
    for (;;) { const j = await api(c, '/api/pull?since=' + since); for (const r of j.records) { await decObj(key, r.data, r.iv); n++; seen.add(r.store + '/' + r.id); const loc = await dbGet(r.store, r.id); if (!loc) missing++; else if ((loc.srev || 0) === r.rev && !isPending(r.store, loc)) ok++; else behind++; } since = j.records.length ? j.records[j.records.length - 1].seq : j.seq; if (!j.more || ++guard > 200) break; }
    let notOnServer = 0; for (const s of syncStores()) for (const r of await dbAll(s)) if (!seen.has(s + '/' + r.id)) notOnServer++;
    const lk = new Set(await dbKeys('files')), sb = new Set((await api(c, '/api/blobs')).blobs.map(b => b.id)); const fMissing = [...lk].filter(x => !sb.has(x)).length;
    const good = !behind && !missing && !notOnServer && !fMissing; const msg = good ? `Verified: all ${n} records on the server decrypt correctly and match this phone.` : `Not fully matched: ${behind} differ, ${missing} only on server, ${notOnServer} only on this phone, ${fMissing} file(s) not uploaded. Press Sync now and verify again.`;
    await audit('sync', 'sync', null, 'Server verification: ' + msg, null); openSheet(`<h1>${good ? 'Verified' : 'Check result'}</h1><p>${esc(msg)}</p><div class="row"><button class="primary" data-a="close-sheet">OK</button></div>`);
  },
  async 'conf-mine'(id) { await resolveConflict(id, 'mine'); }, async 'conf-theirs'(id) { await resolveConflict(id, 'theirs'); }
});
async function syncCard() {
  const cfg = syncCfg(); const pending = await countLocal(); SYNC.pending = pending; await recount(); const e = can('admin', 'e');
  if (!cfg) return `<div class="card"><b>Server sync: not set up</b><p class="small">Right now ${pending} record(s) exist only on this phone. If the phone is lost or reset, they are gone unless you made a backup file.</p><p class="small muted">Sync keeps every phone on the project up to date and keeps an encrypted copy on a server you control. It works offline and catches up later.</p>${e ? `<div class="row" style="justify-content:flex-start"><button class="sm primary" data-a="sync-setup">Set up sync</button><button class="sm" data-a="sync-join">Join existing</button></div>` : '<p class="small muted">Ask the owner or an administrator.</p>'}</div>`;
  let st = null; try { st = await api({ ...cfg, ns: await nsOf(cfg.code) }, '/api/status', { timeout: 8000 }); } catch { }
  return `<div class="card"><b>Server sync: on</b><p class="small">${SYNC.running ? 'Syncing now…' : SYNC.error && SYNC.error !== 'Offline' ? `<span class="err">Last attempt failed: ${esc(SYNC.error)}</span>` : SYNC.last ? `Last successful sync: ${esc(new Date(SYNC.last).toLocaleString())}` : 'Not synced yet.'}<br>Waiting to be sent: <b>${pending}</b> · Conflicts: <b>${SYNC.conflicts}</b><br>Server: ${esc(cfg.url)}</p>
  ${st ? `<p class="small muted">On the server: ${st.records} records, ${st.blobs} files, ${fsize(st.bytes)} (encrypted). Server keeps ${st.backups} daily copy(ies)${st.lastBackupDay ? ', latest ' + esc(st.lastBackupDay) : ''}.</p>` : '<p class="small muted">Server details unavailable right now.</p>'}
  ${SYNC.conflicts ? `<a class="btn" href="#/conflicts">Resolve ${SYNC.conflicts} conflict(s)</a>` : ''}<div class="row" style="justify-content:flex-start;flex-wrap:wrap;margin-top:8px"><button class="sm primary" data-a="sync-now">Sync now</button><button class="sm" data-a="sync-verify">Verify against server</button>${e ? `<button class="sm" data-a="sync-code">Workspace code</button><button class="sm" data-a="sync-off">Turn off</button>` : ''}</div>
  <p class="tag">“Synced” means the server accepted the records. “Verify” decrypts and compares every record to prove the server copy matches this phone.</p></div>`;
}

// ---------- conflicts ----------
const REC_NAME = r => r.title || r.name || r.description || r.label || r.code || r.email || r.id;
const HIDE = new Set(['sync', 'srev', 'deviceId', 'updatedAt', 'createdAt', 'version']);
const showV = v => v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v).slice(0, 160);
async function viewConflicts() {
  if (!can('admin')) return locked(); const L = (await dbAll('conflicts')).filter(c => c.status === 'open'); const e = can('admin', 'e');
  return `<a href="#/backup" class="small muted">← Backup & Synchronization</a><h1>Sync conflicts</h1><p class="small muted">The same record was changed on this phone and on another device. Nothing was overwritten. Choose which version to keep; the other is kept in the activity log.</p>
  ${L.map(c => { const keys = [...new Set([...Object.keys(c.local), ...Object.keys(c.remote)])].filter(k => !HIDE.has(k) && JSON.stringify(c.local[k]) !== JSON.stringify(c.remote[k])); return `<div class="card"><b>${esc(c.store)}: ${esc(showV(REC_NAME(c.local)))}</b><div class="muted small">This phone edited ${esc((c.local.updatedAt || '').slice(0, 16).replace('T', ' '))} UTC · other device ${esc((c.remote.updatedAt || '').slice(0, 16).replace('T', ' '))} UTC</div>
  <div class="tscroll"><table class="rtable"><thead><tr><th>Field</th><th>This phone</th><th>Other device</th></tr></thead><tbody>${keys.map(k => `<tr><td>${esc(k)}</td><td>${esc(showV(c.local[k]))}</td><td>${esc(showV(c.remote[k]))}</td></tr>`).join('') || '<tr><td colspan=3>Only internal details differ.</td></tr>'}</tbody></table></div>
  ${e ? `<div class="row" style="justify-content:flex-start"><button class="sm" data-a="conf-mine" data-id="${esc(c.id)}">Keep this phone’s</button><button class="sm" data-a="conf-theirs" data-id="${esc(c.id)}">Keep the other device’s</button></div>` : '<p class="small muted">Only the owner or an administrator can decide.</p>'}</div>`; }).join('') || '<div class="card">No conflicts.</div>'}`;
}
async function resolveConflict(id, how) {
  if (!can('admin', 'e')) throw new Error('Only the owner or an administrator can resolve conflicts.'); const c = await dbGet('conflicts', id); if (!c || c.status !== 'open') throw new Error('Already resolved.');
  if (!confirm(how === 'mine' ? 'Keep this phone’s version and replace the other device’s?' : 'Keep the other device’s version and discard this phone’s change?')) return;
  const now = new Date().toISOString();
  if (how === 'theirs') await dbPut(c.store, { ...c.remote, srev: c.remoteRev, sync: 'synced' });
  else await dbPut(c.store, { ...c.local, version: Math.max(c.local.version || 0, c.remote.version || 0) + 1, updatedAt: now, srev: c.remoteRev, sync: 'local' });
  await dbPut('conflicts', { ...c, status: 'resolved', resolution: how, resolvedBy: S.user.id, resolvedAt: now }); await audit('conflict-resolved', c.store, c.recId, `Conflict resolved: kept ${how === 'mine' ? 'this phone’s' : 'the other device’s'} version. Discarded version saved: ${JSON.stringify(how === 'mine' ? strip(c.remote) : strip(c.local)).slice(0, 1500)}`, c.local.projectId || null);
  await recount(); await load(); await render(); if (how === 'mine') syncSoon(); toast('Resolved');
}
ROUTES.conflicts = viewConflicts;

// ---------- triggers ----------
window.addEventListener('online', () => syncSoon());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncSoon(); });
setInterval(() => { if (document.visibilityState === 'visible') syncSoon(); }, 60000);
window.addEventListener('load', () => setTimeout(async () => { try { await recount(); } catch { } syncSoon(); }, 1500));
