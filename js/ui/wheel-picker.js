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

export function mountWheelPicker(hostEl, { min = 0, max = 99, value = min, onCommit }) {
  const count = max - min + 1;
  let selectedIdx = Math.min(Math.max(value - min, 0), count - 1);

  hostEl.classList.add('wheel-picker');
  hostEl.style.height = `${ITEM_H * VISIBLE}px`;

  const track = document.createElement('div');
  track.className = 'wheel-track';
  track.style.paddingTop = `${PAD}px`;
  track.style.paddingBottom = `${PAD}px`;

  const items = [];
  for (let n = min; n <= max; n++) {
    const item = document.createElement('div');
    item.className = 'wheel-item';
    item.style.height = `${ITEM_H}px`;
    item.textContent = String(n);
    track.appendChild(item);
    items.push(item);
  }

  hostEl.innerHTML = '';
  hostEl.appendChild(track);

  function highlight(idx) {
    if (items[selectedIdx]) items[selectedIdx].classList.remove('wheel-item--selected');
    selectedIdx = Math.min(Math.max(idx, 0), count - 1);
    items[selectedIdx].classList.add('wheel-item--selected');
  }

  function indexAtScroll() {
    return Math.round(hostEl.scrollTop / ITEM_H);
  }

  function commit() {
    const idx = indexAtScroll();
    highlight(idx);
    const targetTop = idx * ITEM_H;
    if (Math.abs(hostEl.scrollTop - targetTop) > 0.5) {
      hostEl.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
    onCommit?.(min + idx);
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
