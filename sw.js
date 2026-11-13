// Service worker simple: red primero, caché como respaldo (solo archivos de la app).
const CACHE = 'urbanstore-v3';
const BASE = [
  './', 'index.html', 'admin.html', 'icon.svg',
  'css/ui.css', 'css/public.css', 'css/panel.css',
  'js/config.js', 'js/common.js', 'js/public.js', 'js/admin.js', 'js/scanner.js',
  'js/mod-vender.js', 'js/mod-productos.js', 'js/mod-dashboard.js',
  'js/mod-reportes.js', 'js/mod-excel.js', 'js/mod-ajustes.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(BASE.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return; // Supabase y CDN no se cachean
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
