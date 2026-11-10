// The floating + button: quick logging from any screen. It opens a bottom
// sheet, and each item opens the form that already exists for it:
//   אימון  → אימון, a new workout with the exercise picker open
//   הליכה  → אימון, a new workout with a walk ready to fill in
//   ארוחה  → תזונה, the add-meal form
//   שקילה  → תזונה, the morning weigh-in card
//   צעדים  → תזונה, today's activity sheet
//   שינה   → שינה, last night's sheet
//   הרגל   → היום, the habits (a new one when there are none)
//
// A screen takes its actions with handleQuickActions(route, fn) once it has
// loaded. An action asked for while its screen is showing runs at once;
// otherwise it waits for that screen to mount, and is dropped if the user
// goes somewhere else first.
//
// The button hides itself (css/03-components.css) whenever it could cover
// a form's save button — a sheet or dialog open, the keyboard up, the meal
// form open. "Keyboard up" is a focused field AND a visibly shorter
// viewport: a field focused by code (שקילה) opens no keyboard on iPhone,
// and hiding on focus alone left the button gone until the field blurred.

import { icon } from './icon.js';
import { openBottomSheet } from './bottom-sheet.js';
import { navigate, onRouteChange } from '../lib/router.js';

const ITEMS = [
  { route: 'session', action: 'workout', icon: 'dumbbell', label: 'אימון' },
  { route: 'session', action: 'walk', icon: 'walk', label: 'הליכה' },
  { route: 'nutrition', action: 'meal', icon: 'utensils', label: 'ארוחה' },
  { route: 'nutrition', action: 'weigh', icon: 'weight', label: 'שקילה' },
  { route: 'nutrition', action: 'steps', icon: 'footprints', label: 'צעדים' },
  { route: 'sleep', action: 'sleep', icon: 'moon', label: 'שינה' },
  { route: 'today', action: 'habit', icon: 'list-checks', label: 'הרגל' },
];

const handlers = {}; // route -> fn(action), while that screen is mounted
let pending = null; // { route, action } waiting for its screen
let mounted = false;

// Returns the function that stops taking them — call it on unmount.
export function handleQuickActions(route, fn) {
  handlers[route] = fn;
  if (pending?.route === route) {
    const { action } = pending;
    pending = null;
    fn(action);
  }
  return () => {
    if (handlers[route] === fn) delete handlers[route];
  };
}

function request(route, action) {
  if (handlers[route]) {
    handlers[route](action);
    return;
  }
  pending = { route, action };
  navigate(route);
}

export function mountQuickAdd() {
  if (mounted) return;
  mounted = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fab';
  btn.setAttribute('aria-label', 'רישום מהיר');
  btn.innerHTML = icon('plus');
  btn.addEventListener('click', openQuickAddSheet);
  document.body.appendChild(btn);

  onRouteChange((name) => {
    if (pending && pending.route !== name) pending = null;
  });

  watchKeyboard();
}

const KEYBOARD_MIN_PX = 150; // shorter than this is a toolbar, not a keyboard

function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return; // old browsers: the button simply stays
  // The tallest the screen has been with nothing being typed into — the
  // keyboard is up when the visible part is well short of it.
  let fullHeight = vv.height;
  const typing = () => document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
  const update = () => {
    if (!typing()) fullHeight = Math.max(fullHeight, vv.height);
    const open = typing() && vv.height < fullHeight - KEYBOARD_MIN_PX;
    document.body.classList.toggle('keyboard-open', open);
  };
  vv.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => setTimeout(update, 0));
  window.addEventListener('orientationchange', () => {
    fullHeight = 0;
    setTimeout(update, 300);
  });
}

function openQuickAddSheet() {
  openBottomSheet({
    ariaLabel: 'רישום מהיר',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 10px; color:var(--text);">רישום מהיר</h3>
        <div class="quick-add-grid">
          ${ITEMS.map((item, i) => `
          <button type="button" class="quick-add-item" data-quick="${i}">
            ${icon(item.icon)}
            <span>${item.label}</span>
          </button>`).join('')}
        </div>`;
      body.querySelector('.quick-add-grid').addEventListener('click', (e) => {
        const item = ITEMS[e.target.closest('[data-quick]')?.dataset.quick];
        if (!item) return;
        sheetApi.close();
        request(item.route, item.action);
      });
    },
  });
}
