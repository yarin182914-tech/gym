// Two-or-more option segmented control (kg/lb, total/per-side, weight/volume).
//
// `name` is the data-attribute the buttons carry, so a click handler can read
// btn.dataset[name]. `groupAttrs` is whatever the caller needs to find the
// group itself — an id, or a marker attribute. Every button also carries a
// fixed `data-value`, independent of `name`, so patchToggleGroup() below can
// find the active button without needing to know the caller's attribute name.
//
// role="group" plus aria-pressed makes the selected option audible to a screen
// reader; without it the buttons announce as plain buttons and the current
// choice is conveyed by colour alone.
export function toggleGroup({ options, active, name, groupAttrs = '', label = '' }) {
  const buttons = options.map(({ value, label: text }) => {
    const isActive = active === value;
    return `<button type="button" data-${name}="${value}" data-value="${value}" class="${isActive ? 'active' : ''}" aria-pressed="${isActive}">${text}</button>`;
  }).join('\n          ');

  const groupLabel = label ? ` aria-label="${label}"` : '';
  // The indicator is inert until a caller opts in via .toggle-group--live and
  // calls patchToggleGroup() at least once — existing callers (e.g.
  // Dashboard's metric/view toggles) get the exact same static markup as
  // before, just with one harmless extra child.
  return `<div class="toggle-group" role="group"${groupLabel}${groupAttrs ? ' ' + groupAttrs : ''}>
          <span class="toggle-group-indicator" aria-hidden="true"></span>
          ${buttons}
        </div>`;
}

// Moves the sliding indicator behind the active button and syncs
// active/aria-pressed state, without rebuilding any button — lets a value
// change animate instead of instantly swapping colour.
export function patchToggleGroup(groupEl, activeValue) {
  if (!groupEl) return;
  groupEl.querySelectorAll('button').forEach((btn) => {
    const isActive = btn.dataset.value === String(activeValue);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
  placeIndicator(groupEl);
  // The indicator is measured from the active button, and a group is often
  // patched before it has a size: a card built before it is attached, or a
  // screen that is still hidden. Measuring again whenever the group's size
  // changes covers those, and a font or a rotation that lands later.
  if (!watched.has(groupEl) && typeof ResizeObserver !== 'undefined') {
    watched.add(groupEl);
    new ResizeObserver(() => placeIndicator(groupEl)).observe(groupEl);
  }
}

const watched = new WeakSet();

function placeIndicator(groupEl) {
  const indicator = groupEl.querySelector('.toggle-group-indicator');
  const activeBtn = groupEl.querySelector('button.active');
  if (!indicator || !activeBtn) return;
  indicator.style.width = `${activeBtn.offsetWidth}px`;
  indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
}
