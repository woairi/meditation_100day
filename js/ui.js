// 테마에 맞는 커스텀 확인 모달. 네이티브 confirm()은 명상 분위기를 깨므로 쓰지 않는다.

export function showConfirm({ message, confirmText = '확인', cancelText = '취소', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-message">${message}</div>
        <div class="modal-actions">
          <button class="btn-small" data-act="cancel">${cancelText}</button>
          <button class="btn-small ${danger ? 'danger' : ''}" data-act="ok">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const done = (v) => {
      overlay.remove();
      resolve(v);
    };
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(false);
    });
  });
}
