import * as store from '../store.js';
import { getGuide, getFreeGuide, suggestedSound } from '../data/guides.js';
import { createTimer, formatTime } from '../timer.js';
import { playBell, playEndBells, startAmbient, stopAmbient, setAmbientVolume, resumeAudio } from '../audio.js';
import { requestWakeLock, releaseWakeLock } from '../wakelock.js';
import { icon } from '../icons.js';
import { showConfirm } from '../ui.js';
import { moodPickerHTML, wireMoodPicker } from '../mood.js';
import * as notify from '../notify.js';
import { speak, stopSpeech, speechSupported } from '../speech.js';

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
  '4-7-8': [['들숨', 4, true], ['멈춤', 7, true], ['날숨', 8, false]],
  coherent: [['들숨', 5.5, true], ['날숨', 5.5, false]],
};

const RESUME_WINDOW_MS = 60 * 60 * 1000; // 1시간 내 중단된 세션만 복구 제안

// 중간 종을 울릴 경과 시간(ms) 목록. 종료 종과 겹치지 않도록 durationMs 미만만.
function computeIntervalBells(mode, durationMs) {
  const times = [];
  if (mode === 'half') {
    if (durationMs > 2000) times.push(durationMs / 2);
  } else if (mode === '5' || mode === '10') {
    const step = parseInt(mode, 10) * 60 * 1000;
    for (let t = step; t < durationMs; t += step) times.push(t);
  }
  return times;
}

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
  // 자유/지속 명상은 날마다 순환하는 안내를 보여준다 (day 100 반복 대신)
  const guide = isFree ? getFreeGuide(day) : getGuide(day);
  const recovered = store.getActiveSession();

  renderPreroll(el, { guide, day, isFree, recovered });
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
  stopSpeech();
  releaseWakeLock();
}

// ---- 1단계: 시작 전 (가이드 + 사운드 설정 + 시작 버튼 = 오디오 잠금 해제 제스처) ----

