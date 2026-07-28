// Two-or-more option segmented control (kg/lb, total/per-side, weight/volume).
//
// `name` is the data-attribute the buttons carry, so a click handler can read
// btn.dataset[name]. `groupAttrs` is whatever the caller needs to find the
// group itself — an id, or a marker attribute.
//
// role="group" plus aria-pressed makes the selected option audible to a screen
// reader; without it the buttons announce as plain buttons and the current
// choice is conveyed by colour alone.
export function toggleGroup({ options, active, name, groupAttrs = '', label = '' }) {
  const buttons = options.map(({ value, label: text }) => {
    const isActive = active === value;
    return `<button type="button" data-${name}="${value}" class="${isActive ? 'active' : ''}" aria-pressed="${isActive}">${text}</button>`;
  }).join('\n          ');

  const groupLabel = label ? ` aria-label="${label}"` : '';
  return `<div class="toggle-group" role="group"${groupLabel}${groupAttrs ? ' ' + groupAttrs : ''}>
          ${buttons}
        </div>`;
}
