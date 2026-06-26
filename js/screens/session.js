import * as store from '../store.js';
import { getGuide } from '../data/guides.js';
import { createTimer, formatTime } from '../timer.js';
import { playBell, playEndBells, startAmbient, stopAmbient, setAmbientVolume, resumeAudio } from '../audio.js';
import { requestWakeLock, releaseWakeLock } from '../wakelock.js';
import { icon } from '../icons.js';
import { showConfirm } from '../ui.js';

// ?dev 쿼리로 10초 세션 허용 (검증용)
const DEV_MODE = new URLSearchParams(location.search).has('dev');

const SOUND_LABELS = {
  none: '없음',
  rain: '빗소리',
  waves: '파도',
  stream: '시냇물',
  forest: '숲/새소리',
  campfire: '모닥불',
  bowl: '싱잉볼',
  white: '백색소음',
  brown: '갈색소음',
};

const HUD_HIDE_DELAY = 6000;

// 호흡 리듬: [라벨, 초, 원 확장 여부]
const BREATH_PHASES = {
  '4-4': [['들숨', 4, true], ['날숨', 4, false]],
  '4-6': [['들숨', 4, true], ['날숨', 6, false]],
  box: [['들숨', 4, true], ['멈춤', 4, true], ['날숨', 4, false], ['멈춤', 4, false]],
};

const RESUME_WINDOW_MS = 60 * 60 * 1000; // 1시간 내 중단된 세션만 복구 제안

let timer = null;
let breathTimeout = null;
let hudTimeout = null;
let previewTimeout = null;
let visHandler = null; // 백그라운드 진입 시 자동 일시정지 핸들러

// 호흡 원을 JS로 구동 — 리듬별 길이가 달라 CSS keyframe 고정 주기로는 불가능
function startBreathing(circle, label, pattern) {
  const phases = BREATH_PHASES[pattern] || BREATH_PHASES['4-4'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  const step = () => {
    const [text, dur, expanded] = phases[i % phases.length];
    label.textContent = text;
    if (reduced) {
      // 모션 최소화: 크기 대신 투명도로 리듬 표현
      circle.style.transform = 'scale(0.95)';
      circle.style.transition = `opacity ${dur}s ease-in-out`;
      circle.style.opacity = expanded ? '1' : '0.55';
    } else {
      circle.style.transition = `transform ${dur}s ease-in-out`;
      circle.style.transform = `scale(${expanded ? 1.18 : 0.72})`;
    }
    i += 1;
    breathTimeout = setTimeout(step, dur * 1000);
  };
  step();
}

function stopBreathing(circle) {
  clearTimeout(breathTimeout);
  breathTimeout = null;
  if (circle) {
    // 전환 중이던 자리에서 그대로 멈춘다
    circle.style.transform = getComputedStyle(circle).transform;
    circle.style.transition = 'none';
  }
}

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
  if (visHandler) {
    document.removeEventListener('visibilitychange', visHandler);
    visHandler = null;
  }
  clearTimeout(breathTimeout);
  breathTimeout = null;
  clearTimeout(hudTimeout);
  hudTimeout = null;
  clearTimeout(previewTimeout);
  previewTimeout = null;
  stopAmbient();
  releaseWakeLock();
}

// ---- 1단계: 시작 전 (가이드 + 사운드 설정 + 시작 버튼 = 오디오 잠금 해제 제스처) ----

