import * as store from '../store.js';
import { showConfirm } from '../ui.js';
import * as notify from '../notify.js';

const BREATH_LABELS = {
  '4-4': '기본 · 무난한 균형 (들숨4 · 날숨4)',
  '4-6': '이완 · 날숨을 길게 (들숨4 · 날숨6)',
  box: '박스 · 집중과 안정 (4·4·4·4)',
  '4-7-8': '4-7-8 · 잠들기 전 진정 (4·7·8)',
  coherent: '코히런트 · 자율신경 안정 (5.5·5.5)',
};

const THEMES = [
  { key: 'classic', name: '기존 UI', desc: '다크 · 세이지 그린', swatch: 'linear-gradient(135deg,#1a2233,#7fb8a4)' },
  { key: 'dawn', name: '안개 새벽', desc: '라이트 · 블루·라벤더', swatch: 'linear-gradient(135deg,#eaeefb,#6f79d6)' },
  { key: 'zen', name: '미니멀 선(禪)', desc: '라이트 · 라벤더 한 점', swatch: 'linear-gradient(135deg,#faf9fc,#7c74b0)' },
];

const MINUTE_PRESETS = [3, 5, 10, 15, 20, 30, 45, 60];

// 배열로 관리 — 객체 정수형 키('5','10')가 앞으로 정렬되는 것을 피한다.
const INTERVAL_BELL_OPTIONS = [
  ['none', '없음'],
  ['half', '절반 지점'],
  ['5', '5분마다'],
  ['10', '10분마다'],
];