function renderPreroll(el, { guide, day, isFree, recovered }) {
  const canResume = recovered
    && typeof recovered.remainingMs === 'number'
    && recovered.remainingMs > 0
    && Date.now() - (recovered.savedAt || 0) < RESUME_WINDOW_MS;
  const settings = store.getSettings();
  const resumeLabel = canResume ? formatTime(recovered.remainingMs) : '';
  const suggested = suggestedSound(day); // 이 단계에 어울리는 배경음
  const showSuggestion = suggested !== settings.soundType;

  el.innerHTML = `
    <div class="session-wrap">
      <div class="session-guide-theme">${isFree ? '자유 명상 · 지속' : `${guide.phase} · DAY ${guide.day}`}</div>
      <div class="session-guide-title">${guide.title}</div>
      <p class="session-guide-text">${guide.text}</p>
      ${speechSupported() ? '<button id="btn-narrate" class="btn-small">가이드 낭독 듣기</button>' : ''}
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
        <div class="sound-suggest" id="sound-suggest" ${showSuggestion ? '' : 'hidden'}>
          이 단계엔 '${SOUND_LABELS[suggested]}' 추천 · <button id="btn-apply-sound" data-sound="${suggested}">적용</button>
        </div>
      </div>
      <details class="posture-tip">
        <summary>준비 자세 안내</summary>
        <p>허리를 부드럽게 세우고 어깨의 힘을 뺍니다. 손은 무릎이나 허벅지에 편히 두고, 눈은 살며시 감거나 시선을 아래로 내립니다. 특별히 애쓰지 않아도 괜찮아요.</p>
      </details>
      ${isFree ? '' : `
        <div class="card" style="max-width:320px;width:100%;margin-bottom:0">
          ${moodPickerHTML('pre-mood', '지금 마음 상태는 어떤가요? (선택)')}
        </div>`}
      ${canResume ? `
        <div class="card" style="max-width:320px;width:100%;margin-bottom:0">
          <p style="font-size:14px;color:var(--fg-dim);margin-bottom:12px">진행 중이던 명상이 있어요.<br>${resumeLabel} 남은 지점부터 이어서 할까요?</p>
          <button id="btn-resume" class="btn-primary" style="padding:12px;font-size:15px">이어서 하기</button>
        </div>` : ''}
      <button id="btn-begin" class="btn-primary" style="max-width:320px">${canResume ? '처음부터 시작' : '시작하기'} · ${DEV_MODE ? '10초' : `${settings.sessionMinutes}분`}</button>
      <a href="#/" class="btn-ghost">돌아가기</a>
    </div>
  `;

  const getPreMood = wireMoodPicker(el, 'pre-mood');
  const soundSelect = el.querySelector('#sound-type');
  const soundSuggest = el.querySelector('#sound-suggest');

  // 가이드 낭독: 탭하면 재생/정지 토글 (버튼 탭 = 사용자 제스처)
  el.querySelector('#btn-narrate')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.playing) {
      stopSpeech();
      btn.dataset.playing = '';
      btn.textContent = '가이드 낭독 듣기';
    } else {
      speak(`${guide.title}. ${guide.text}`, {
        onend: () => { btn.dataset.playing = ''; btn.textContent = '가이드 낭독 듣기'; },
      });
      btn.dataset.playing = '1';
      btn.textContent = '낭독 멈추기';
    }
  });

  // 추천 배경음 적용
  el.querySelector('#btn-apply-sound')?.addEventListener('click', (e) => {
    const val = e.currentTarget.dataset.sound;
    soundSelect.value = val;
    soundSelect.dispatchEvent(new Event('change')); // 저장 + 미리듣기 재사용
    if (soundSuggest) soundSuggest.hidden = true;
  });

  // 사운드 변경 시 3초 미리듣기 (select 변경도 사용자 제스처라 AudioContext 생성 가능)
  soundSelect.addEventListener('change', (e) => {
    store.updateSettings({ soundType: e.target.value });
    if (soundSuggest) soundSuggest.hidden = true; // 사용자가 선택했으니 추천 숨김
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
    beginCountdown(el, { guide, isFree, resume: null, preMood: getPreMood() });
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
        preMood: null, // 복구 세션은 시작 전 마음 상태를 다시 묻지 않는다
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
      <div class="countdown-number" id="countdown" aria-live="assertive" aria-label="시작까지 5초">5</div>
      <button id="btn-skip-cd" class="btn-ghost">바로 시작</button>
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
      if (cdEl) {
        cdEl.textContent = n;
        cdEl.setAttribute('aria-label', `시작까지 ${n}초`);
      }
    }
  }, 1000);

  el.querySelector('#btn-skip-cd').addEventListener('click', () => {
    clearInterval(cd);
    startMeditation(el, opts);
  });
}

// ---- 3단계: 명상 진행 ----

