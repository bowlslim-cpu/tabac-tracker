const CACHE = 'tabac-v1';
const OFFLINE_FILES = [
'./',
'./index.html',
'./styles.css',
'./app.js',
'./manifest.webmanifest',
// CDN Chart.js (cache pour offline)
'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];


self.addEventListener('install', (e) => {
e.waitUntil(
caches.open(CACHE).then(cache => cache.addAll(OFFLINE_FILES)).then(()=>self.skipWaiting())
);
});


self.addEventListener('activate', (e) => {
e.waitUntil(
caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
);
});


self.addEventListener('fetch', (e) => {
const req = e.request;
e.respondWith(
caches.match(req).then(cached => cached || fetch(req).then(res => {
// Mise en cache opportuniste
const copy = res.clone();
caches.open(CACHE).then(c => c.put(req, copy));
return res;
}).catch(()=>caches.match('./index.html')))
);
});