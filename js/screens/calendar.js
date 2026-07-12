import * as store from '../store.js';
import { getGuide } from '../data/guides.js';

let viewYear, viewMonth; // 월별 달력 현재 표시 월

export function mountCalendar(el) {
  const now = new Date();
  if (viewYear === undefined) {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }
  render(el);
}

function render(el) {
  const completions = store.getCompletions();
  const count = store.completedCount();
  const streak = store.getStreak();
  const longest = store.getLongestStreak();

  // Day N → 날짜 역참조 (그리드 셀 탭 → 일지 이동용)
  const dayToDate = {};
  for (const [date, c] of Object.entries(completions)) dayToDate[c.day] = date;

  const nextDay = store.isComplete() || store.isTodayDone() ? null : store.getCurrentDay();

  let grid = '';
  for (let d = 1; d <= store.TOTAL_DAYS; d++) {
    const done = d in dayToDate;
    const p = Math.floor((d - 1) / 10); // 10일 단위 테마 밴드 (0~9)
    grid += done
      ? `<button class="grid-cell done phase-${p}" data-date="${dayToDate[d]}">${d}</button>`
      : `<div class="grid-cell ${d === nextDay ? 'today-next' : ''}">${d}</div>`;
  }

  el.innerHTML = `
    <h1 class="screen-title">달력</h1>
    <div class="stats-row">
      <div class="stat"><div class="stat-num">${count}</div><div class="stat-label">총 완료</div></div>
      <div class="stat"><div class="stat-num">${streak}</div><div class="stat-label">현재 연속</div></div>
      <div class="stat"><div class="stat-num">${longest}</div><div class="stat-label">최장 연속</div></div>
    </div>
    <div class="card">
      <div class="card-label">최근 7일 · 총 명상 ${formatMinutes(store.totalMinutes())}</div>
      <div class="week-strip">${renderWeekStrip(completions)}</div>
    </div>
    ${renderTimeOfDay(completions)}
    <div class="card">
      <div class="guide-theme" style="font-size:12px;color:var(--accent);font-weight:700;margin-bottom:10px">100일 챌린지 · 10단계 여정</div>
      ${renderPhaseLegend()}
      <div class="grid-100">${grid}</div>
    </div>
    <div class="card">
      <div class="month-nav">
        <button class="btn-small" id="prev-month">‹</button>
        <div class="month-title">${viewYear}년 ${viewMonth + 1}월</div>
        <button class="btn-small" id="next-month">›</button>
      </div>
      <div class="month-grid">${renderMonth(completions)}</div>
    </div>
  `;

  el.querySelector('#prev-month').addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    render(el);
  });
  el.querySelector('#next-month').addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    render(el);
  });
  el.querySelectorAll('.grid-cell.done').forEach((cell) => {
    cell.addEventListener('click', () => {
      location.hash = `#/journal?date=${cell.dataset.date}`;
    });
  });
}

function formatMinutes(min) {
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
}

// 10단계 테마 색 범례 — 100칸 그리드의 색 밴드 의미를 설명한다.
function renderPhaseLegend() {
  let items = '';
  for (let k = 0; k < 10; k++) {
    const phase = getGuide(k * 10 + 1).phase;
    items += `<span class="phase-legend-item"><span class="phase-dot phase-${k}"></span>${phase}</span>`;
  }
  return `<div class="phase-legend">${items}</div>`;
}

function renderWeekStrip(completions) {
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = store.todayKey(d);
    const done = key in completions;
    html += `
      <div class="wday ${i === 0 ? 'is-today' : ''}">
        <div class="wdot ${done ? 'done' : ''}"></div>
        <div class="wlabel">${i === 0 ? '오늘' : DOW[d.getDay()]}</div>
      </div>`;
  }
  return html;
}

// 시간대별 명상 횟수: 시작 시각 기준 (없으면 완료 시각으로 대체)
const TIME_SLOTS = [
  { label: '새벽', range: '00-06', from: 0, to: 6 },
  { label: '아침', range: '06-09', from: 6, to: 9 },
  { label: '오전', range: '09-12', from: 9, to: 12 },
  { label: '오후', range: '12-18', from: 12, to: 18 },
  { label: '저녁', range: '18-21', from: 18, to: 21 },
  { label: '밤', range: '21-24', from: 21, to: 24 },
];

function renderTimeOfDay(completions) {
  const counts = TIME_SLOTS.map(() => 0);
  for (const c of Object.values(completions)) {
    const d = new Date(c.startedAt || c.completedAt);
    if (Number.isNaN(d.getTime())) continue;
    const h = d.getHours();
    const i = TIME_SLOTS.findIndex((s) => h >= s.from && h < s.to);
    if (i >= 0) counts[i] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return '';

  const max = Math.max(...counts);
  const best = TIME_SLOTS[counts.indexOf(max)];

  const rows = TIME_SLOTS.map((slot, i) => `
    <div class="tod-row ${counts[i] === max && counts[i] > 0 ? 'is-best' : ''}">
      <span class="tod-label">${slot.label}</span>
      <span class="tod-track"><span class="tod-bar" style="width:${(counts[i] / max) * 100}%"></span></span>
      <span class="tod-count">${counts[i] || ''}</span>
    </div>
  `).join('');

  return `
    <div class="card">
      <div class="card-label">시간대 · 주로 ${best.label}에 명상해요</div>
      <div class="tod-chart">${rows}</div>
    </div>
  `;
}

function renderMonth(completions) {
  const todayK = store.todayKey();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  let html = ['일', '월', '화', '수', '목', '금', '토']
    .map((d) => `<div class="dow">${d}</div>`)
    .join('');
  html += '<div></div>'.repeat(firstDow);

  for (let d = 1; d <= daysInMonth; d++) {
    const key = store.todayKey(new Date(viewYear, viewMonth, d));
    const cls = ['mday'];
    if (key in completions) cls.push('done');
    if (key === todayK) cls.push('is-today');
    html += `<div class="${cls.join(' ')}">${d}</div>`;
  }
  return html;
}
