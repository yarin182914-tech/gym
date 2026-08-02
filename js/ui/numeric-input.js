// Inline numeric entry for weight — replaces the +/- stepper with direct
// typing. Uses the platform's own decimal keypad (inputmode="decimal")
// rather than a hand-rolled keypad overlay: iOS/Android already provide the
// right keys, cursor editing and accessibility for a numeric field for free.
//
// Stateful by nature (focus, in-progress typing, last committed value), so
// unlike the rest of js/ui/* this isn't a pure string-render function — it
// mounts into a host element and returns a small controller instead.

const MIN = 0;
const MAX = 999;

function clamp(n, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, MIN), MAX);
}

export function mountNumericField(hostEl, { value, unitLabel = '', onCommit }) {
  let lastGood = clamp(value, 0);

  hostEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'numeric-field';

  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.step = 'any';
  input.dir = 'ltr'; // digits read naturally even inside the page's RTL flow
  input.className = 'numeric-field-input num';
  input.value = lastGood;
  input.setAttribute('aria-label', 'משקל');

  const unitEl = document.createElement('span');
  unitEl.className = 'numeric-field-unit';
  unitEl.textContent = unitLabel;

  wrap.appendChild(input);
  wrap.appendChild(unitEl);
  hostEl.appendChild(wrap);

  // The input itself is a narrow ch-sized box; sweaty or imprecise fingers
  // should still hit something by tapping anywhere on the padded pill.
  wrap.addEventListener('click', (e) => {
    if (e.target !== input) input.focus();
  });

  input.addEventListener('focus', () => input.select());

  function commit() {
    const clamped = clamp(parseFloat(input.value), lastGood);
    lastGood = clamped;
    input.value = clamped;
    onCommit?.(clamped);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur(); // triggers commit via blur
    if (e.key === 'Escape') {
      input.value = lastGood;
      input.blur();
    }
  });

  return {
    // Skipped while the field is focused so an unrelated patch elsewhere on
    // the screen can never clobber a value the user is mid-typing.
    setValue(v) {
      if (document.activeElement === input) return;
      lastGood = clamp(v, lastGood);
      input.value = lastGood;
    },
    setUnitLabel(text) {
      unitEl.textContent = text;
    },
  };
}
