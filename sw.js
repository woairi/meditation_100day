// cache-first 프리캐시 서비스 워커.
// 파일을 변경해 배포할 때마다 CACHE_NAME 버전을 올려야 클라이언트가 갱신된다.
const CACHE_NAME = 'meditation100-v16';
const META_CACHE = 'meditation100-meta'; // 리마인더 메타 공유(앱 ↔ SW). activate 정리에서 제외한다.
const META_KEY = '/__reminder_meta';

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
  './js/mood.js',
  './js/notify.js',
  './js/onboarding.js',
  './js/speech.js',
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
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== META_CACHE).map((k) => caches.delete(k))
      ))
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

// ---- 일일 명상 리마인더 (앱이 공유한 메타를 읽어 판단) ----

async function readMeta() {
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match(META_KEY);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

async function writeMeta(meta) {
  try {
    const cache = await caches.open(META_CACHE);
    await cache.put(META_KEY, new Response(JSON.stringify(meta), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch { /* 무시 */ }
}

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function maybeNotify() {
  const meta = await readMeta();
  if (!meta || !meta.enabled) return;
  const now = new Date();
  const today = localDateKey(now);
  if (meta.lastDoneDate === today) return; // 오늘 이미 명상함
  if (meta.lastNotifiedDate === today) return; // 오늘 이미 알림함
  const [h, m] = String(meta.time || '08:00').split(':').map(Number);
  if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return; // 아직 시각 전
  await self.registration.showNotification('명상 100일 챌린지', {
    body: '오늘의 명상이 기다리고 있어요. 잠시 멈추고 호흡해볼까요?',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'daily-reminder',
  });
  meta.lastNotifiedDate = today;
  await writeMeta(meta);
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'daily-reminder') e.waitUntil(maybeNotify());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});
