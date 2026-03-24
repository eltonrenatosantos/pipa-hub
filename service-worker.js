const CACHE_NAME = 'webpipa-v1.0.7';
const ASSETS = [
  '/',
  '/index.html',
  '/pages/home.html',
  '/pages/event.html',
  '/assets/css/global.css',
  '/assets/css/components.css',
  '/assets/css/pages.css',
  '/css/style.css',
  '/js/home.js',
  '/js/header.js',
  '/js/footer.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(event.request);
      } catch {
        const url = new URL(event.request.url);
        const pathnameMatch =
          (await caches.match(url.pathname)) ||
          (url.pathname.endsWith('/') ? await caches.match('/pages/home.html') : null);

        return (
          (await caches.match(event.request)) ||
          pathnameMatch ||
          (await caches.match('/')) ||
          (await caches.match('/pages/home.html'))
        );
      }
    })());
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
