// PWA 업데이트 감지: sw.js가 CACHE_NAME을 올려 배포되면 skipWaiting()으로
// 곧바로 이 탭의 컨트롤러가 되지만, 이미 실행 중인 JS는 새로고침 전까지 그대로다.
// 최초 설치(컨트롤러가 없던 상태 → 생김)는 업데이트가 아니므로 배너를 띄우지 않는다.

let registration = null;

export function init() {
  if (!('serviceWorker' in navigator)) return;

  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.getRegistration().then((r) => { registration = r; });

  // 앱을 다시 열거나 포그라운드로 돌아올 때마다 최신 sw.js를 확인한다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration?.update().catch(() => {});
  });

  let isFirstController = !hadController;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isFirstController) { isFirstController = false; return; }
    showBanner();
  });
}

function showBanner() {
  if (document.querySelector('.update-banner')) return; // 중복 방지
  const bar = document.createElement('div');
  bar.className = 'update-banner';
  bar.innerHTML = `
    <span>새 버전이 있어요</span>
    <button id="update-reload" class="btn-small">새로고침</button>
  `;
  document.body.appendChild(bar);
  bar.querySelector('#update-reload').addEventListener('click', () => location.reload());
}
