import * as store from '../store.js';
import { getGuide } from '../data/guides.js';
import { startAmbient, stopAmbient, setAmbientVolume } from '../audio.js';

const SOUND_LABELS = {
  none: '없음',
  rain: '빗소리',
  waves: '파도',
  white: '백색소음',
  brown: '갈색소음',
};

let previewTimeout = null;

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
  const settings = store.getSettings();

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
      <div class="streak-badge">🔥 ${streak}일 연속</div>
    </div>

    <div class="today-status">
      ${todayDone
        ? '<div class="today-done">✅ 오늘의 명상 완료!</div>'
        : '<div style="color: var(--fg-dim)">오늘의 명상이 기다리고 있어요</div>'}
    </div>

    <div class="card guide-preview">
      <div class="guide-theme">${guide.phase} · DAY ${guide.day}</div>
      <div class="guide-title">${guide.title}</div>
      <div class="guide-text">${guide.text}</div>
    </div>

    <div class="card">
      <div class="sound-row">
        <label>배경 사운드</label>
        <select id="sound-type">
          ${Object.entries(SOUND_LABELS)
            .map(([v, l]) => `<option value="${v}" ${v === settings.soundType ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </div>
      <div class="sound-row">
        <label>볼륨</label>
        <input id="sound-volume" type="range" min="0" max="1" step="0.05" value="${settings.soundVolume}">
      </div>
    </div>

    <button id="btn-start" class="btn-primary">
      ${todayDone ? '자유 명상 시작' : `🧘 Day ${day} 명상 시작`}
    </button>
  `;

  el.querySelector('#sound-type').addEventListener('change', (e) => {
    store.updateSettings({ soundType: e.target.value });
    previewSound();
  });

  el.querySelector('#sound-volume').addEventListener('input', (e) => {
    store.updateSettings({ soundVolume: parseFloat(e.target.value) });
    setAmbientVolume(parseFloat(e.target.value));
  });

  el.querySelector('#btn-start').addEventListener('click', () => {
    stopAmbient();
    location.hash = '#/session';
  });
}

// 사운드 선택 시 3초 미리듣기 (select 변경도 사용자 제스처라 AudioContext 생성 가능)
function previewSound() {
  const { soundType, soundVolume } = store.getSettings();
  clearTimeout(previewTimeout);
  startAmbient(soundType, soundVolume);
  previewTimeout = setTimeout(() => stopAmbient(), 3000);
}

function renderCelebration(el) {
  const streak = store.getLongestStreak();
  el.innerHTML = `
    <div class="celebrate">
      <div class="big-emoji">🎉</div>
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
