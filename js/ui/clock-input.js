import { formatClock } from '../lib/cardio.js';

// Inline m:ss entry — a cardio segment's duration, or a pace. Same look
// and commit-on-blur behaviour as numeric-input.js, but a text field so the
// colon can be typed. Typing digits alone also works: "25" is 25 minutes,
// "530" is 5:30, "1500" is 15:00. Optional, like every cardio value:
// clearing the field commits null.

const MAX_SEC = 10 * 3600;

export function parseClock(text) {
  const raw = String(text).trim();
  if (!raw) return null;
  if (raw.includes(':')) {
    const parts = raw.split(':').map((p) => Number(p || 0));
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    return parts.reduce((total, n) => total * 60 + n, 0);
  }
  if (!/^\d+$/.test(raw)) return null;
  if (raw.length <= 2) return Number(raw) * 60;
  return Number(raw.slice(0, -2)) * 60 + Math.min(Number(raw.slice(-2)), 59);
}

const shown = (sec) => (sec ? formatClock(sec) : '');

export function mountClockField(hostEl, { seconds, unitLabel = '', ariaLabel = 'זמן', onCommit }) {
  let lastGood = Number(seconds) > 0 ? Number(seconds) : null;

  hostEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'numeric-field';

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.dir = 'ltr';
  input.className = 'numeric-field-input num';
  input.value = shown(lastGood);
  input.setAttribute('aria-label', ariaLabel);

  const unitEl = document.createElement('span');
  unitEl.className = 'numeric-field-unit';
  unitEl.textContent = unitLabel;

  wrap.appendChild(input);
  wrap.appendChild(unitEl);
  hostEl.appendChild(wrap);

  wrap.addEventListener('click', (e) => {
    if (e.target !== input) input.focus();
  });
  input.addEventListener('focus', () => input.select());

  function commit() {
    if (!input.value.trim()) {
      lastGood = null;
    } else {
      const parsed = parseClock(input.value);
      // Unparseable text keeps the previous value rather than wiping it.
      if (parsed !== null) lastGood = parsed > 0 ? Math.min(Math.round(parsed), MAX_SEC) : null;
    }
    input.value = shown(lastGood);
    onCommit?.(lastGood);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = shown(lastGood);
      input.blur();
    }
  });

  return {
    setValue(sec) {
      if (document.activeElement === input) return;
      lastGood = Number(sec) > 0 ? Number(sec) : null;
      input.value = shown(lastGood);
    },
    setPlaceholder(text) {
      input.placeholder = text;
    },
    setUnitLabel(text) {
      unitEl.textContent = text;
    },
  };
}
