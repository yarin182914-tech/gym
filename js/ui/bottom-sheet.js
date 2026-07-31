// Generic iOS-style slide-up bottom sheet: backdrop, drag-to-dismiss handle,
// dismiss on backdrop tap or Escape. This component owns only the shell —
// the caller's `render(bodyEl, sheet)` populates the content and decides
// which of its own buttons call `sheet.close()`.
//
// Appended to <body> rather than the page's own container so it is never
// clipped by an ancestor's overflow (the active-session screen scrolls, and
// several of its cards use overflow rules of their own).

export function openBottomSheet({ render, onClose, ariaLabel = '' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('tabindex', '-1');
  if (ariaLabel) sheet.setAttribute('aria-label', ariaLabel);

  const handle = document.createElement('div');
  handle.className = 'bottom-sheet-handle';

  const body = document.createElement('div');
  body.className = 'bottom-sheet-body';

  sheet.appendChild(handle);
  sheet.appendChild(body);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  let closed = false;
  const api = { close };

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    overlay.classList.remove('sheet-overlay--open');
    sheet.classList.remove('bottom-sheet--open');

    // transitionend never fires when prefers-reduced-motion (or anything
    // else) leaves the transition disabled, which would otherwise strand
    // the sheet in the DOM forever — the timeout guarantees cleanup either
    // way, whichever fires first.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.remove();
      onClose?.();
    };
    sheet.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 400);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);

  // Drag-to-dismiss on the handle only (not the whole sheet, which would
  // fight with scrolling long content): a small drag snaps back open, a
  // large drag closes the sheet.
  let dragging = false;
  let pointerId = null;
  let startY = 0;

  function onPointerDown(e) {
    dragging = true;
    pointerId = e.pointerId;
    startY = e.clientY;
    handle.setPointerCapture(pointerId);
    sheet.style.transition = 'none';
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    sheet.style.transition = '';
    const dy = e.clientY - startY;
    if (dy > sheet.offsetHeight * 0.25) {
      close();
    } else {
      sheet.style.transform = '';
    }
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);

  render(body, api);

  // Two rAFs, not one — the closed (translateY 100%) state must paint
  // before the --open class is added, or the slide-up transition never
  // plays (same reason as the set-row entering animation).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('sheet-overlay--open');
    sheet.classList.add('bottom-sheet--open');
    sheet.focus();
  }));

  return api;
}
