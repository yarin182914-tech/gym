// DARK · RANDOM · BRIGHT — the colour theme switch at the top of every
// screen. Sits outside #app (just above it), like the feedback button, so a
// route change never rebuilds it. The theme logic itself lives in
// js/theme-boot.js (window.gymTheme), which already applied the saved theme
// before first paint; this is only the control.

import { toggleGroup, patchToggleGroup } from './toggle-group.js';
import { showToast } from './toast.js';

const PALETTE_NAMES = {
  synthwave: 'סינת׳וויב',
  'acid-sunset': 'שקיעה חומצית',
  'pop-art': 'פופ־ארט',
  'acid-jungle': 'ג׳ונגל חומצי',
  groove70: 'גרוב שנות ה־70',
};

let mounted = false;

export function mountThemeSwitch(beforeEl) {
  if (mounted || !window.gymTheme) return;
  mounted = true;

  const bar = document.createElement('div');
  bar.className = 'theme-bar';
  bar.innerHTML = toggleGroup({
    name: 'theme',
    active: window.gymTheme.mode(),
    label: 'ערכת צבעים',
    groupAttrs: 'data-theme-switch',
    options: [
      { value: 'dark', label: 'DARK' },
      { value: 'random', label: 'RANDOM' },
      { value: 'bright', label: 'BRIGHT' },
    ],
  });
  beforeEl.before(bar);

  const group = bar.querySelector('[data-theme-switch]');
  group.classList.add('toggle-group--live');
  patchToggleGroup(group, window.gymTheme.mode());

  group.querySelectorAll('button').forEach((btn) => {
    // Every tap counts, including on the already-active RANDOM — that's
    // how a new random palette is rolled.
    btn.addEventListener('click', () => {
      window.gymTheme.setMode(btn.dataset.theme);
      patchToggleGroup(group, btn.dataset.theme);
      if (btn.dataset.theme === 'random') {
        showToast(PALETTE_NAMES[window.gymTheme.current()] || '');
      }
    });
  });
}
