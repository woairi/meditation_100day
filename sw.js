// cache-first 프리캐시 서비스 워커.
// 파일을 변경해 배포할 때마다 CACHE_NAME 버전을 올려야 클라이언트가 갱신된다.
const CACHE_NAME = 'meditation100-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/timer.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/icons.js',
  './js/ui.js',
  './js/share.js',
  './js/screens/settings.js',
  './js/screens/home.js',
  './js/screens/session.js',
  './js/screens/calendar.js',
  './js/screens/journal.js',
  './js/data/guides.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