export function mountSettings(el) {
  const s = store.getSettings();
  const isCustomMinutes = !MINUTE_PRESETS.includes(s.sessionMinutes);

  el.innerHTML = `
    <h1 class="screen-title">설정</h1>

    <div class="card">
      <div class="card-label">스타일</div>
      <p class="setting-hint">앱 전체의 분위기를 골라 보세요.</p>
      <div class="theme-picker">
        ${THEMES.map((th) => `
          <button type="button" class="theme-row ${th.key === s.theme ? 'selected' : ''}" data-theme-key="${th.key}">
            <span class="theme-swatch" style="background:${th.swatch}"></span>
            <span class="theme-row-body">
              <span class="theme-row-name">${th.name}</span>
              <span class="theme-row-desc">${th.desc}</span>
            </span>
            <span class="theme-dot"></span>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-label">명상</div>
      <div class="setting-row">
        <label for="set-minutes">명상 시간</label>
        <select id="set-minutes">
          ${MINUTE_PRESETS
            .map((m) => `<option value="${m}" ${m === s.sessionMinutes ? 'selected' : ''}>${m}분</option>`)
            .join('')}
          <option value="custom" ${isCustomMinutes ? 'selected' : ''}>직접 입력</option>
        </select>
      </div>
      <div class="setting-row" id="row-custom-min" ${isCustomMinutes ? '' : 'hidden'}>
        <label for="set-custom-min">분 직접 입력</label>
        <input type="number" id="set-custom-min" class="time-input" style="width:84px" min="1" max="120" value="${s.sessionMinutes}">
      </div>
      <div class="setting-row">
        <label for="set-interval-bell">중간 종</label>
        <select id="set-interval-bell">
          ${INTERVAL_BELL_OPTIONS
            .map(([v, l]) => `<option value="${v}" ${v === s.intervalBell ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </div>
      <div class="setting-row">
        <label for="set-narration">시작 시 가이드 낭독</label>
        <input type="checkbox" id="set-narration" class="switch" ${s.guideNarration ? 'checked' : ''}>
      </div>
      <div class="setting-row">
        <label for="set-breath">호흡 가이드</label>
        <input type="checkbox" id="set-breath" class="switch" ${s.breathingGuide ? 'checked' : ''}>
      </div>
      <div class="setting-row" id="row-pattern" ${s.breathingGuide ? '' : 'hidden'}>
        <label for="set-pattern">호흡 리듬</label>
        <select id="set-pattern">
          ${Object.entries(BREATH_LABELS)
            .map(([v, l]) => `<option value="${v}" ${v === s.breathPattern ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </div>
    </div>

    <div class="card">
      <div class="card-label">알림</div>
      <div class="setting-row">
        <label for="set-reminder">일일 명상 알림</label>
        <input type="checkbox" id="set-reminder" class="switch" ${s.reminderEnabled ? 'checked' : ''}>
      </div>
      <div class="setting-row" id="row-reminder-time" ${s.reminderEnabled ? '' : 'hidden'}>
        <label for="set-reminder-time">알림 시각</label>
        <input type="time" id="set-reminder-time" class="time-input" value="${s.reminderTime}">
      </div>
      <p class="setting-hint" id="reminder-hint"></p>
    </div>

    <div class="card">
      <div class="card-label">데이터</div>
      <p class="setting-hint">기록은 이 기기에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업해 두세요.</p>
      <p class="setting-hint backup-status" id="backup-status"></p>
      <div class="setting-actions">
        <button id="btn-export" class="btn-small">백업 파일 내보내기</button>
        <button id="btn-import" class="btn-small">백업 가져오기</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <button id="btn-reset" class="btn-ghost" style="color:var(--danger);margin-top:8px">모든 기록 삭제</button>
    </div>
  `;

  renderBackupStatus(el);

  el.querySelectorAll('.theme-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.themeKey;
      store.updateSettings({ theme: key });
      document.documentElement.dataset.theme = key;
      el.querySelectorAll('.theme-row').forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });

  const customRow = el.querySelector('#row-custom-min');
  const customInput = el.querySelector('#set-custom-min');

  el.querySelector('#set-minutes').addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      customRow.hidden = false;
      store.updateSettings({ sessionMinutes: clampMinutes(customInput.value) });
    } else {
      customRow.hidden = true;
      store.updateSettings({ sessionMinutes: parseInt(e.target.value, 10) });
    }
  });

  customInput.addEventListener('change', (e) => {
    const m = clampMinutes(e.target.value);
    e.target.value = m;
    store.updateSettings({ sessionMinutes: m });
  });

  el.querySelector('#set-interval-bell').addEventListener('change', (e) => {
    store.updateSettings({ intervalBell: e.target.value });
  });

  el.querySelector('#set-narration').addEventListener('change', (e) => {
    store.updateSettings({ guideNarration: e.target.checked });
  });

  el.querySelector('#set-breath').addEventListener('change', (e) => {
    store.updateSettings({ breathingGuide: e.target.checked });
    el.querySelector('#row-pattern').hidden = !e.target.checked;
  });

  el.querySelector('#set-pattern').addEventListener('change', (e) => {
    store.updateSettings({ breathPattern: e.target.value });
  });

  // 알림 토글: 켜면 권한 요청 → 실패 시 스위치 원상복구
  const reminderToggle = el.querySelector('#set-reminder');
  const reminderRow = el.querySelector('#row-reminder-time');
  const reminderHint = el.querySelector('#reminder-hint');
  const refreshHint = () => { reminderHint.textContent = notify.reminderStatusText(); };
  refreshHint();

  reminderToggle.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const ok = await notify.enableReminder(store.getSettings().reminderTime);
      if (!ok) {
        e.target.checked = false;
        await showConfirm({
          message: '알림 권한이 없어 켤 수 없어요.<br>브라우저 설정에서 이 사이트의 알림을 허용해 주세요.',
          confirmText: '확인', cancelText: '닫기',
        });
      } else {
        reminderRow.hidden = false;
      }
    } else {
      await notify.disableReminder();
      reminderRow.hidden = true;
    }
    refreshHint();
  });

  el.querySelector('#set-reminder-time').addEventListener('change', async (e) => {
    store.updateSettings({ reminderTime: e.target.value });
    if (store.getSettings().reminderEnabled) await notify.enableReminder(e.target.value);
    refreshHint();
  });

  // 백업 내보내기: JSON 파일 다운로드
  el.querySelector('#btn-export').addEventListener('click', () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meditation100-backup-${store.todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    store.markBackup(); // 백업 시점 기록 → 권유 메시지 갱신
    renderBackupStatus(el);
  });

  // 백업 가져오기: 현재 기록을 백업 내용으로 교체
  el.querySelector('#btn-import').addEventListener('click', () => {
    el.querySelector('#import-file').click();
  });
  el.querySelector('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const incoming = JSON.parse(text);
      const incomingCount = Object.keys(incoming?.completions || {}).length;
      const ok = await showConfirm({
        message: `현재 기록(${store.completedCount()}일)을 백업 기록(${incomingCount}일)으로 교체할까요?`,
        confirmText: '가져오기',
      });
      if (!ok) return;
      store.importData(text);
      mountSettings(el);
      await showConfirm({ message: `${incomingCount}일의 기록을 가져왔어요.`, confirmText: '확인', cancelText: '닫기' });
    } catch {
      await showConfirm({ message: '백업 파일을 읽을 수 없어요. 올바른 파일인지 확인해 주세요.', confirmText: '확인', cancelText: '닫기' });
    }
  });

  el.querySelector('#btn-reset').addEventListener('click', async () => {
    const ok = await showConfirm({
      message: `정말 모든 기록(${store.completedCount()}일)을 삭제할까요?<br>이 작업은 되돌릴 수 없어요.`,
      confirmText: '모두 삭제',
      cancelText: '취소',
      danger: true,
    });
    if (!ok) return;
    store.resetData();
    mountSettings(el);
  });
}

function clampMinutes(v) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 10;
  return Math.min(120, Math.max(1, n));
}

// 백업 권유/상태 문구를 그리고, 오래됐으면 강조 스타일을 준다.
function renderBackupStatus(el) {
  const node = el.querySelector('#backup-status');
  if (!node) return;
  const st = store.backupStatus();
  if (!st.everBackedUp) {
    node.textContent = st.count > 0 ? `아직 백업하지 않았어요 (기록 ${st.count}일).` : '';
  } else {
    const days = st.daysSince === 0 ? '오늘' : `${st.daysSince}일 전`;
    node.textContent = st.unsaved > 0
      ? `마지막 백업 ${days} · 이후 ${st.unsaved}일 기록이 쌓였어요.`
      : `마지막 백업 ${days} · 최신 상태예요.`;
  }
  node.classList.toggle('warn', st.needed);
}
