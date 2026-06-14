// 종소리와 배경 사운드를 전부 Web Audio API로 합성한다 — 오디오 파일 없음.
// AudioContext는 자동재생 정책 때문에 반드시 사용자 제스처 안에서 생성/재개해야 한다.

let ctx = null;
let ambient = null; // 현재 재생 중인 배경음 인스턴스
let reverb = null;  // 종소리·싱잉볼이 공유하는 리버브 버스

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

// ---- 리버브(공명 꼬리): 지수 감쇠 노이즈로 만든 임펄스 응답을 컨볼브 ----

function makeImpulse(ac, seconds = 2.8, decay = 2.6) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function getReverb(ac) {
  if (reverb) return reverb;
  const conv = ac.createConvolver();
  conv.buffer = makeImpulse(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.55;
  conv.connect(wet).connect(ac.destination);
  reverb = { input: conv, wet };
  return reverb;
}

// ---- 종소리: 비조화 배음 사인파 + 지수 감쇠 + 리버브 ----

export function playBell(volume = 0.6) {
  const ac = getCtx();
  const t = ac.currentTime;
  const rev = getReverb(ac);
  // 종 특유의 비조화 배음 비율, 높은 배음일수록 빨리 감쇠
  const partials = [
    { ratio: 1.0, gain: 1.0, decay: 4.5 },
    { ratio: 2.4, gain: 0.45, decay: 2.8 },
    { ratio: 5.95, gain: 0.18, decay: 1.4 },
  ];
  for (const p of partials) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 523.25 * p.ratio;
    g.gain.setValueAtTime(volume * p.gain * 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
    osc.connect(g);
    g.connect(ac.destination);  // 드라이
    g.connect(rev.input);       // 리버브 전송
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

// ---- 노이즈 버퍼: 2채널(L/R 비상관)로 만들어 헤드폰 입체감 ----

function makeNoiseBuffer(ac, type) {
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
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

export function startAmbient(type, volume = 0.5) {
  stopAmbient();
  if (!type || type === 'none') return;

  const ac = getCtx();
  const t = ac.currentTime;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.linearRampToValueAtTime(volume * 0.5, t + 1); // 1초 페이드인
  master.connect(ac.destination);

  // inst를 캡처해 두면, 새 배경음이 시작돼도 옛 스케줄러는 멈춘다(alive=false)
  const inst = { master, nodes: [], timers: [], alive: true, noise: null };
  ambient = inst;

  // 스테레오 패너 (미지원 시 모노 폴백)
  const panner = (pan) => {
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      return p;
    }
    return ac.createGain();
  };

  // 랜덤 간격으로 fn을 반복 실행 (모닥불 크랙, 새소리 등)
  const every = (fn, min, max) => {
    const tick = () => {
      if (!inst.alive) return;
      fn();
      inst.timers.push(setTimeout(tick, min + Math.random() * (max - min)));
    };
    inst.timers.push(setTimeout(tick, min + Math.random() * (max - min)));
  };

  // 짧은 노이즈 버스트 (빗방울, 장작 크랙, 물방울 공용)
  const sharedNoise = () => {
    if (!inst.noise) inst.noise = makeNoiseBuffer(ac, 'white');
    return inst.noise;
  };
  const burst = ({ freq, q = 1, dur = 0.08, gain = 0.2, pan = 0, type: ft = 'bandpass' }) => {
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = sharedNoise();
    src.loop = true;
    const filt = ac.createBiquadFilter();
    filt.type = ft;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filt).connect(g).connect(panner(pan)).connect(master);
    src.start(now);
    src.stop(now + dur + 0.05);
  };

  const rand = (min, max) => min + Math.random() * (max - min);
  const { nodes } = inst;

  if (type === 'white') {
    const src = loopingNoise(ac, 'white');
    const g = ac.createGain();
    g.gain.value = 0.22;
    src.connect(g).connect(master);
    src.start();
    nodes.push(src);

  } else if (type === 'brown') {
    const src = loopingNoise(ac, 'brown');
    const g = ac.createGain();
    g.gain.value = 0.45;
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
    bodyGain.gain.value = 0.3;
    body.connect(bp).connect(bodyGain).connect(master);
    body.start();
    // 고역 하이패스 레이어 = "솨아" 질감
    const hiss = loopingNoise(ac, 'white');
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const hissGain = ac.createGain();
    hissGain.gain.value = 0.06;
    hiss.connect(hp).connect(hissGain).connect(master);
    hiss.start();
    // 저역 럼블 = 먼 빗줄기의 두께
    const rumble = loopingNoise(ac, 'brown');
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const rumbleGain = ac.createGain();
    rumbleGain.gain.value = 0.12;
    rumble.connect(lp).connect(rumbleGain).connect(master);
    rumble.start();
    nodes.push(body, hiss, rumble);
    // 가까이 떨어지는 물방울
    every(() => burst({
      freq: rand(1200, 3000), q: 3, dur: rand(0.04, 0.12),
      gain: rand(0.05, 0.14), pan: rand(-0.8, 0.8),
    }), 250, 1000);

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
    lfoToGain.gain.value = 0.35;
    lfo.connect(lfoToGain).connect(swell.gain);
    const lfoToFreq = ac.createGain();
    lfoToFreq.gain.value = 400;
    lfo.connect(lfoToFreq).connect(lp.frequency);
    lfo.start();
    nodes.push(src, lfo);
    // 부서지는 포말: 천천히 차올랐다 잦아드는 고역 노이즈
    every(() => {
      const now = ac.currentTime;
      const fsrc = loopingNoise(ac, 'white');
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.1, now + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      fsrc.connect(hp).connect(g).connect(panner(rand(-0.5, 0.5))).connect(master);
      fsrc.start(now);
      fsrc.stop(now + 2.6);
    }, 7000, 12000);

  } else if (type === 'campfire') {
    // 장작 타는 낮은 로어
    const bed = loopingNoise(ac, 'brown');
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const bedGain = ac.createGain();
    bedGain.gain.value = 0.22;
    bed.connect(lp).connect(bedGain).connect(master);
    bed.start();
    nodes.push(bed);
    // 잦은 크랙
    every(() => burst({
      freq: rand(1500, 4500), q: 1.5, dur: rand(0.02, 0.07),
      gain: rand(0.08, 0.3), pan: rand(-0.7, 0.7),
    }), 40, 350);
    // 가끔 큰 탁 소리
    every(() => burst({
      freq: rand(800, 1800), q: 1, dur: rand(0.05, 0.12),
      gain: rand(0.25, 0.45), pan: rand(-0.6, 0.6),
    }), 1500, 4500);

  } else if (type === 'stream') {
    // 물줄기 본체
    const bed = loopingNoise(ac, 'white');
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.6;
    const bedGain = ac.createGain();
    bedGain.gain.value = 0.26;
    bed.connect(bp).connect(bedGain).connect(master);
    bed.start();
    const splash = loopingNoise(ac, 'white');
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    const splashGain = ac.createGain();
    splashGain.gain.value = 0.05;
    splash.connect(hp).connect(splashGain).connect(master);
    splash.start();
    nodes.push(bed, splash);
    // 보글거리는 물방울
    every(() => burst({
      freq: rand(700, 2600), q: 4, dur: rand(0.03, 0.09),
      gain: rand(0.05, 0.16), pan: rand(-0.8, 0.8),
    }), 40, 220);

  } else if (type === 'forest') {
    // 산들바람 베드
    const wind = loopingNoise(ac, 'brown');
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const windGain = ac.createGain();
    windGain.gain.value = 0.13;
    wind.connect(lp).connect(windGain).connect(master);
    wind.start();
    const windLfo = ac.createOscillator();
    windLfo.frequency.value = 0.06;
    const windLfoG = ac.createGain();
    windLfoG.gain.value = 220;
    windLfo.connect(windLfoG).connect(lp.frequency);
    windLfo.start();
    nodes.push(wind, windLfo);
    const rev = getReverb(ac);
    // 이따금 지저귀는 새소리 (빠른 음정 활강 + 짧은 연속음)
    every(() => {
      const now = ac.currentTime;
      const o = ac.createOscillator();
      o.type = 'sine';
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, now);
      const pn = panner(rand(-0.8, 0.8));
      const base = rand(2400, 4200);
      const notes = 1 + Math.floor(Math.random() * 3);
      let tt = now;
      for (let i = 0; i < notes; i++) {
        o.frequency.setValueAtTime(base * rand(0.9, 1.1), tt);
        o.frequency.linearRampToValueAtTime(base * rand(1.1, 1.5), tt + 0.06);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.11, tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
        tt += 0.16;
      }
      o.connect(g);
      g.connect(pn).connect(master);
      g.connect(rev.input); // 새소리에 공간감
      o.start(now);
      o.stop(tt + 0.1);
    }, 1800, 6000);

  } else if (type === 'bowl') {
    // 싱잉볼 드론: 지속되는 비조화 배음 + 디튠 페어로 느린 비팅, 리버브로 공간감
    const rev = getReverb(ac);
    const fund = 196; // 약 G3
    const parts = [[1, 0.5], [2.0, 0.16], [2.76, 0.1], [4.07, 0.05], [5.43, 0.03]];
    for (const [ratio, amp] of parts) {
      for (const det of [-0.4, 0.4]) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = fund * ratio + det;
        const g = ac.createGain();
        g.gain.value = amp * 0.16;
        // 느린 진폭 흔들림(shimmer)
        const lfo = ac.createOscillator();
        lfo.frequency.value = rand(0.05, 0.12);
        const lg = ac.createGain();
        lg.gain.value = amp * 0.05;
        lfo.connect(lg).connect(g.gain);
        o.connect(g);
        g.connect(master);
        g.connect(rev.input);
        o.start();
        lfo.start();
        nodes.push(o, lfo);
      }
    }
  }
}

export function stopAmbient() {
  if (!ambient) return;
  const inst = ambient;
  ambient = null;
  inst.alive = false;
  for (const id of inst.timers) clearTimeout(id);
  const ac = getCtx();
  const t = ac.currentTime;
  inst.master.gain.cancelScheduledValues(t);
  inst.master.gain.setValueAtTime(inst.master.gain.value, t);
  inst.master.gain.linearRampToValueAtTime(0.0001, t + 1); // 1초 페이드아웃
  setTimeout(() => {
    for (const n of inst.nodes) {
      try { n.stop(); } catch { /* 이미 정지됨 */ }
    }
    inst.master.disconnect();
  }, 1100);
}

export function setAmbientVolume(volume) {
  if (!ambient) return;
  const ac = getCtx();
  ambient.master.gain.setTargetAtTime(volume * 0.5, ac.currentTime, 0.1);
}
