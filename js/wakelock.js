// 명상 중 화면 꺼짐 방지. 미지원 브라우저에서는 조용히 no-op.
// 화면이 꺼지면 iOS는 Web Audio도 중단시키므로, Wake Lock 유지가 곧 소리 유지다.
// (사용자가 직접 화면을 잠그면 소리는 멈추지만 타이머는 타임스탬프 기반이라 정확하다.)

let lock = null;
let wantLock = false;

async function acquire() {
  if (!('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    lock = null; // 배터리 절약 모드 등으로 거부될 수 있음
  }
}

function onVisible() {
  if (wantLock && document.visibilityState === 'visible' && !lock) acquire();
}

document.addEventListener('visibilitychange', onVisible);

export function requestWakeLock() {
  wantLock = true;
  return acquire();
}

export function releaseWakeLock() {
  wantLock = false;
  if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}
