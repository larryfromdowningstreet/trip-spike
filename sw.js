const CACHE = 'trip-spike-b0f510f7f29e';
const FILES = ["./","./apple-touch-icon.png","./assets/index-BZ0yrnUF.css","./assets/index-ufdcRHcP.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest"];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(e.request)));
});
