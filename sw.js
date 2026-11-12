const CACHE='ethcm-shell-v12';
const SHELL=['./','index.html','styles.css','app.js','boq.js','prices.js','ops.js','finance.js','docs.js','quality.js','compguide.js','guide.js','i18n.js','prefs.js','view.js','modern.css','ui.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','icon-maskable-512.png'];
// Cache each file on its own: one missing file must never stop the service worker from installing (Chrome needs it to offer "Install").
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{
    if(r.ok&&new URL(e.request.url).origin===location.origin){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
    return r;
  }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('index.html'))));
});
