const CACHE='ethcm-shell-v14',V='?v=14';
const SHELL=['./','index.html',...['styles.css','modern.css','app.js','boq.js','prices.js','ops.js','finance.js','docs.js','quality.js','compguide.js','guide.js','i18n.js','prefs.js','view.js','ui.js'].map(f=>f+V),'manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','icon-maskable-512.png'];
// Cache each file on its own: one missing file must never stop the service worker from installing (Chrome needs it to offer "Install").
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Always ask the server first and revalidate (cache:'no-cache'), so a new release is never hidden by the browser's 10-minute GitHub Pages cache.
// Offline: fall back to the copy saved in the service-worker cache. Stored project data (IndexedDB) is never touched here.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{
    if(r.ok&&new URL(e.request.url).origin===location.origin){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
    return r;
  }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match(e.request,{ignoreSearch:true})).then(hit=>hit||caches.match('index.html'))));
});
