// In-app confirmation for destructive actions, replacing native confirm() —
// a jarring OS-level popup was the one place a delete flow broke out of the
// app's own visual language. Reuses .modal-overlay/.modal-card rather than
// introducing a third overlay pattern alongside the bottom sheet.
//
// Returns a Promise<boolean> so call sites read almost identically to the
// confirm() they replace: `if (!(await confirmDialog({...}))) return;`.
export function confirmDialog({ title, message, confirmLabel = 'אישור', cancelLabel = 'ביטול', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title" style="color:var(--text);">${title}</h3>
        <p class="text-muted" style="margin:0 0 20px;">${message}</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-cancel>${cancelLabel}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close(false);
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-confirm]').addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKeydown);
    overlay.querySelector('[data-confirm]').focus();
  });
}
