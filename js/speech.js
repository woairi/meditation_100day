// 가이드 낭독 (Web Speech API). 오디오 파일 없이 브라우저 내장 TTS로 안내 문구를 읽는다.
// 미지원 브라우저에서는 조용히 no-op. 음성은 사용자 제스처 안에서 시작해야 안정적이다.

let current = null;

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// text를 한국어로 낭독한다. 이미 낭독 중이면 멈추고 새로 시작. onend는 완료/중단 시 호출.
export function speak(text, { onend } = {}) {
  if (!speechSupported() || !text) return false;
  stopSpeech();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.9; // 명상 톤: 약간 느리게
  u.pitch = 1;
  const finish = () => { if (current === u) current = null; onend?.(); };
  u.onend = finish;
  u.onerror = finish;
  current = u;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeech() {
  if (!speechSupported()) return;
  current = null;
  window.speechSynthesis.cancel();
}

export function isSpeaking() {
  return !!current && speechSupported() && window.speechSynthesis.speaking;
}
