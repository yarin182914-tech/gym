// Site-wide "leave feedback" button — fixed in place above the bottom nav,
// present on every screen (not page-scoped markup, so a route change never
// removes or rebuilds it), so a thought mid-workout can be captured without
// navigating away. Opens the same bottom sheet the Feedback page's own "+"
// button does (js/ui/feedback-sheet.js) — one form either way.

import { icon } from './icon.js';
import { openFeedbackSheet } from './feedback-sheet.js';

let mounted = false;

// Call once at app boot, after the signed-in shell is showing (mirrors
// js/ui/install-banner.js's notifyAppEntered — no point building this
// before there's anywhere for the user to be "mid-something" in).
export function mountFeedbackFab() {
  if (mounted) return;
  mounted = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'feedback-fab';
  btn.className = 'feedback-fab';
  btn.setAttribute('aria-label', 'הוספת משוב על האתר');
  btn.innerHTML = icon('message-square', { className: 'icon' });
  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    openFeedbackSheet();
  });
}
