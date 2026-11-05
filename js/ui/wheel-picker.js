// iOS Clock-style wheel picker for a whole-number value (reps).
//
// Built on native scrolling + CSS scroll-snap rather than hand-rolled
// pointer-drag physics: the platform already supplies correct momentum and
// rubber-banding on a touch device, and reimplementing that tends to feel
// worse, not better, than just scrolling a snapping list.
//
// Stateful by nature (scroll position, in-flight settle timer), so — like
// numeric-input.js — this mounts into a host element and returns a
// controller rather than following the rest of js/ui/*'s string-render
// convention.

const ITEM_H = 40; // px; must match the inline height set on .wheel-item below
const VISIBLE = 3; // odd, so exactly one item centers in the viewport
const PAD = (ITEM_H * (VISIBLE - 1)) / 2;

// A looping wheel (a clock's hours/minutes: 59 → 00 → 01) can't be a truly
// endless list, so it repeats the numbers this many px' worth in each
// direction — far more than one fling travels — and, once a scroll settles,
// jumps without animation to the same number in the middle copy. The copies
// are identical, so the jump can't be seen and the ends are never reached.
const LOOP_REACH = 6000;

// format: how each number is shown — e.g. zero-padded minutes on a clock.
// loop: wrap around past max back to min, and back again.
export function mountWheelPicker(hostEl, { min = 0, max = 99, value = min, format = String, loop = false, onCommit }) {
  const count = max - min + 1;
  // Odd, so there's a middle copy with the same number of copies either side.
  const copies = loop ? 2 * Math.ceil(LOOP_REACH / (count * ITEM_H)) + 1 : 1;
  const home = loop ? Math.floor(copies / 2) * count : 0; // index of `min` in the middle copy
  const total = count * copies;
  let selectedIdx = home + Math.min(Math.max(value - min, 0), count - 1);

  hostEl.classList.add('wheel-picker');
  hostEl.style.height = `${ITEM_H * VISIBLE}px`;

  const track = document.createElement('div');
  track.className = 'wheel-track';
  track.style.paddingTop = `${PAD}px`;
  track.style.paddingBottom = `${PAD}px`;

  const items = [];
  for (let i = 0; i < total; i++) {
    const item = document.createElement('div');
    item.className = 'wheel-item';
    item.style.height = `${ITEM_H}px`;
    item.textContent = format(min + (i % count));
    track.appendChild(item);
    items.push(item);
  }

  hostEl.innerHTML = '';
  hostEl.appendChild(track);

  function highlight(idx) {
    if (items[selectedIdx]) items[selectedIdx].classList.remove('wheel-item--selected');
    selectedIdx = Math.min(Math.max(idx, 0), total - 1);
    items[selectedIdx].classList.add('wheel-item--selected');
  }

  function indexAtScroll() {
    return Math.round(hostEl.scrollTop / ITEM_H);
  }

  function commit() {
    let idx = indexAtScroll();
    const offset = idx % count;
    if (loop && idx !== home + offset) {
      // Settled outside the middle copy: move back into it, invisibly.
      idx = home + offset;
      hostEl.scrollTop = idx * ITEM_H;
    }
    highlight(idx);
    const targetTop = idx * ITEM_H;
    if (Math.abs(hostEl.scrollTop - targetTop) > 0.5) {
      hostEl.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
    onCommit?.(min + offset);
  }

  let settleTimer = null;
  const supportsScrollEnd = 'onscrollend' in window;

  function onScroll() {
    highlight(indexAtScroll());
    if (supportsScrollEnd) return; // commit() runs off the scrollend listener instead
    clearTimeout(settleTimer);
    settleTimer = setTimeout(commit, 120);
  }

  hostEl.addEventListener('scroll', onScroll, { passive: true });
  if (supportsScrollEnd) hostEl.addEventListener('scrollend', commit);

  // Jump to the starting value with no animation, then reflect it visually.
  hostEl.scrollTop = selectedIdx * ITEM_H;
  highlight(selectedIdx);

  return {
    destroy() {
      clearTimeout(settleTimer);
      hostEl.removeEventListener('scroll', onScroll);
      if (supportsScrollEnd) hostEl.removeEventListener('scrollend', commit);
    },
  };
}