function renderPreroll(el, { guide, isFree, recovered }) {
  const canResume = recovered
    && typeof recovered.remainingMs === 'number'
    && recovered.remainingMs > 0
    && Date.now() - (recovered.savedAt || 0) < RESUME_WINDOW_MS;
  const settings = store.getSettings();
  const resumeLabel = canResume ? formatTime(recovered.remainingMs) : '';

  el.innerHTML = `
    <div class="session-wrap">
      <div class="session-guide-theme">${guide.phase} · DAY ${guide.day}</div>
      <div class="session-guide-title">${isFree ? '자유 명상' : guide.title}</div>
      <p class="session-guide-text">${isFree ? '오늘의 도장은 이미 받았어요. 편안하게 한 번 더 머물러 보세요.' : guide.text}</p>
      <div class="card" style="max-width:320px;width:100%;margin-bottom:0">
        <div class="sound-row">
          <label for="sound-type">배경 사운드</label>
          <select id="sound-type">
            ${Object.entries(SOUND_LABELS)
              .map(([v, l]) => `<option value="${v}" ${v === settings.soundType ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>
        </div>
        <div class="sound-row" style="margin-bottom:0">
          <label for="sound-volume">볼륨</label>
          <input id="sound-volume" type="range" min="0" max="1" step="0.05" value="${settings.soundVolume}">
        </div>
      </div>
      ${canResume ? `
        <div class="card" style="max-width:320px;width:100%;margin-bottom:0">
          <p style="font-size:14px;color:var(--fg-dim);margin-bottom:12px">진행 중이던 명상이 있어요.<br>${resumeLabel} 남은 지점부터 이어서 할까요?</p>
          <button id="btn-resume" class="btn-primary" style="padding:12px;font-size:15px">이어서 하기</button>
        </div>` : ''}
      <button id="btn-begin" class="btn-primary" style="max-width:320px">${canResume ? '처음부터 시작' : '시작하기'} · ${DEV_MODE ? '10초' : `${settings.sessionMinutes}분`}</button>
      <a href="#/" class="btn-ghost">돌아가기</a>
    </div>
  `;

  // 사운드 변경 시 3초 미리듣기 (select 변경도 사용자 제스처라 AudioContext 생성 가능)
  el.querySelector('#sound-type').addEventListener('change', (e) => {
    store.updateSettings({ soundType: e.target.value });
    clearTimeout(previewTimeout);
    startAmbient(e.target.value, store.getSettings().soundVolume);
    previewTimeout = setTimeout(() => stopAmbient(), 3000);
  });

  el.querySelector('#sound-volume').addEventListener('input', (e) => {
    store.updateSettings({ soundVolume: parseFloat(e.target.value) });
    setAmbientVolume(parseFloat(e.target.value));
  });

  el.querySelector('#btn-begin').addEventListener('click', () => {
    clearTimeout(previewTimeout);
    stopAmbient();
    store.clearActiveSession();
    beginCountdown(el, { guide, isFree, resume: null });
  });

  if (canResume) {
    el.querySelector('#btn-resume').addEventListener('click', () => {
      clearTimeout(previewTimeout);
      stopAmbient();
      // 버튼 탭은 사용자 제스처라 오디오 재생이 허용된다 → 바로 명상 진행
      startMeditation(el, {
        guide,
        isFree,
        resume: {
          durationMs: recovered.durationMs,
          elapsedMs: Math.max(0, recovered.durationMs - recovered.remainingMs),
          startedAtISO: recovered.startedAtISO || null,
        },
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
      const cdEl = el.querySelector('#countdown');
      if (cdEl) cdEl.textContent = n;
    }
  }, 1000);
}

// ---- 3단계: 명상 진행 ----

function startMeditation(el, { guide, isFree, resume }) {
  const settings = store.getSettings();
  const durationMs = resume ? resume.durationMs : (DEV_MODE ? 10 : settings.sessionMinutes * 60) * 1000;
  // 시작 시각: 새 세션은 지금, 복구 세션은 원래 시작 시각을 이어받는다
  const startedAtISO = resume?.startedAtISO || new Date().toISOString();

  requestWakeLock();
  if (!resume) playBell(settings.soundVolume); // 복구 시에는 시작 종을 다시 울리지 않음
  startAmbient(settings.soundType, settings.soundVolume);

  el.innerHTML = `
    <div class="session-wrap" id="session-tap">
      <div class="session-guide-theme" style="opacity:0.7">${isFree ? '자유 명상' : guide.title}</div>
      <div class="breath-stage">
        <div class="breath-circle" id="breath-circle"></div>
        <div class="breath-label" id="breath-label"></div>
      </div>
      <div class="session-hud" id="hud">
        <div class="session-time" id="time">${formatTime(durationMs)}</div>
        <div class="session-controls">
          <button id="btn-pause" class="btn-primary" style="background:var(--bg-card-hover);color:var(--fg)">일시정지</button>
          <button id="btn-quit" class="btn-primary" style="background:var(--bg-card);color:var(--danger)">그만하기</button>
        </div>
      </div>
    </div>
  `;

  const timeEl = el.querySelector('#time');
  const pauseBtn = el.querySelector('#btn-pause');
  const circle = el.querySelector('#breath-circle');
  const label = el.querySelector('#breath-label');
  const hud = el.querySelector('#hud');

  // 몰입 모드: 몇 초 뒤 HUD를 숨기고, 화면 탭으로 다시 표시 (일시정지 중에는 항상 표시)
  const scheduleHudHide = () => {
    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      if (timer && !timer.isPaused) hud.classList.add('hud-hidden');
    }, HUD_HIDE_DELAY);
  };
  el.querySelector('#session-tap').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (hud.classList.contains('hud-hidden')) {
      hud.classList.remove('hud-hidden');
      scheduleHudHide();
    } else if (timer && !timer.isPaused) {
      hud.classList.add('hud-hidden');
    }
  });
  scheduleHudHide();

  if (settings.breathingGuide) {
    startBreathing(circle, label, settings.breathPattern);
  }

  // 현재 남은 시간을 동결해 저장 → 페이지가 종료돼도 그 지점부터 복구된다.
  // 통화 등으로 멈춰 있던 시간은 경과로 치지 않는다(자동 일시정지가 보장).
  let lastPersist = 0;
  const persistProgress = () => {
    if (!timer) return;
    store.saveActiveSession({
      day: guide.day,
      durationMs,
      remainingMs: timer.remaining(),
      startedAtISO,
      savedAt: Date.now(),
    });
  };

  timer = createTimer({
    durationMs,
    onTick: (rem) => {
      timeEl.textContent = formatTime(rem);
      // 5초마다 진행 상태를 저장(포그라운드에서 강제 종료되는 드문 경우 대비)
      const now = Date.now();
      if (now - lastPersist > 5000) {
        lastPersist = now;
        persistProgress();
      }
    },
    onComplete: () => completeSession(el, { guide, isFree, durationMs, startedAtISO }),
  });

  timer.start(resume ? { elapsedMs: resume.elapsedMs } : {});
  persistProgress();

  const doPause = () => {
    if (!timer || timer.isPaused) return;
    timer.pause();
    stopAmbient(); // 배경음 정지(스케줄러도 정리). 재개 시 다시 시작한다
    stopBreathing(circle);
    pauseBtn.textContent = '계속하기';
    clearTimeout(hudTimeout);
    hud.classList.remove('hud-hidden'); // 멈추면 컨트롤을 보이게
    persistProgress();
  };

  const doResume = () => {
    if (!timer || !timer.isPaused) return;
    timer.resume();
    resumeAudio();
    startAmbient(settings.soundType, settings.soundVolume); // 배경음 다시 시작
    pauseBtn.textContent = '일시정지';
    if (settings.breathingGuide) startBreathing(circle, label, settings.breathPattern);
    scheduleHudHide();
    persistProgress();
  };

  pauseBtn.addEventListener('click', () => {
    if (timer.isPaused) doResume();
    else doPause();
  });

  // 전화 수신·앱 전환 등으로 백그라운드에 가면 자동 일시정지 →
  // 통화 시간이 명상 시간에서 깎이지 않고, 종료돼도 남은 시간이 저장된다.
  visHandler = () => {
    if (document.visibilityState === 'hidden' && timer && !timer.isPaused) {
      doPause();
    }
  };
  document.addEventListener('visibilitychange', visHandler);

  el.querySelector('#btn-quit').addEventListener('click', async () => {
    clearTimeout(hudTimeout);
    const ok = await showConfirm({
      message: '정말 그만할까요?<br>이번 명상은 기록되지 않아요.',
      confirmText: '그만하기',
      cancelText: '계속하기',
      danger: true,
    });
    if (ok) {
      store.clearActiveSession();
      cleanup();
      location.hash = '#/';
    } else {
      scheduleHudHide();
    }
  });
}

// ---- 4단계: 완료 ----

function completeSession(el, { guide, isFree, durationMs, startedAtISO }) {
  store.clearActiveSession();
  clearTimeout(breathTimeout);
  clearTimeout(hudTimeout);
  stopAmbient();
  releaseWakeLock();
  playEndBells(store.getSettings().soundVolume);
  if (navigator.vibrate) navigator.vibrate([120, 80, 120]); // 화면을 안 봐도 끝을 알 수 있게

  if (isFree) {
    el.innerHTML = `
      <div class="session-wrap">
        <div class="stamp-pop">${icon('circles', 88)}</div>
        <div class="session-guide-title">자유 명상 완료</div>
        <p class="session-guide-text">오늘 두 번째 고요한 시간이었어요.</p>
        <a href="#/" class="btn-primary" style="max-width:320px;text-align:center;text-decoration:none">홈으로</a>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="session-wrap">
      <div class="stamp-pop">${icon('checkCircle', 88)}</div>
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
    store.recordCompletion({
      durationSec: Math.round(durationMs / 1000),
      note,
      startedAt: startedAtISO,
    });
    location.hash = '#/';
  };

  el.querySelector('#btn-save').addEventListener('click', () => {
    finish(el.querySelector('#note').value.trim());
  });
  el.querySelector('#btn-skip').addEventListener('click', () => finish(''));
}
