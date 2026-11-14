// The floating + button: quick logging from any screen. It opens a bottom
// sheet, and each item opens the form that already exists for it (the list
// is js/lib/quick-actions.js). The screen that is showing gets its own
// action first, as a wide row above the grid (M14a): "ארוחה" on תזונה,
// "משימה" on משימות, and so on.
//
// Other screens can ask for a screen's action too (runQuickAction) — the
// home screen's nearest decision opens it on להחליט this way.
//
// A screen takes its actions with handleQuickActions(route, fn) once it has
// loaded. An action asked for while its screen is showing runs at once;
// otherwise it waits for that screen to mount, and is dropped if the user
// goes somewhere else first. fn(action, { here }): `here` is true when the
// action was asked for on the screen itself.
//
// The button hides itself (css/03-components.css) whenever it could cover
// a form's save button — a sheet or dialog open, the keyboard up, the meal
// form open. "Keyboard up" is a focused field AND a visibly shorter
// viewport: a field focused by code (שקילה) opens no keyboard on iPhone,
// and hiding on focus alone left the button gone until the field blurred.

import { icon } from './icon.js';
import { openBottomSheet } from './bottom-sheet.js';
import { navigate, onRouteChange } from '../lib/router.js';
import { QUICK_ITEMS, sheetItems } from '../lib/quick-actions.js';

const handlers = {}; // route -> fn(action, { here }), while that screen is mounted
const primaries = {}; // route -> () => the action that screen puts first right now
let pending = null; // { route, action } waiting for its screen
let mounted = false;
let currentRoute = null; // the screen that is showing

// Returns the function that stops taking them — call it on unmount.
// primary: () => the action this screen wants first on the sheet right now
// (null for its usual one) — משימות names "decision" on its החלטות part.
export function handleQuickActions(route, fn, { primary = null } = {}) {
  handlers[route] = fn;
  if (primary) primaries[route] = primary;
  if (pending?.route === route) {
    const { action } = pending;
    pending = null;
    fn(action, { here: false });
  }
  return () => {
    if (handlers[route] !== fn) return;
    delete handlers[route];
    delete primaries[route];
  };
}

export function runQuickAction(route, action) {
  request(route, action);
}

function request(route, action) {
  if (handlers[route]) {
    handlers[route](action, { here: true });
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
    currentRoute = name;
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
  const { primary, rest } = sheetItems(currentRoute, primaries[currentRoute]?.() ?? null);
  openBottomSheet({
    ariaLabel: 'רישום מהיר',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 10px; color:var(--text);">רישום מהיר</h3>
        ${primary ? `
        <button type="button" class="btn btn-primary quick-add-primary" data-quick="${primary.action}">
          ${icon(primary.icon)}
          <span>${primary.label}</span>
        </button>` : ''}
        <div class="quick-add-grid">
          ${rest.map((item) => `
          <button type="button" class="quick-add-item" data-quick="${item.action}">
            ${icon(item.icon)}
            <span>${item.label}</span>
          </button>`).join('')}
        </div>`;
      body.addEventListener('click', (e) => {
        const action = e.target.closest('[data-quick]')?.dataset.quick;
        const item = QUICK_ITEMS.find((i) => i.action === action);
        if (!item) return;
        sheetApi.close();
        request(item.route, item.action);
      });
    },
  });
}
