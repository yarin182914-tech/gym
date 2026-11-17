// "אימון פעיל" — a small pill above the bottom nav on every screen but the
// workout screen, while a live workout is open (M15c, feedback 9.11). Tap
// → back to the workout. A web app can't show an iPhone Live Activity, so
// this and the app-icon badge are the stand-ins.
//
// The open workouts live in localStorage (js/pages/active-session.js keeps
// them there and fires SESSIONS_CHANGED_EVENT on each save), so this reads
// them without loading the workout screen; js/lib/active-workout.js says
// which ones count as live.
//
// The badge (navigator.setAppBadge) lights the home-screen icon on
// Android, and on iPhone (16.4+) only once the app has notification
// permission (M9). Where it isn't supported nothing happens.
//
// Hidden by the same rules as the + button (css/03-components.css): a
// sheet or dialog open, the keyboard up.

import { icon } from './icon.js';
import { navigate, onRouteChange } from '../lib/router.js';
import { ACTIVE_SESSIONS_KEY, hasLiveWorkout } from '../lib/active-workout.js';

export const SESSIONS_CHANGED_EVENT = 'gym-sessions-changed';

let pill = null;
let route = null;
let badgeShown = null; // last badge state sent, so it's set only on change

function readLive() {
  try {
    return hasLiveWorkout(localStorage.getItem(ACTIVE_SESSIONS_KEY));
  } catch {
    return false; // storage blocked: no pill
  }
}

function update() {
  if (!pill) return;
  const live = readLive();
  pill.hidden = !live || route === 'session';
  setBadge(live);
}

function setBadge(on) {
  if (badgeShown === on) return;
  badgeShown = on;
  try {
    if (on && 'setAppBadge' in navigator) navigator.setAppBadge(1).catch(() => {});
    else if (!on && 'clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  } catch { /* not supported here */ }
}

export function mountActiveWorkoutPill() {
  if (pill) return;
  pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'active-workout-pill';
  pill.hidden = true;
  pill.setAttribute('aria-label', 'אימון פעיל — חזרה לאימון');
  pill.innerHTML = `${icon('dumbbell', { className: 'icon--sm' })}<span>אימון פעיל</span>`;
  pill.addEventListener('click', () => navigate('session'));
  document.body.appendChild(pill);

  onRouteChange((name) => {
    route = name;
    update();
  });
  window.addEventListener(SESSIONS_CHANGED_EVENT, update);
  // Another tab of the app finished or opened a workout.
  window.addEventListener('storage', (e) => {
    if (e.key === ACTIVE_SESSIONS_KEY || e.key === null) update();
  });
  update();
}
