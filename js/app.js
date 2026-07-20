import { mountHome } from './screens/home.js';
import { mountSession, unmountSession } from './screens/session.js';
import { mountCalendar } from './screens/calendar.js';
import { mountJournal } from './screens/journal.js';
import { mountSettings } from './screens/settings.js';
import * as store from './store.js';
import * as notify from './notify.js';
import { maybeShowOnboarding } from './onboarding.js';

// index.html의 인라인 스크립트가 이미 초기값을 세팅했지만, 설정 화면에서
// 바뀐 값과 항상 동기화되도록 부팅 시 store 기준으로 다시 확인한다.
document.documentElement.dataset.theme = store.getSettings().theme;

const routes = {
  '': { el: 'screen-home', mount: mountHome },
  session: { el: 'screen-session', mount: mountSession, unmount: unmountSession },
  calendar: { el: 'screen-calendar', mount: mountCalendar },
  journal: { el: 'screen-journal', mount: mountJournal },
  settings: { el: 'screen-settings', mount: mountSettings },
};

let currentRoute = null;

function parseHash() {
  // "#/journal?date=2026-06-10" → { name: "journal", params: { date: "..." } }
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: name || '', params };
}

function navigate() {
  const { name, params } = parseHash();
  const route = routes[name] || routes[''];

  if (currentRoute?.unmount) currentRoute.unmount();
  currentRoute = route;

  for (const r of Object.values(routes)) {
    document.getElementById(r.el).hidden = r !== route;
  }

  route.mount(document.getElementById(route.el), params);

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.route === name);
  });

  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navigate);

// 앱이 종료됐다 다시 열렸을 때(예: 명상 중 전화 수신) 진행 중이던 세션이 있으면
// 홈이 아니라 세션 화면으로 보내 "이어서 하기" 복구 프롬프트를 띄운다.
const recovered = store.getActiveSession();
const resumable = recovered
  && typeof recovered.remainingMs === 'number'
  && recovered.remainingMs > 0
  && Date.now() - (recovered.savedAt || 0) < 60 * 60 * 1000;

if (resumable && parseHash().name === '') {
  location.hash = '#/session'; // hashchange가 navigate를 호출
} else {
  navigate();
  maybeShowOnboarding(); // 첫 방문 안내 (복구 세션이 없을 때만)
}

if ('serviceWorker' in navigator) {
  // 상대 경로 필수 — GitHub Pages 서브패스(/meditation/)에서 동작해야 한다
  navigator.serviceWorker.register('./sw.js')
    .then(() => notify.init())
    .catch(() => {});
}

// 브라우저가 용량 정리 시 기록을 임의로 지우지 않도록 보호 요청 (미지원 시 무시)
navigator.storage?.persist?.().catch(() => {});
