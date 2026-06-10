import { mountHome } from './screens/home.js';
import { mountSession, unmountSession } from './screens/session.js';
import { mountCalendar } from './screens/calendar.js';
import { mountJournal } from './screens/journal.js';
import { mountSettings } from './screens/settings.js';

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
navigate();

if ('serviceWorker' in navigator) {
  // 상대 경로 필수 — GitHub Pages 서브패스(/meditation/)에서 동작해야 한다
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// 브라우저가 용량 정리 시 기록을 임의로 지우지 않도록 보호 요청 (미지원 시 무시)
navigator.storage?.persist?.().catch(() => {});
