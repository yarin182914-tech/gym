// The top app bar: the current screen's title, the colour theme switch and
// ⚙ settings. Sticky, under the phone's status bar (safe-area inset), and
// outside #app, so a route change only swaps its title.
//
// Settings holds what used to float over every screen — the feedback
// button — plus the Feedback list (off the bottom nav) and "install the
// app" for as long as it's running in a browser tab.

import { icon } from './icon.js';
import { mountThemeSwitch } from './theme-switch.js';
import { openBottomSheet } from './bottom-sheet.js';
import { openFeedbackSheet } from './feedback-sheet.js';
import { isStandalone, installApp } from './install-banner.js';
import { navigate, onRouteChange } from '../lib/router.js';

const TITLES = {
  session: 'אימון',
  history: 'היסטוריה',
  dashboard: 'התקדמות',
  nutrition: 'תזונה',
  plan: 'תוכנית',
  feedback: 'משוב',
};

let mounted = false;

export function mountAppBar(beforeEl) {
  if (mounted) return;
  mounted = true;

  const bar = document.createElement('header');
  bar.className = 'app-bar';
  bar.innerHTML = `
    <div class="app-bar-inner">
      <h1 class="app-bar-title" data-app-title></h1>
      <div class="app-bar-actions">
        <div data-theme-slot></div>
        <button type="button" class="app-bar-btn" data-settings aria-label="הגדרות">${icon('settings')}</button>
      </div>
    </div>`;
  beforeEl.before(bar);

  mountThemeSwitch(bar.querySelector('[data-theme-slot]'));
  const titleEl = bar.querySelector('[data-app-title]');
  onRouteChange((name) => {
    titleEl.textContent = TITLES[name] || '';
    document.title = TITLES[name] ? `${TITLES[name]} · אימונים` : 'מעקב אימונים';
  });
  bar.querySelector('[data-settings]').addEventListener('click', openSettingsSheet);
}

function openSettingsSheet() {
  openBottomSheet({
    ariaLabel: 'הגדרות',
    render(body, sheetApi) {
      const item = (attr, iconName, label, hint = '') => `
        <button type="button" class="settings-item" ${attr}>
          ${icon(iconName, { className: 'icon--sm' })}
          <span class="settings-item-text">${label}${hint ? `<span class="settings-item-hint">${hint}</span>` : ''}</span>
          <span class="settings-item-chevron" aria-hidden="true">${icon('chevron-left', { className: 'icon--sm' })}</span>
        </button>`;
      body.innerHTML = `
        <h3 style="margin:0 0 10px; color:var(--text);">הגדרות</h3>
        <div class="settings-list">
          ${isStandalone() ? '' : item('data-install', 'download', 'התקנת האפליקציה', 'פתיחה במסך מלא, בלי שורת הכתובת')}
          ${item('data-feedback-new', 'message-square', 'שליחת משוב')}
          ${item('data-feedback-list', 'sticky-note', 'כל המשובים')}
        </div>`;
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
