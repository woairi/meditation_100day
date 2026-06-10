// 타임스탬프 기반 타이머: 틱을 세지 않고 매 렌더마다 Date.now()로 남은 시간을 계산한다.
// 탭이 백그라운드로 가도 시간은 정확하며, 복귀 시 즉시 재계산된다.

export function createTimer({ durationMs, onTick, onComplete }) {
  let startEpoch = null;
  let pausedAt = null;
  let pausedTotal = 0;
  let intervalId = null;
  let completed = false;

  function remaining() {
    if (startEpoch === null) return durationMs;
    const ref = pausedAt !== null ? pausedAt : Date.now();
    return Math.max(0, durationMs - (ref - startEpoch - pausedTotal));
  }

  function tick() {
    const rem = remaining();
    onTick(rem);
    if (rem <= 0 && !completed && pausedAt === null) {
      completed = true;
      stopLoop();
      onComplete();
    }
  }

  function startLoop() {
    stopLoop();
    intervalId = setInterval(tick, 250); // 표시 전용 — 정확도는 타임스탬프가 보장
  }

  function stopLoop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && startEpoch !== null && !completed) {
      tick(); // 복귀 즉시 재계산 — 이미 끝났으면 여기서 완료 발화
    }
  }

  document.addEventListener('visibilitychange', onVisible);

  return {
    start(resumeFrom = null) {
      // resumeFrom: 크래시 복구 시 기존 시작 시각/일시정지 누적값으로 이어가기
      startEpoch = resumeFrom?.startEpoch ?? Date.now();
      pausedTotal = resumeFrom?.pausedTotal ?? 0;
      pausedAt = null;
      completed = false;
      startLoop();
      tick();
    },
    pause() {
      if (pausedAt !== null || startEpoch === null) return;
      pausedAt = Date.now();
      stopLoop();
      onTick(remaining());
    },
    resume() {
      if (pausedAt === null) return;
      pausedTotal += Date.now() - pausedAt;
      pausedAt = null;
      startLoop();
    },
    destroy() {
      stopLoop();
      document.removeEventListener('visibilitychange', onVisible);
    },
    get isPaused() {
      return pausedAt !== null;
    },
    get state() {
      return { startEpoch, pausedTotal, pausedAt };
    },
    remaining,
  };
}

export function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
