import * as store from '../store.js';
import { getGuide } from '../data/guides.js';
import { icon } from '../icons.js';
import { shareCard } from '../share.js';

export function mountHome(el) {
  if (store.isComplete()) {
    renderCelebration(el);
    return;
  }

  const day = store.getCurrentDay();
  const count = store.completedCount();
  const streak = store.getStreak();
  const todayDone = store.isTodayDone();
  const guide = getGuide(day);

  const pct = count / store.TOTAL_DAYS;
  const R = 88;
  const CIRC = 2 * Math.PI * R;

  el.innerHTML = `
    <div class="home-header">
      <div class="progress-ring-wrap">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--bg-card)" stroke-width="10"/>
          <circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--accent)" stroke-width="10"
            stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - pct)}"/>
        </svg>
        <div class="ring-content">
          <div class="day-label">Day</div>
          <div class="day-number">${day}</div>
          <div class="day-label">${count} / ${store.TOTAL_DAYS} 완료</div>
        </div>
      </div>
      <div class="streak-badge">${icon('flame', 16)} ${streak}일 연속</div>
    </div>

    <div class="today-status">
      ${todayDone
        ? `<div class="today-done">${icon('check', 18)} 오늘의 명상 완료!</div>
           <button id="btn-share" class="btn-small" style="margin-top:10px">인증 카드 공유</button>`
        : '<div style="color: var(--fg-dim)">오늘의 명상이 기다리고 있어요</div>'}
    </div>

    <button id="btn-start" class="btn-primary">
      ${todayDone ? '자유 명상 시작' : `Day ${day} 명상 시작`}
    </button>

    <div class="card guide-preview" style="margin-top:16px">
      <div class="guide-theme">${guide.phase} · DAY ${guide.day}</div>
      <div class="guide-title">${guide.title}</div>
      <div class="guide-text">${guide.text}</div>
    </div>
  `;

  el.querySelector('#btn-start').addEventListener('click', () => {
    location.hash = '#/session';
  });

  el.querySelector('#btn-share')?.addEventListener('click', () => {
    const todayCompletion = store.getCompletion(store.todayKey());
    const [y, m, d] = store.todayKey().split('-');
    shareCard({
      day: todayCompletion.day,
      dateLabel: `${y}.${m}.${d}`,
      streak,
      count,
      total: store.TOTAL_DAYS,
    });
  });
}

function renderCelebration(el) {
  const streak = store.getLongestStreak();
  el.innerHTML = `
    <div class="celebrate">
      ${icon('checkCircle', 80)}
      <h2>100일 완주를 축하합니다!</h2>
      <p>
        100일 동안 하루 10분, 총 1,000분의 고요를 쌓았습니다.<br>
        최장 연속 기록: <b>${streak}일</b><br>
        이제 명상은 당신의 일부입니다.
      </p>
      <button id="btn-free" class="btn-primary">자유 명상 계속하기</button>
      <a href="#/calendar" class="btn-ghost">나의 100일 돌아보기</a>
    </div>
  `;
  el.querySelector('#btn-free').addEventListener('click', () => {
    location.hash = '#/session';
  });
}
