// 인라인 SVG 라인 아이콘. currentColor를 따르므로 부모의 color로 톤이 통일된다.
// 이모지는 OS마다 렌더링이 달라 다크 테마 위에서 튀기 때문에 UI 요소에는 쓰지 않는다.

const PATHS = {
  home: '<path d="M3.5 10.8 12 4l8.5 6.8"/><path d="M6 9.5V20h12V9.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10.5h16M8.5 3.5V7M15.5 3.5V7"/>',
  pen: '<path d="M14.5 5.5l4 4L8 20H4v-4z"/><path d="M12.5 7.5l4 4"/>',
  flame: '<path d="M12 4c3 3 5 5.2 5 8a5 5 0 0 1-10 0c0-2.8 2-5 5-8z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5.5"/>',
  sprout: '<path d="M12 20v-7"/><path d="M12 13c0-3.5 2.5-5.5 6-5.5 0 3.5-2.5 5.5-6 5.5z"/><path d="M12 13c0-3.5-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z"/>',
  circles: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>',
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
