// Inline numeric entry for weight — replaces the +/- stepper with direct
// typing. Uses the platform's own decimal keypad (inputmode="decimal")
// rather than a hand-rolled keypad overlay: iOS/Android already provide the
// right keys, cursor editing and accessibility for a numeric field for free.
//
// Stateful by nature (focus, in-progress typing, last committed value), so
// unlike the rest of js/ui/* this isn't a pure string-render function — it
// mounts into a host element and returns a small controller instead.

const MIN = 0;
const MAX = 999; // weights; calorie fields pass a higher max

function clampTo(max, n, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, MIN), max);
}

// nullable: an emptied field commits null and stays empty (cardio, where
// every value is optional) instead of snapping back to the last number.
// max: the highest value accepted (999 by default — a weight).
export function mountNumericField(hostEl, { value, unitLabel = '', ariaLabel = 'משקל', nullable = false, max = MAX, onCommit }) {
  const clamp = (n, fallback) => clampTo(max, n, fallback);
  const isBlank = (v) => nullable && (v === null || v === undefined || v === '');
  let lastGood = isBlank(value) ? null : clamp(value, 0);
  const shown = (v) => (v === null ? '' : v);

  hostEl.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'numeric-field';

  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.step = 'any';
  input.dir = 'ltr'; // digits read naturally even inside the page's RTL flow
  input.className = 'numeric-field-input num';
  input.value = shown(lastGood);
  input.setAttribute('aria-label', ariaLabel);

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
    const next = isBlank(input.value.trim()) ? null : clamp(parseFloat(input.value), lastGood);
    lastGood = next;
    input.value = shown(next);
    onCommit?.(next);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur(); // triggers commit via blur
    if (e.key === 'Escape') {
      input.value = shown(lastGood);
      input.blur();
    }
  });

  return {
    // Skipped while the field is focused so an unrelated patch elsewhere on
    // the screen can never clobber a value the user is mid-typing.
    setValue(v) {
      if (document.activeElement === input) return;
      lastGood = isBlank(v) ? null : clamp(v, lastGood);
      input.value = shown(lastGood);
    },
    // Greyed hint shown while the field is empty, e.g. a derived value.
    setPlaceholder(text) {
      input.placeholder = text;
    },
    setUnitLabel(text) {
      unitEl.textContent = text;
    },
  };
}
