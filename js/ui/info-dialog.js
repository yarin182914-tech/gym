// A small "what is this?" popup behind an ⓘ button: a title, a few short
// paragraphs and "הבנתי". Reuses .modal-overlay/.modal-card like
// confirm-dialog.js, raised above an open bottom sheet (it opens from one).

import { icon } from './icon.js';

// The ⓘ button; the caller handles its click (data-info="<key>").
export function infoButton(key, label) {
  return `<button type="button" class="info-btn" data-info="${key}" aria-label="${label}">${icon('info', { className: 'icon--sm' })}</button>`;
}

// help: { title, body: [paragraph html, …] }. Resolves when closed.
export function infoDialog({ title, body }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--top';
    overlay.innerHTML = `
      <div class="modal-card info-card" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title">
        <h3 id="info-dialog-title" class="info-title">${icon('info', { className: 'icon--sm' })} ${title}</h3>
        ${body.map((p) => `<p class="info-text">${p}</p>`).join('')}
        <div class="sheet-actions">
          <button type="button" class="btn btn-primary" data-ok>הבנתי</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown, true);
      resolve();
    }
    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-ok]').addEventListener('click', close);
    document.addEventListener('keydown', onKeydown, true);
    overlay.querySelector('[data-ok]').focus();
  });
}
