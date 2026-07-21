import * as store from '../store.js';
import { getGuide, getQuote } from '../data/guides.js';
import { icon } from '../icons.js';
import { shareCard, shareProgress } from '../share.js';

const MILESTONES = [10, 30, 50, 100];

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
  const todayComp = todayDone ? store.getCompletion(store.todayKey()) : null;
  const milestone = todayComp && MILESTONES.includes(todayComp.day) ? todayComp.day : null;
  const isZen = store.getSettings().theme === 'zen';

  el.innerHTML = `
    ${isZen ? renderZenHeader({ day, count, streak }) : renderRingHeader({ day, count, streak })}

    <div class="today-status">
      ${todayDone
        ? `<div class="today-done">${icon('check', 18)} ${milestone ? `${milestone}일 달성을 축하해요!` : '오늘의 명상 완료!'}</div>
           <div class="today-sessions">오늘 ${store.todaySessionCount()}회 · ${store.todayMinutes()}분 명상했어요</div>
           <button id="btn-share" class="btn-small" style="margin-top:10px">인증 카드 공유</button>`
        : '<div style="color: var(--fg-dim)">오늘의 명상이 기다리고 있어요</div>'}
    </div>

    <button id="btn-start" class="btn-primary">
      ${todayDone ? '자유 명상 시작' : `Day ${day} 명상 시작`}
    </button>
    ${count > 0 ? '<button id="btn-share-progress" class="btn-ghost" style="margin-top:8px">여정 공유하기</button>' : ''}

    ${isZen
      ? `<div class="zen-guide">
           <div class="zen-guide-theme">${guide.phase} · DAY ${guide.day}</div>
           <div class="zen-guide-title">${guide.title}</div>
           <div class="zen-guide-text">${guide.text}</div>
         </div>`
      : `<div class="card guide-preview" style="margin-top:16px">
           <div class="guide-theme">${guide.phase} · DAY ${guide.day}</div>
           <div class="guide-title">${guide.title}</div>
           <div class="guide-text">${guide.text}</div>
         </div>`}

    <p class="daily-quote">"${getQuote()}"</p>
  `;

  el.querySelector('#btn-start').addEventListener('click', () => {
    location.hash = '#/session';
  });

  el.querySelector('#btn-share')?.addEventListener('click', () => {
    const [y, m, d] = store.todayKey().split('-');
    shareCard({
      day: todayComp.day,
      dateLabel: `${y}.${m}.${d}`,
      streak,
      count,
      total: store.TOTAL_DAYS,
    });
  });

  el.querySelector('#btn-share-progress')?.addEventListener('click', () => {
    shareProgress({
      count,
      total: store.TOTAL_DAYS,
      streak,
      totalMinutes: store.totalMinutes(),
      milestone,
    });
  });
}

function renderRingHeader({ day, count, streak }) {
  const pct = count / store.TOTAL_DAYS;
  const R = 88;
  const CIRC = 2 * Math.PI * R;
  return `
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
    </div>`;
}

// 미니멀 선 테마 전용 헤더: 링 대신 얇은 진행 바 + 큰 가는 굵기의 Day 숫자
function renderZenHeader({ day, count, streak }) {
  const pct = Math.round((count / store.TOTAL_DAYS) * 100);
  const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const weekday = WEEKDAYS[new Date().getDay()];
  return `
    <div class="zen-topbar">
      <span>명상 100일</span>
      <span>${weekday}</span>
    </div>
    <div class="zen-day-block">
      <div class="zen-day-kicker">DAY</div>
      <div class="zen-day-number">${day}</div>
    </div>
    <div class="zen-progress">
      <div class="zen-progress-track"><div class="zen-progress-fill" style="width:${pct}%"></div></div>
      <div class="zen-progress-meta"><span>${count} / ${store.TOTAL_DAYS} 완료</span><span>${streak}일 연속</span></div>
    </div>`;
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
      <button id="btn-share-done" class="btn-small" style="margin:12px auto 0">완주 카드 공유</button>
      <a href="#/calendar" class="btn-ghost" style="margin-top:12px">나의 100일 돌아보기</a>
    </div>
  `;
  el.querySelector('#btn-free').addEventListener('click', () => {
    location.hash = '#/session';
  });
  el.querySelector('#btn-share-done').addEventListener('click', () => {
    shareProgress({
      count: store.TOTAL_DAYS,
      total: store.TOTAL_DAYS,
      streak,
      totalMinutes: store.totalMinutes(),
      milestone: 100,
    });
  });
}
