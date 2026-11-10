// The top app bar: the current screen's title, the colour theme switch and
// the profile button. Sticky, under the phone's status bar (safe-area
// inset), and outside #app, so a route change only swaps its title.
//
// The profile sheet opens "התכנית שלי" (#/plan), "חיבורים", the feedback button and
// the Feedback list (all off the bottom nav), and "install the app" for as
// long as it's running in a browser tab. A screen with no tab of its own
// gets a back arrow before its title.

import { icon } from './icon.js';
import { mountThemeSwitch } from './theme-switch.js';
import { openBottomSheet } from './bottom-sheet.js';
import { openFeedbackSheet } from './feedback-sheet.js';
import { isStandalone, installApp } from './install-banner.js';
import { navigate, onRouteChange } from '../lib/router.js';

const TITLES = {
  tasks: 'משימות',
  session: 'אימון',
  history: 'היסטוריה',
  'workout-progress': 'התקדמות',
  dashboard: 'התקדמות',
  nutrition: 'תזונה',
  sleep: 'שינה',
  plan: 'התכנית שלי',
  feedback: 'משוב',
  connections: 'חיבורים',
  import: 'צעדים',
};

// Screens reached from the level bar or the profile sheet, not a tab.
const NO_TAB = new Set(['dashboard', 'plan', 'feedback', 'connections']);

let mounted = false;
let cameFromApp = false; // a screen was showing before this one

export function mountAppBar(beforeEl) {
  if (mounted) return;
  mounted = true;

  const bar = document.createElement('header');
  bar.className = 'app-bar';
  bar.innerHTML = `
    <div class="app-bar-inner">
      <div class="app-bar-lead">
        <button type="button" class="app-bar-btn" data-back aria-label="חזרה" hidden>${icon('chevron-right')}</button>
        <h1 class="app-bar-title" data-app-title></h1>
      </div>
      <div class="app-bar-actions">
        <div data-theme-slot></div>
        <button type="button" class="app-bar-btn" data-profile aria-label="פרופיל והגדרות">${icon('circle-user')}</button>
      </div>
    </div>`;
  beforeEl.before(bar);

  mountThemeSwitch(bar.querySelector('[data-theme-slot]'));
  const titleEl = bar.querySelector('[data-app-title]');
  const backBtn = bar.querySelector('[data-back]');
  let shown = null;
  onRouteChange((name) => {
    if (shown) cameFromApp = true;
    shown = name;
    titleEl.textContent = TITLES[name] || '';
    document.title = TITLES[name] ? `${TITLES[name]} · אימונים` : 'מעקב אימונים';
    backBtn.hidden = !NO_TAB.has(name);
  });
  // Back to wherever it was opened from; opened straight from a link, home.
  backBtn.addEventListener('click', () => {
    if (cameFromApp) history.back();
    else navigate('today');
  });
  bar.querySelector('[data-profile]').addEventListener('click', openProfileSheet);
}

function openProfileSheet() {
  openBottomSheet({
    ariaLabel: 'פרופיל והגדרות',
    render(body, sheetApi) {
      const item = (attr, iconName, label, hint = '') => `
        <button type="button" class="settings-item" ${attr}>
          ${icon(iconName, { className: 'icon--sm' })}
          <span class="settings-item-text">${label}${hint ? `<span class="settings-item-hint">${hint}</span>` : ''}</span>
          <span class="settings-item-chevron" aria-hidden="true">${icon('chevron-left', { className: 'icon--sm' })}</span>
        </button>`;
      body.innerHTML = `
        <h3 style="margin:0 0 10px; color:var(--text);">פרופיל והגדרות</h3>
        <div class="settings-list">
          ${item('data-plan', 'target', 'התכנית שלי', 'מטרות, שינה, הרגלים, אימונים ותזונה')}
          ${item('data-connections', 'plug', 'חיבורים', 'צעדים מהאייפון ומקורות נוספים')}
          ${isStandalone() ? '' : item('data-install', 'download', 'התקנת האפליקציה', 'פתיחה במסך מלא, בלי שורת הכתובת')}
          ${item('data-feedback-new', 'message-square', 'שליחת משוב')}
          ${item('data-feedback-list', 'sticky-note', 'כל המשובים')}
        </div>`;
      body.querySelector('[data-plan]').addEventListener('click', () => {
        sheetApi.close();
        navigate('plan');
      });
      body.querySelector('[data-connections]').addEventListener('click', () => {
        sheetApi.close();
        navigate('connections');
      });
      body.querySelector('[data-install]')?.addEventListener('click', () => {
        sheetApi.close();
        installApp();
      });
      body.querySelector('[data-feedback-new]').addEventListener('click', () => {
        sheetApi.close();
        openFeedbackSheet();
      });
      body.querySelector('[data-feedback-list]').addEventListener('click', () => {
        sheetApi.close();
        navigate('feedback');
      });
    },
  });
}
