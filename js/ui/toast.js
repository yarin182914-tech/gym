// Small auto-dismissing confirmation banner — e.g. "האימון נשמר בהצלחה".
// Owns its own slot appended once to <body> (created lazily, on first use),
// same reasoning as js/ui/bottom-sheet.js and install-banner.js: a page's
// own container gets wholesale-replaced by that page's render(), which
// would destroy an in-progress toast along with everything else; a
// body-level slot survives any page transition, including the one a toast
// is often shown right after (e.g. finishing a workout).

let slot = null;

function ensureSlot() {
  if (slot) return slot;
  slot = document.createElement('div');
  slot.id = 'toast-slot';
  slot.className = 'toast-slot';
  slot.setAttribute('aria-live', 'polite');
  document.body.appendChild(slot);
  return slot;
}

// `html` is rendered via innerHTML so a toast can carry an icon — callers
// must escape any user-supplied text themselves (see core/dom.js#esc)
// before interpolating it in, same rule as everywhere else in this app.
//
// action: { label, onClick } adds a button (e.g. "ביטול"); the toast then
// stays `duration` ms and closes as soon as the button is tapped.
export function showToast(html, { action = null, duration = 1800 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${action ? ' toast--action' : ''}`;
  el.innerHTML = html;
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 300);
  };
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      hide();
      action.onClick();
    });
    el.appendChild(btn);
  }
  ensureSlot().appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('toast--visible')));
  setTimeout(hide, duration);
  return { close: hide };
}
