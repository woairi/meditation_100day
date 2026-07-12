// 일일 명상 리마인더. 서버가 없으므로 두 경로를 함께 쓴다:
//  1) Periodic Background Sync — 설치된 PWA에서 브라우저가 주기적으로 깨워 알림(지원 브라우저 한정)
//  2) 포그라운드 폴백 — 앱이 열려 있을 때 예정 시각을 지나면 알림
// 서비스 워커는 localStorage를 못 읽으므로, 완료 여부·시각을 Cache Storage에 공유한다.

import * as store from './store.js';

const META_CACHE = 'meditation100-meta';
const META_KEY = '/__reminder_meta';
const SYNC_TAG = 'daily-reminder';

let fgTimer = null;

async function writeMeta(meta) {
  try {
    const cache = await caches.open(META_CACHE);
    await cache.put(META_KEY, new Response(JSON.stringify(meta), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch { /* Cache 미지원 시 무시 */ }
}

// 현재 설정과 오늘 완료 여부를 서비스 워커가 읽도록 메타에 반영한다.
export async function syncReminderMeta() {
  const s = store.getSettings();
  await writeMeta({
    enabled: !!s.reminderEnabled,
    time: s.reminderTime || '08:00',
    lastDoneDate: store.isTodayDone() ? store.todayKey() : null,
  });
}

function permissionGranted() {
  return 'Notification' in window && Notification.permission === 'granted';
}

// 알림 켜기: 권한 요청 → 설정 저장 → 주기 동기화 등록 + 포그라운드 스케줄. 성공 여부 반환.
export async function enableReminder(time) {
  if (!('Notification' in window)) return false;
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  store.updateSettings({ reminderEnabled: true, reminderTime: time });
  await syncReminderMeta();
  await registerPeriodicSync();
  scheduleForeground();
  return true;
}

export async function disableReminder() {
  store.updateSettings({ reminderEnabled: false });
  await syncReminderMeta();
  clearTimeout(fgTimer);
  fgTimer = null;
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.periodicSync?.unregister(SYNC_TAG);
  } catch { /* 미지원 무시 */ }
}

async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.periodicSync) return;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return;
    await reg.periodicSync.register(SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
  } catch { /* 미지원/거부 무시 */ }
}

// 앱이 열려 있는 동안의 폴백: 오늘 예정 시각을 지나면(그리고 미완료면) 알림한다.
function scheduleForeground() {
  clearTimeout(fgTimer);
  const s = store.getSettings();
  if (!s.reminderEnabled || !permissionGranted()) return;
  const [h, m] = (s.reminderTime || '08:00').split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  let delay = target - now;
  if (delay < 0) {
    maybeNotifyForeground(); // 이미 지난 시각이면 즉시 확인
    delay += 24 * 60 * 60 * 1000; // 다음 알림은 내일 같은 시각
  }
  fgTimer = setTimeout(() => {
    maybeNotifyForeground();
    scheduleForeground();
  }, Math.min(delay, 24 * 60 * 60 * 1000));
}

async function maybeNotifyForeground() {
  const s = store.getSettings();
  if (!s.reminderEnabled || !permissionGranted()) return;
  if (store.isTodayDone()) return;
  const key = `meditation100.notified.${store.todayKey()}`;
  if (localStorage.getItem(key)) return; // 같은 날 중복 방지
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('명상 100일 챌린지', {
      body: '오늘의 명상이 기다리고 있어요. 잠시 멈추고 호흡해볼까요?',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: SYNC_TAG,
    });
    localStorage.setItem(key, '1');
  } catch { /* 알림 실패 무시 */ }
}

// 설정 화면에 보여줄 상태 안내 문구.
export function reminderStatusText() {
  if (!('Notification' in window)) return '이 브라우저는 알림을 지원하지 않아요.';
  if (Notification.permission === 'denied') return '브라우저 알림이 차단돼 있어요. 사이트 설정에서 허용해 주세요.';
  const s = store.getSettings();
  if (!s.reminderEnabled) return '매일 정해진 시각에 명상을 잊지 않도록 알려드려요.';
  return `매일 ${s.reminderTime}에 알려드려요. 홈 화면에 설치하면 앱을 닫아도 더 잘 동작해요.`;
}

// 앱 시작 시 호출: 메타 동기화 + (켜져 있으면) 스케줄 재등록 + 탭 복귀 시 재확인.
export async function init() {
  if (!('serviceWorker' in navigator)) return;
  await syncReminderMeta();
  const s = store.getSettings();
  if (s.reminderEnabled && permissionGranted()) {
    await registerPeriodicSync();
    scheduleForeground();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    syncReminderMeta();
    if (store.getSettings().reminderEnabled) maybeNotifyForeground();
  });
}
