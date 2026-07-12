// 테마에 맞는 커스텀 확인 모달. 네이티브 confirm()은 명상 분위기를 깨므로 쓰지 않는다.

export function showConfirm({ message, confirmText = '확인', cancelText = '취소', danger = false }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-msg">
        <div class="modal-message" id="modal-msg">${message}</div>
        <div class="modal-actions">
          <button class="btn-small" data-act="cancel">${cancelText}</button>
          <button class="btn-small ${danger ? 'danger' : ''}" data-act="ok">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const okBtn = overlay.querySelector('[data-act="ok"]');
    const cancelBtn = overlay.querySelector('[data-act="cancel"]');
    okBtn.focus(); // 초기 포커스는 확인 버튼

    const done = (v) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) prevFocus.focus(); // 포커스 복원
      resolve(v);
    };

    // Esc로 닫기 + Tab 포커스 트랩(확인/취소 두 버튼 사이 순환)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const next = document.activeElement === okBtn ? cancelBtn : okBtn;
        next.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    okBtn.addEventListener('click', () => done(true));
    cancelBtn.addEventListener('click', () => done(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(false);
    });
  });
}
