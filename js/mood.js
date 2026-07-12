// 마음 상태(기분) 선택 UI. 다른 화면에서 마크업을 심고 값을 읽어가는 경량 컴포넌트.
// 이모지 대신 5단계 도트 + 좌우 척도 라벨로 톤을 통일한다.

import { MOOD_LABELS } from './store.js';

// 선택 도트 마크업을 반환한다. id는 화면 내에서 고유해야 한다.
export function moodPickerHTML(id, title) {
  const dots = MOOD_LABELS
    .map((label, i) => `<button type="button" class="mood-dot" data-val="${i + 1}" aria-label="${label}"></button>`)
    .join('');
  return `
    <div class="mood-picker" id="${id}">
      <div class="mood-title">${title}</div>
      <div class="mood-dots">${dots}</div>
      <div class="mood-scale"><span>나쁨</span><span>좋음</span></div>
      <div class="mood-current" aria-live="polite"></div>
    </div>`;
}

// 도트를 클릭 가능하게 연결하고, 현재 선택값(1~5, 미선택 시 null)을 돌려주는 getter를 반환한다.
export function wireMoodPicker(root, id) {
  const wrap = root.querySelector('#' + id);
  if (!wrap) return () => null;
  const current = wrap.querySelector('.mood-current');
  const dots = wrap.querySelectorAll('.mood-dot');
  dots.forEach((b) => {
    b.addEventListener('click', () => {
      dots.forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      wrap.dataset.value = b.dataset.val;
      current.textContent = b.getAttribute('aria-label');
    });
  });
  return () => (wrap.dataset.value ? parseInt(wrap.dataset.value, 10) : null);
}
