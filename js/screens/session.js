import * as store from '../store.js';
import { getGuide } from '../data/guides.js';
import { createTimer, formatTime } from '../timer.js';
import { playBell, playEndBells, startAmbient, stopAmbient, resumeAudio } from '../audio.js';
import { requestWakeLock, releaseWakeLock } from '../wakelock.js';

// ?dev 쿼리로 10초 세션 허용 (검증용)
const DEV_MODE = new URLSearchParams(location.search).has('dev');

let timer = null;
let breathInterval = null;

export function mountSession(el) {
  document.body.classList.add('session-active');

  const isFree = store.isTodayDone(); // 오늘 이미 완료 → 자유 명상 (도장 없음)
  const day = store.getCurrentDay();
  const guide = getGuide(day);
  const recovered = store.getActiveSession();

  renderPreroll(el, { guide, isFree, recovered });
}

export function unmountSession() {
  document.body.classList.remove('session-active');
  cleanup();
}

function cleanup() {
  if (timer) {
    timer.destroy();
    timer = null;
  }
  clearInterval(breathInterval);
  breathInterval = null;
  stopAmbient();
  releaseWakeLock();
}

// ---- 1단계: 시작 전 (가이드 표시 + 시작 버튼 = 오디오 잠금 해제 제스처) ----

function renderPreroll(el, { guide, isFree, recovered }) {
  const canResume = recovered && Date.now() - recovered.startEpoch < 60 * 60 * 1000;

  el.innerHTML = `
    <div class="session-wrap">
      <div class="session-guide-theme">${guide.phase} · DAY ${guide.day}</div>
      <div class="session-guide-title">${isFree ? '자유 명상' : guide.title}</div>
      <p class="session-guide-text">${isFree ? '오늘의 도장은 이미 받았어요. 편안하게 한 번 더 머물러 보세요.' : guide.text}</p>
      ${canResume ? `
        <div class="card" style="max-width:320px">
          <p style="font-size:14px;color:var(--fg-dim);margin-bottom:12px">진행 중이던 명상이 있어요. 이어서 할까요?</p>
          <button id="btn-resume" class="btn-primary" style="padding:12px;font-size:15px">이어서 하기</button>
        </div>` : ''}
      <button id="btn-begin" class="btn-primary" style="max-width:320px">${canResume ? '처음부터 시작' : '시작하기'}</button>
      <a href="#/" class="btn-ghost">돌아가기</a>
    </div>
  `;

  el.querySelector('#btn-begin').addEventListener('click', () => {
    store.clearActiveSession();
    beginCountdown(el, { guide, isFree, resumeFrom: null });
  });

  if (canResume) {
    el.querySelector('#btn-resume').addEventListener('click', () => {
      startMeditation(el, {
        guide,
        isFree,
        resumeFrom: { startEpoch: recovered.startEpoch, pausedTotal: recovered.pausedTotal || 0 },
      });
    });
  }
}

// ---- 2단계: 5초 준비 카운트다운 ----

function beginCountdown(el, opts) {
  requestWakeLock();
  resumeAudio();

  el.innerHTML = `
    <div class="session-wrap">
      <div class="session-guide-text">곧 시작합니다. 편안한 자세를 찾으세요.</div>
      <div class="countdown-number" id="countdown">5</div>
    </div>
  `;

  let n = 5;
  const cd = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      clearInterval(cd);
      startMeditation(el, opts);
    } else {
      el.querySelector('#countdown').textContent = n;
    }
  }, 1000);
}

// ---- 3단계: 명상 진행 ----

