// Two-or-more option segmented control (kg/lb, total/per-side, weight/volume).
//
// `name` is the data-attribute the buttons carry, so a click handler can read
// btn.dataset[name]. `groupAttrs` is whatever the caller needs to find the
// group itself — an id, or a marker attribute.
export function toggleGroup({ options, active, name, groupAttrs = '' }) {
  const buttons = options.map(({ value, label }) =>
    `<button data-${name}="${value}" class="${active === value ? 'active' : ''}">${label}</button>`
  ).join('\n          ');

  return `<div class="toggle-group"${groupAttrs ? ' ' + groupAttrs : ''}>
          ${buttons}
        </div>`;
}