function startMeditation(el, { guide, isFree, resume, preMood }) {
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
        <div class="session-time" id="time" role="timer" aria-label="남은 시간 ${formatTime(durationMs)}">${formatTime(durationMs)}</div>
        <div class="sr-only" id="time-sr" aria-live="polite"></div>
        <div class="session-controls">
          <button id="btn-pause" class="btn-primary" style="background:var(--bg-card-hover);color:var(--fg)">일시정지</button>
          <button id="btn-quit" class="btn-primary" style="background:var(--bg-card);color:var(--danger)">그만하기</button>
        </div>
      </div>
    </div>
  `;

  const timeEl = el.querySelector('#time');
  const srEl = el.querySelector('#time-sr');
  const pauseBtn = el.querySelector('#btn-pause');
  const circle = el.querySelector('#breath-circle');
  const label = el.querySelector('#breath-label');
  const hud = el.querySelector('#hud');
  let lastAnnouncedMin = -1; // 스크린리더 과잉 낭독 방지: 분이 바뀔 때만 알림

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

  // 중간 종 스케줄. 복구 세션은 이미 지난 시점의 종은 건너뛴다.
  const bellTimes = computeIntervalBells(settings.intervalBell, durationMs);
  let bellIdx = bellTimes.filter((t) => t <= (resume ? resume.elapsedMs : 0)).length;

  // 현재 남은 시간을 저장 → 페이지가 종료돼도 그 지점부터 복구된다.
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
      timeEl.setAttribute('aria-label', `남은 시간 ${formatTime(rem)}`);
      // 분이 바뀔 때만 스크린리더에 알림 (매초 낭독 방지)
      const min = Math.ceil(rem / 60000);
      if (min !== lastAnnouncedMin) {
        lastAnnouncedMin = min;
        srEl.textContent = min > 0 ? `${min}분 남음` : '';
      }
      // 중간 종: 경과 시간이 예정 지점을 지나면 부드러운 종소리 (종료 종보다 작게)
      const elapsed = durationMs - rem;
      while (bellIdx < bellTimes.length && elapsed >= bellTimes[bellIdx]) {
        playBell(settings.soundVolume * 0.6);
        bellIdx += 1;
      }
      // 5초마다 진행 상태를 저장(포그라운드에서 강제 종료되는 드문 경우 대비)
      const now = Date.now();
      if (now - lastPersist > 5000) {
        lastPersist = now;
        persistProgress();
      }
    },
    onComplete: () => completeSession(el, { guide, isFree, durationMs, startedAtISO, preMood }),
  });

  timer.start(resume ? { elapsedMs: resume.elapsedMs } : {});
  persistProgress();

  // 시작 시 가이드 낭독 (설정 시, 새 세션에서만)
  if (settings.guideNarration && !resume) {
    speak(`${guide.title}. ${guide.text}`);
  }

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

  // 화면을 끄거나 앱을 전환해 백그라운드에 가더라도 타이머는 계속 흐른다
  // (화면 끄고 눈 감고 명상하는 경우를 위해 자동 일시정지하지 않는다).
  // 대신 그 순간의 남은 시간을 저장해 두어, 앱이 종료되면 그 지점부터 복구한다.
  // 돌아오면 오디오 컨텍스트를 다시 깨운다(OS가 중단시켰을 수 있음).
  visHandler = () => {
    if (!timer || timer.isPaused) return;
    if (document.visibilityState === 'hidden') persistProgress();
    else resumeAudio();
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

function completeSession(el, { guide, isFree, durationMs, startedAtISO, preMood }) {
  store.clearActiveSession();
  clearTimeout(breathTimeout);
  clearTimeout(hudTimeout);
  stopAmbient();
  stopSpeech();
  releaseWakeLock();
  playEndBells(store.getSettings().soundVolume);
  if (navigator.vibrate) navigator.vibrate([120, 80, 120]); // 화면을 안 봐도 끝을 알 수 있게

  // 도장 세션과 자유 세션 모두 소감을 남길 수 있게 통일 (자유 세션도 기록됨)
  const heading = isFree
    ? `<div class="stamp-pop">${icon('circles', 88)}</div><div class="session-guide-title">자유 명상 완료</div>`
    : `<div class="stamp-pop">${icon('checkCircle', 88)}</div><div class="session-guide-title">Day ${guide.day} 완료!</div>`;

  el.innerHTML = `
    <div class="session-wrap">
      ${heading}
      <div class="reflection-box">
        <p class="session-guide-text" style="margin-bottom:10px">${isFree ? '한 번 더 고요한 시간을 보냈어요.' : '오늘의 명상은 어땠나요?'}</p>
        ${moodPickerHTML('post-mood', '명상 후 마음 상태 (선택)')}
        <textarea id="note" placeholder="짧게 소감을 남겨보세요 (선택)" style="margin-top:12px"></textarea>
        <button id="btn-save" class="btn-primary">저장</button>
        <button id="btn-skip" class="btn-ghost">건너뛰기</button>
      </div>
    </div>
  `;

  const getPostMood = wireMoodPicker(el, 'post-mood');

  const finish = (note) => {
    store.recordSession({
      durationSec: Math.round(durationMs / 1000),
      note,
      startedAt: startedAtISO,
      moodBefore: preMood ?? null,
      moodAfter: getPostMood(),
      isFree,
    });
    notify.syncReminderMeta(); // 오늘 완료 → 리마인더가 다시 울리지 않도록 메타 갱신
    location.hash = '#/';
  };

  el.querySelector('#btn-save').addEventListener('click', () => {
    finish(el.querySelector('#note').value.trim());
  });
  el.querySelector('#btn-skip').addEventListener('click', () => finish(''));
}
