import { formatClock } from '../lib/cardio.js';

// Inline m:ss entry — a cardio segment's duration, or a running pace.
// Same look and commit-on-blur behaviour as numeric-input.js, but a text
// field so the colon can be typed. Typing digits alone also works: "25" is
// 25 minutes, "530" is 5:30, "1500" is 15:00.

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

export function mountClockField(hostEl, { seconds, unitLabel = '', ariaLabel = 'זמן', onCommit }) {
  let lastGood = Math.max(0, Number(seconds) || 0);

  hostEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'numeric-field';

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.dir = 'ltr';
  input.className = 'numeric-field-input num';
  input.value = formatClock(lastGood);
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
    const parsed = parseClock(input.value);
    if (parsed !== null) lastGood = Math.min(Math.round(parsed), MAX_SEC);
    input.value = formatClock(lastGood);
    onCommit?.(lastGood);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = formatClock(lastGood);
      input.blur();
    }
  });

  return {
    setValue(sec) {
      if (document.activeElement === input) return;
      lastGood = Math.max(0, Number(sec) || 0);
      input.value = formatClock(lastGood);
    },
    setUnitLabel(text) {
      unitEl.textContent = text;
    },
  };
}
