// 종소리와 배경 사운드를 전부 Web Audio API로 합성한다 — 오디오 파일 없음.
// AudioContext는 자동재생 정책 때문에 반드시 사용자 제스처 안에서 생성/재개해야 한다.

let ctx = null;
let ambient = null; // { master, nodes: [...정지할 노드들] }

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend();
}

// ---- 종소리: 비조화 배음 사인파 + 지수 감쇠 ----

export function playBell(volume = 0.6) {
  const ac = getCtx();
  const t = ac.currentTime;
  // 종 특유의 비조화 배음 비율, 높은 배음일수록 빨리 감쇠
  const partials = [
    { ratio: 1.0, gain: 1.0, decay: 4.0 },
    { ratio: 2.4, gain: 0.45, decay: 2.5 },
    { ratio: 5.95, gain: 0.18, decay: 1.2 },
  ];
  for (const p of partials) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 523.25 * p.ratio;
    g.gain.setValueAtTime(volume * p.gain * 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + p.decay + 0.1);
  }
}

// 종료 신호는 1.5초 간격 3타로 명확하게
export function playEndBells(volume = 0.6) {
  playBell(volume);
  setTimeout(() => playBell(volume), 1500);
  setTimeout(() => playBell(volume), 3000);
}

// ---- 노이즈 버퍼 ----

function makeNoiseBuffer(ac, type) {
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  if (type === 'brown') {
    // 누설 적분기(leaky integrator)로 브라운 노이즈 생성 후 정규화
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function loopingNoise(ac, type) {
  const src = ac.createBufferSource();
  src.buffer = makeNoiseBuffer(ac, type);
  src.loop = true;
  return src;
}

// ---- 배경 사운드 엔진 ----
// white: 백색소음 그대로 / brown: 갈색소음 / rain: 밴드패스 필터 / waves: LFO로 스웰 변조

export function startAmbient(type, volume = 0.5) {
  stopAmbient();
  if (!type || type === 'none') return;

  const ac = getCtx();
  const t = ac.currentTime;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.linearRampToValueAtTime(volume * 0.5, t + 1); // 1초 페이드인
  master.connect(ac.destination);

  const nodes = [];

  if (type === 'white') {
    const src = loopingNoise(ac, 'white');
    const g = ac.createGain();
    g.gain.value = 0.25;
    src.connect(g).connect(master);
    src.start();
    nodes.push(src);
  } else if (type === 'brown') {
    const src = loopingNoise(ac, 'brown');
    const g = ac.createGain();
    g.gain.value = 0.5;
    src.connect(g).connect(master);
    src.start();
    nodes.push(src);
  } else if (type === 'rain') {
    // 중역대 밴드패스 = 빗소리 본체
    const body = loopingNoise(ac, 'white');
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 0.7;
    const bodyGain = ac.createGain();
    bodyGain.gain.value = 0.35;
    body.connect(bp).connect(bodyGain).connect(master);
    body.start();
    // 고역 하이패스 레이어 = 빗방울 "솨아" 질감
    const hiss = loopingNoise(ac, 'white');
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const hissGain = ac.createGain();
    hissGain.gain.value = 0.08;
    hiss.connect(hp).connect(hissGain).connect(master);
    hiss.start();
    nodes.push(body, hiss);
  } else if (type === 'waves') {
    // 브라운 노이즈를 느린 LFO(~0.08Hz)로 게인/컷오프 동시 변조 → 파도 스웰
    const src = loopingNoise(ac, 'brown');
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    const swell = ac.createGain();
    swell.gain.value = 0.6;
    src.connect(lp).connect(swell).connect(master);
    src.start();

    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoToGain = ac.createGain();
    lfoToGain.gain.value = 0.35; // 0.25 ~ 0.95 사이 스웰
    lfo.connect(lfoToGain).connect(swell.gain);
    const lfoToFreq = ac.createGain();
    lfoToFreq.gain.value = 400; // 컷오프 400 ~ 1200Hz
    lfo.connect(lfoToFreq).connect(lp.frequency);
    lfo.start();
    nodes.push(src, lfo);
  }

  ambient = { master, nodes };
}

export function stopAmbient() {
  if (!ambient) return;
  const { master, nodes } = ambient;
  ambient = null;
  const ac = getCtx();
  const t = ac.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0.0001, t + 1); // 1초 페이드아웃
  setTimeout(() => {
    for (const n of nodes) {
      try { n.stop(); } catch { /* 이미 정지됨 */ }
    }
    master.disconnect();
  }, 1100);
}

export function setAmbientVolume(volume) {
  if (!ambient) return;
  const ac = getCtx();
  ambient.master.gain.setTargetAtTime(volume * 0.5, ac.currentTime, 0.1);
}
