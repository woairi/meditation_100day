// 첫 방문 안내. 3~4장 슬라이드로 챌린지 규칙을 소개한다.
// 안내 완료 여부는 기록(state)과 별개의 localStorage 키에 둔다 — 백업/복원과 무관.

import { icon } from './icons.js';
import * as store from './store.js';

const KEY = 'meditation100.onboarded';

const SLIDES = [
  { icon: 'sprout', title: '명상 100일 챌린지', text: '하루 10분, 100일 동안 명상 습관을 만들어요. 로그인 없이 이 기기에만 기록이 저장됩니다.' },
  { icon: 'circles', title: 'Day N은 "진행도"예요', text: '완료한 날 수 + 1로 정해져요. 하루 걸러도 오늘의 안내가 밀리지 않습니다.' },
  { icon: 'flame', title: '스트릭은 "달력" 기준이에요', text: '하루라도 빠지면 연속 기록이 끊겨요. 잊지 않도록 설정에서 매일 알림을 켤 수 있습니다.' },
  { icon: 'checkCircle', title: '기록은 이 기기에만 있어요', text: '기기를 바꾸거나 브라우저 데이터를 지우기 전에, 설정에서 기록을 백업해 두세요.' },
];

function hasOnboarded() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // 저장소 접근 불가 시 안내를 반복해서 띄우지 않는다
  }
}

function markDone() {
  try {
    localStorage.setItem(KEY, '1');
  } catch { /* 무시 */ }
}

function showOnboarding() {
  let i = 0;
  const prevFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  document.body.appendChild(overlay);

  const done = () => {
    markDone();
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') done();
    else if (e.key === 'Enter') overlay.querySelector('.onboarding-next')?.click();
  };

  const render = () => {
    const s = SLIDES[i];
    const last = i === SLIDES.length - 1;
    overlay.innerHTML = `
      <div class="onboarding-card">
        <button class="onboarding-skip" aria-label="안내 건너뛰기">건너뛰기</button>
        <div class="onboarding-icon">${icon(s.icon, 64)}</div>
        <h2 class="onboarding-title">${s.title}</h2>
        <p class="onboarding-text">${s.text}</p>
        <div class="onboarding-dots">
          ${SLIDES.map((_, k) => `<span class="ob-dot ${k === i ? 'active' : ''}"></span>`).join('')}
        </div>
        <button class="btn-primary onboarding-next">${last ? '시작하기' : '다음'}</button>
      </div>`;
    overlay.querySelector('.onboarding-skip').addEventListener('click', done);
    overlay.querySelector('.onboarding-next').addEventListener('click', () => {
      if (last) done();
      else { i += 1; render(); }
    });
    overlay.querySelector('.onboarding-next').focus();
  };

  document.addEventListener('keydown', onKey);
  render();
}

// 첫 방문(기록도 없고 안내도 본 적 없음)일 때만 표시. 기존 사용자는 조용히 완료 처리.
export function maybeShowOnboarding() {
  if (hasOnboarded()) return;
  if (store.completedCount() > 0) { markDone(); return; }
  showOnboarding();
}
