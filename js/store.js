// localStorage 유일 접근점. 다른 모듈은 반드시 이 모듈을 통해 상태를 읽고 쓴다.

const KEY = 'meditation100.v1';
const SESSION_KEY = 'meditation100.activeSession';
const CURRENT_SCHEMA = 2; // v2: 모든 세션 로그(sessions[]) 추가
export const TOTAL_DAYS = 100;

// 마음 상태 5단계(값 1~5). 이모지 대신 텍스트 라벨 — 다크 테마 톤 유지.
export const MOOD_LABELS = ['매우 나쁨', '나쁨', '보통', '좋음', '매우 좋음'];

function freshState() {
  return {
    schemaVersion: CURRENT_SCHEMA,
    startedAt: null,
    settings: {
      theme: 'classic', // 'classic' | 'dawn' | 'zen'
      soundType: 'rain',
      soundVolume: 0.5,
      breathingGuide: true,
      breathPattern: '4-4', // '4-4' | '4-6' | 'box' | '4-7-8' | 'coherent'
      sessionMinutes: 10,
      intervalBell: 'none', // 'none' | 'half' | '5' | '10' (중간 종)
      guideNarration: false, // 시작 시 가이드 문구 음성 낭독
      reminderEnabled: false,
      reminderTime: '08:00',
      lastBackupCount: 0, // 마지막 백업 시점의 완료 일수
      lastBackupAt: null, // 마지막 백업 시각 (ISO)
    },
    completions: {}, // 날짜별 도장 (하루 1개) — 스트릭/Day N/그리드의 기준
    sessions: [], // 완료한 모든 세션 로그 (자유 명상 포함) — 총 시간/통계/일지의 기준
  };
}

// 도장(completion) 하나를 세션 로그 항목으로 변환 (v1→v2 백필용)
function sessionFromCompletion(date, c) {
  return {
    id: c.completedAt || `${date}T12:00:00.000Z`,
    date,
    day: c.day,
    isFree: false,
    startedAt: c.startedAt || null,
    completedAt: c.completedAt || null,
    durationSec: c.durationSec || 0,
    note: c.note || '',
    moodBefore: c.moodBefore ?? null,
    moodAfter: c.moodAfter ?? null,
  };
}

let migrationOccurred = false;
let state = load();
// 마이그레이션이 있었으면 즉시 저장해 백필 결과가 유실되지 않게 한다.
if (migrationOccurred) save();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const data = JSON.parse(raw);
    return migrate(data);
  } catch {
    return freshState();
  }
}

function migrate(data) {
  // schemaVersion이 올라가면 여기서 순차 마이그레이션을 수행한다.
  if (!data.schemaVersion || data.schemaVersion < CURRENT_SCHEMA) {
    data = { ...freshState(), ...data, schemaVersion: CURRENT_SCHEMA };
    migrationOccurred = true;
  }
  // 같은 스키마 안에서 설정 항목이 추가된 경우 기본값을 채운다.
  data.settings = { ...freshState().settings, ...data.settings };
  // v2: 세션 로그가 없으면 기존 도장에서 백필한다.
  if (!Array.isArray(data.sessions)) { data.sessions = []; migrationOccurred = true; }
  if (data.sessions.length === 0 && data.completions && Object.keys(data.completions).length) {
    data.sessions = Object.entries(data.completions).map(([date, c]) => sessionFromCompletion(date, c));
    migrationOccurred = true;
  }
  return data;
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ---- 날짜 헬퍼: 항상 로컬 시간 기준 ----

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDateKey(key, deltaDays) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return todayKey(dt);
}

// ---- 설정 ----