function startMeditation(el, { guide, isFree, resumeFrom }) {
  const settings = store.getSettings();
  const durationMs = (DEV_MODE ? 10 : settings.sessionMinutes * 60) * 1000;

  requestWakeLock();
  playBell();
  startAmbient(settings.soundType, settings.soundVolume);

  el.innerHTML = `
    <div class="session-wrap">
      <div class="session-guide-theme" style="opacity:0.7">${isFree ? '자유 명상' : guide.title}</div>
      <div class="breath-stage">
        <div class="breath-circle ${settings.breathingGuide ? 'breathing' : ''}" id="breath-circle"></div>
        <div class="breath-label" id="breath-label">${settings.breathingGuide ? '들숨' : ''}</div>
      </div>
      <div class="session-time" id="time">${formatTime(durationMs)}</div>
      <div class="session-controls">
        <button id="btn-pause" class="btn-primary" style="background:var(--bg-card-hover);color:var(--fg)">일시정지</button>
        <button id="btn-quit" class="btn-primary" style="background:var(--bg-card);color:var(--danger)">그만하기</button>
      </div>
    </div>
  `;

  const timeEl = el.querySelector('#time');
  const pauseBtn = el.querySelector('#btn-pause');
  const circle = el.querySelector('#breath-circle');
  const label = el.querySelector('#breath-label');

  // 호흡 라벨: CSS 애니메이션(8초 주기, 0~4초 확대=들숨)과 같은 시점에 시작해 동기화
  if (settings.breathingGuide) {
    let inhale = true;
    breathInterval = setInterval(() => {
      inhale = !inhale;
      label.textContent = inhale ? '들숨' : '날숨';
    }, 4000);
  }

  timer = createTimer({
    durationMs,
    onTick: (rem) => {
      timeEl.textContent = formatTime(rem);
    },
    onComplete: () => completeSession(el, { guide, isFree, durationMs }),
  });

  timer.start(resumeFrom);

  // 크래시 복구용으로 시작 시각 저장
  store.saveActiveSession({
    startEpoch: timer.state.startEpoch,
    pausedTotal: timer.state.pausedTotal,
    day: guide.day,
  });

  pauseBtn.addEventListener('click', () => {
    if (timer.isPaused) {
      timer.resume();
      resumeAudio();
      pauseBtn.textContent = '일시정지';
      circle.style.animationPlayState = 'running';
      // 일시정지 시간만큼 시작점이 밀린 것으로 저장
      store.saveActiveSession({
        startEpoch: timer.state.startEpoch,
        pausedTotal: timer.state.pausedTotal,
        day: guide.day,
      });
    } else {
      timer.pause();
      stopAmbient();
      pauseBtn.textContent = '계속하기';
      circle.style.animationPlayState = 'paused';
    }
  });

  el.querySelector('#btn-quit').addEventListener('click', () => {
    if (confirm('정말 그만할까요? 이번 명상은 기록되지 않아요.')) {
      store.clearActiveSession();
      cleanup();
      location.hash = '#/';
    }
  });
}

// ---- 4단계: 완료 ----

function completeSession(el, { guide, isFree, durationMs }) {
  store.clearActiveSession();
  clearInterval(breathInterval);
  stopAmbient();
  releaseWakeLock();
  playEndBells();

  if (isFree) {
    el.innerHTML = `
      <div class="session-wrap">
        <div class="stamp-pop">🧘</div>
        <div class="session-guide-title">자유 명상 완료</div>
        <p class="session-guide-text">오늘 두 번째 고요한 시간이었어요.</p>
        <a href="#/" class="btn-primary" style="max-width:320px;text-align:center;text-decoration:none">홈으로</a>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="session-wrap">
      <div class="stamp-pop">✅</div>
      <div class="session-guide-title">Day ${guide.day} 완료!</div>
      <div class="reflection-box">
        <p class="session-guide-text" style="margin-bottom:10px">오늘의 명상은 어땠나요?</p>
        <textarea id="note" placeholder="짧게 소감을 남겨보세요 (선택)"></textarea>
        <button id="btn-save" class="btn-primary">저장</button>
        <button id="btn-skip" class="btn-ghost">건너뛰기</button>
      </div>
    </div>
  `;

  const finish = (note) => {
    store.recordCompletion({ durationSec: Math.round(durationMs / 1000), note });
    location.hash = '#/';
  };

  el.querySelector('#btn-save').addEventListener('click', () => {
    finish(el.querySelector('#note').value.trim());
  });
  el.querySelector('#btn-skip').addEventListener('click', () => finish(''));
}
