// Is a live workout open? Read from the open workouts the workout screen
// keeps in localStorage (`gym-active-sessions-v2`, see
// js/pages/active-session.js), so any screen can tell without loading it.
//
// "Live" = started now on the workout screen: not a backdated workout
// ("הוספת אימון שכבר בוצע") and not a saved one reopened from History for
// editing. The "אימון פעיל" pill and the app-icon badge show only for these.
//
// No DOM here: the caller passes the raw stored string (or null).

export const ACTIVE_SESSIONS_KEY = 'gym-active-sessions-v2';

export function isLiveSession(s) {
  return !!s && typeof s === 'object' && s.live === true && !s.editingWorkoutId;
}

// The live workout to go back to: the one on screen last if it is live,
// otherwise the first live one. null when none, or storage is unreadable.
export function liveWorkout(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  const list = Array.isArray(saved?.sessions) ? saved.sessions : [];
  const live = list.filter(isLiveSession);
  if (live.length === 0) return null;
  return live.find((s) => s.id === saved.activeId) || live[0];
}

export function hasLiveWorkout(raw) {
  return liveWorkout(raw) !== null;
}
