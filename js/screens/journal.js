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

  // 10단계 테마 이름 (필터 옵션)
  const phases = [];
  for (let k = 0; k < 10; k++) phases.push(getGuide(k * 10 + 1).phase);

  el.innerHTML = `
    <h1 class="screen-title">일지</h1>
    <div class="journal-filters">
      <input type="search" id="journal-search" class="journal-search" placeholder="소감·제목 검색" autocomplete="off">
      <select id="journal-phase" class="journal-phase">
        <option value="all">전체 단계</option>
        ${phases.map((p) => `<option value="${escapeHtml(p)}">${p}</option>`).join('')}
      </select>
    </div>
    <div id="journal-list"></div>
  `;

  const listEl = el.querySelector('#journal-list');
  const searchEl = el.querySelector('#journal-search');
  const phaseEl = el.querySelector('#journal-phase');

  const renderList = () => {
    const q = searchEl.value.trim().toLowerCase();
    const phase = phaseEl.value;
    const filtered = entries.filter((e) => {
      // 자유 명상은 특정 단계에 속하지 않으므로 '전체'에서만 보인다
      if (phase !== 'all' && (e.isFree || getGuide(e.day).phase !== phase)) return false;
      if (q) {
        const hay = `${e.note || ''} ${e.isFree ? '자유 명상' : getGuide(e.day).title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    listEl.innerHTML = filtered.length
      ? filtered.map((e) => renderItem(e)).join('')
      : '<div class="empty-state" style="padding:40px 20px">조건에 맞는 기록이 없어요.</div>';
    listEl.querySelectorAll('.journal-item').forEach((item) => {
      item.querySelector('.btn-edit')?.addEventListener('click', () => enterEdit(item));
    });
  };

  searchEl.addEventListener('input', renderList);
  phaseEl.addEventListener('change', renderList);
  renderList();

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
  const [y, m, d] = e.date.split('-');
  const time = formatTime(e.startedAt || e.completedAt);
  const label = e.isFree ? '자유 명상' : `Day ${e.day}`;
  const theme = e.isFree ? '자유 명상' : `${getGuide(e.day).phase} · ${getGuide(e.day).title}`;
  return `
    <div class="journal-item" data-id="${escapeHtml(String(e.id))}" data-date="${e.date}">
      <div class="j-head">
        <span class="j-day">${label}</span>
        <span class="j-date">${y}.${m}.${d}${time ? ` · ${time}` : ''}</span>
      </div>
      <div class="j-theme">${theme}</div>
      ${moodLine(e.moodBefore, e.moodAfter)}
      <div class="j-note ${e.note ? '' : 'empty'}">${e.note ? escapeHtml(e.note) : '소감이 없어요'}</div>
      <button class="btn-small btn-edit" style="margin-top:10px">${e.note ? '수정' : '소감 쓰기'}</button>
    </div>
  `;
}

function enterEdit(item) {
  const id = item.dataset.id;
  const current = store.getSession(id)?.note || '';
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
    store.updateSessionNote(id, note);
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