export function getSettings() {
  return { ...state.settings };
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

// ---- 완료/진행 상태 ----

export function getCompletions() {
  return state.completions;
}

export function completedCount() {
  return Object.keys(state.completions).length;
}

export function isComplete() {
  return completedCount() >= TOTAL_DAYS;
}

// 오늘 진행할 Day N: 완료 수 + 1 (진행도 기준 — 빠진 날이 있어도 콘텐츠가 밀리지 않음)
export function getCurrentDay() {
  return Math.min(completedCount() + 1, TOTAL_DAYS);
}

export function isTodayDone() {
  return todayKey() in state.completions;
}

export function getCompletion(dateKey) {
  return state.completions[dateKey] || null;
}

// 세션 완료 기록. 그날의 첫 세션이고 자유 명상이 아니면 도장을 찍고,
// 모든 세션은 로그(sessions)에 남긴다 → 하루 두 번째 명상도 시간/통계/일지에 반영.
export function recordSession({ durationSec, note = '', startedAt = null, moodBefore = null, moodAfter = null, isFree = false }) {
  const date = todayKey();
  const now = new Date().toISOString();
  const alreadyStamped = date in state.completions;
  const stamp = !isFree && !alreadyStamped;
  if (stamp) {
    state.completions[date] = {
      day: getCurrentDay(),
      startedAt,
      completedAt: now,
      durationSec,
      note,
      moodBefore,
      moodAfter,
    };
    if (!state.startedAt) state.startedAt = date;
  }
  const day = state.completions[date]?.day ?? getCurrentDay();
  state.sessions.push({ id: now, date, day, isFree: !stamp, startedAt, completedAt: now, durationSec, note, moodBefore, moodAfter });
  save();
  return { stamped: stamp, day };
}

export function getSessions() {
  return state.sessions;
}

export function getSession(id) {
  return state.sessions.find((s) => s.id === id) || null;
}

// 세션 소감 수정. 그 세션이 도장(첫 세션)이면 도장의 소감도 함께 맞춘다.
export function updateSessionNote(id, note) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  s.note = note;
  const c = state.completions[s.date];
  if (c && !s.isFree && c.completedAt === s.id) c.note = note;
  save();
}

// ---- 스트릭 (달력 기준) ----

// 오늘부터(오늘 미완료면 어제부터) 역방향으로 연속 완료 일수
export function getStreak() {
  let cursor = todayKey();
  if (!(cursor in state.completions)) cursor = shiftDateKey(cursor, -1);
  let streak = 0;
  while (cursor in state.completions) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function getLongestStreak() {
  const keys = Object.keys(state.completions).sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    run = prev !== null && shiftDateKey(prev, 1) === k ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = k;
  }
  return longest;
}

// 최신순 일지 목록 (모든 세션 — 자유 명상 포함)
export function getJournalEntries() {
  return [...state.sessions].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
}

// 총 명상 시간(분) — 모든 세션 합산
export function totalMinutes() {
  return Math.round(
    state.sessions.reduce((sum, s) => sum + (s.durationSec || 0), 0) / 60
  );
}

// 오늘 완료한 세션들
export function todaySessions() {
  const key = todayKey();
  return state.sessions.filter((s) => s.date === key);
}

export function todaySessionCount() {
  return todaySessions().length;
}

// 오늘 누적 명상 시간(분)
export function todayMinutes() {
  return Math.round(todaySessions().reduce((sum, s) => sum + (s.durationSec || 0), 0) / 60);
}

// 최근 N주 명상 시간(분) 추이. 각 원소는 7일 창의 합계, 배열은 오래된→최근 순. 모든 세션 기준.
export function weeklyMinutes(weeks = 8) {
  const buckets = new Array(weeks).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of state.sessions) {
    const [y, m, d] = s.date.split('-').map(Number);
    const dayDiff = Math.floor((today - new Date(y, m - 1, d)) / 86400000);
    if (dayDiff < 0) continue;
    const weeksAgo = Math.floor(dayDiff / 7); // 0 = 최근 7일
    if (weeksAgo >= weeks) continue;
    buckets[weeks - 1 - weeksAgo] += Math.round((s.durationSec || 0) / 60);
  }
  return buckets;
}

// ---- 백업/복원 ----

export function exportData() {
  return JSON.stringify(state, null, 2);
}

// 백업을 방금 마쳤음을 기록 (백업 권유 판단 기준점).
export function markBackup() {
  state.settings.lastBackupCount = completedCount();
  state.settings.lastBackupAt = new Date().toISOString();
  save();
}

// 백업 권유 상태: 기록이 충분히 쌓였고 마지막 백업 이후 새 기록이 7일치 이상이면 needed.
export function backupStatus() {
  const count = completedCount();
  const savedCount = state.settings.lastBackupCount || 0;
  const unsaved = Math.max(0, count - savedCount);
  const lastAt = state.settings.lastBackupAt;
  const daysSince = lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000) : null;
  return { count, unsaved, everBackedUp: !!lastAt, daysSince, needed: count >= 7 && unsaved >= 7 };
}

// 백업 JSON으로 전체 상태를 교체한다. 형식이 어긋나면 throw.
export function importData(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || typeof data.completions !== 'object' || data.completions === null) {
    throw new Error('invalid backup');
  }
  for (const [key, c] of Object.entries(data.completions)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || typeof c !== 'object' || typeof c.day !== 'number') {
      throw new Error('invalid backup');
    }
  }
  state = migrate(data);
  save();
  return Object.keys(state.completions).length;
}

export function resetData() {
  state = freshState();
  save();
  clearActiveSession();
}

// ---- 진행 중 세션 복구 ----

export function saveActiveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getActiveSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearActiveSession() {
  localStorage.removeItem(SESSION_KEY);
}
