import * as store from '../store.js';
import { MOOD_LABELS } from '../store.js';
import { getGuide } from '../data/guides.js';
import { icon } from '../icons.js';

export function mountJournal(el, params = {}) {
  const entries = store.getJournalEntries();

  if (entries.length === 0) {
    el.innerHTML = `
      <h1 class="screen-title">일지</h1>
      <div class="empty-state">
        ${icon('sprout', 44)}
        아직 기록이 없어요.<br>첫 명상을 마치면 이곳에 소감이 쌓여요.
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <h1 class="screen-title">일지</h1>
    <div id="journal-list">
      ${entries.map((e) => renderItem(e)).join('')}
    </div>
  `;

  el.querySelectorAll('.journal-item').forEach((item) => {
    item.querySelector('.btn-edit')?.addEventListener('click', () => enterEdit(item));
  });

  // 달력 그리드에서 특정 날짜로 진입한 경우 해당 항목으로 스크롤
  if (params.date) {
    const target = el.querySelector(`[data-date="${params.date}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.outline = '2px solid var(--accent)';
      setTimeout(() => { target.style.outline = ''; }, 2000);
    }
  }
}

function renderItem(e) {
  const guide = getGuide(e.day);
  const [y, m, d] = e.date.split('-');
  const startTime = e.startedAt ? formatTime(e.startedAt) : '';
  return `
    <div class="journal-item" data-date="${e.date}">
      <div class="j-head">
        <span class="j-day">Day ${e.day}</span>
        <span class="j-date">${y}.${m}.${d}${startTime ? ` · ${startTime} 시작` : ''}</span>
      </div>
      <div class="j-theme">${guide.phase} · ${guide.title}</div>
      ${moodLine(e.moodBefore, e.moodAfter)}
      <div class="j-note ${e.note ? '' : 'empty'}">${e.note ? escapeHtml(e.note) : '소감이 없어요'}</div>
      <button class="btn-small btn-edit" style="margin-top:10px">${e.note ? '수정' : '소감 쓰기'}</button>
    </div>
  `;
}

function enterEdit(item) {
  const date = item.dataset.date;
  const current = store.getCompletion(date)?.note || '';
  const noteEl = item.querySelector('.j-note');
  const editBtn = item.querySelector('.btn-edit');
  noteEl.hidden = true;
  editBtn.hidden = true;

  const box = document.createElement('div');
  box.innerHTML = `
    <textarea>${escapeHtml(current)}</textarea>
    <button class="btn-small" data-act="save">저장</button>
    <button class="btn-small" data-act="cancel" style="background:transparent;color:var(--fg-dim)">취소</button>
  `;
  item.appendChild(box);
  box.querySelector('textarea').focus();

  box.querySelector('[data-act="save"]').addEventListener('click', () => {
    const note = box.querySelector('textarea').value.trim();
    store.updateNote(date, note);
    noteEl.textContent = note || '소감이 없어요';
    noteEl.classList.toggle('empty', !note);
    editBtn.textContent = note ? '수정' : '소감 쓰기';
    exitEdit();
  });
  box.querySelector('[data-act="cancel"]').addEventListener('click', exitEdit);

  function exitEdit() {
    box.remove();
    noteEl.hidden = false;
    editBtn.hidden = false;
  }
}

// 명상 전/후 마음 상태 표시 (둘 다 없으면 표시 안 함 — 이전 기록 호환)
function moodLine(before, after) {
  if (!before && !after) return '';
  const label = (v) => (v ? MOOD_LABELS[v - 1] : '—');
  let text;
  if (before && after) text = `${label(before)} → ${label(after)}`;
  else if (after) text = `명상 후 ${label(after)}`;
  else text = `명상 전 ${label(before)}`;
  return `<div class="j-mood">마음 상태 · ${text}</div>`;
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
