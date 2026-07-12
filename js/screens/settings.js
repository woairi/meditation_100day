import * as store from '../store.js';
import { showConfirm } from '../ui.js';
import * as notify from '../notify.js';

const BREATH_LABELS = {
  '4-4': '기본 (들숨 4초 · 날숨 4초)',
  '4-6': '이완 (들숨 4초 · 날숨 6초)',
  box: '박스 호흡 (4·4·4·4)',
  '4-7-8': '4-7-8 (들숨4 · 멈춤7 · 날숨8)',
  coherent: '코히런트 (들숨 5.5초 · 날숨 5.5초)',
};

export function mountSettings(el) {
  const s = store.getSettings();

  el.innerHTML = `
    <h1 class="screen-title">설정</h1>

    <div class="card">
      <div class="card-label">명상</div>
      <div class="setting-row">
        <label for="set-minutes">명상 시간</label>
        <select id="set-minutes">
          ${[5, 10, 15, 20]
            .map((m) => `<option value="${m}" ${m === s.sessionMinutes ? 'selected' : ''}>${m}분</option>`)
            .join('')}
        </select>
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
      <div class="setting-actions">
        <button id="btn-export" class="btn-small">백업 파일 내보내기</button>
        <button id="btn-import" class="btn-small">백업 가져오기</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <button id="btn-reset" class="btn-ghost" style="color:var(--danger);margin-top:8px">모든 기록 삭제</button>
    </div>
  `;

  el.querySelector('#set-minutes').addEventListener('change', (e) => {
    store.updateSettings({ sessionMinutes: parseInt(e.target.value, 10) });
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
