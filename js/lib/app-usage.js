// App time from the iPhone (M3e): pure functions shared by api/usage.js
// and the app — no DOM, no Firestore — so tools/test-app-usage.mjs runs
// them under Node. Data shape: docs/DATA.md "App usage".
//
// An "opened" event starts a session, "closed" ends it; the seconds go to
// the day the session started (Israel time). A session past
// USAGE.maxSessionMin is a missed "closed" and isn't counted.

import { USAGE } from './rules.js';
import { levelFor, normalizeHabit } from './habits.js';

export const EVENTS = ['open', 'close'];
export const isApp = (app) => Object.hasOwn(USAGE.apps, app);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ms = (v) => (v instanceof Date ? v.getTime() : v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() : null);

// state: { openSince, openDay } (or null) → what to write.
// Returns { state, add: { day, seconds, opens } | null, counted }.
export function applyEvent(state, event, now, dayOf) {
  const since = ms(state?.openSince);
  const max = USAGE.maxSessionMin * 60000;
  const t = ms(now);
  if (event === 'open') {
    return {
      state: { openSince: new Date(t), openDay: dayOf(new Date(t)) },
      add: { day: dayOf(new Date(t)), seconds: 0, opens: 1 },
      counted: 0,
    };
  }
  // close
  if (!since || t < since || t - since > max) return { state: { openSince: null, openDay: null }, add: null, counted: 0 };
  const seconds = Math.round((t - since) / 1000);
  return {
    state: { openSince: null, openDay: null },
    add: { day: state.openDay || dayOf(new Date(since)), seconds, opens: 0 },
    counted: seconds,
  };
}

export const minutesOf = (seconds) => Math.round(num(seconds) / 60);

// The habit the app's minutes go into: one that names the app explicitly
// (`usageApp`), else the first active bad "limit" habit with the app's
// part, else one named after the app with no parts. → { habit, part } or null
// (part null = the whole value).
export function findUsageHabit(rawHabits, app) {
  const meta = USAGE.apps[app];
  if (!meta) return null;
  const habits = rawHabits.map(normalizeHabit).filter((h) => h.active && h.measure === 'limit');
  const pick = (h) => ({ habit: h, part: h.parts.includes(meta.part) ? meta.part : null });
  const explicit = habits.find((h) => h.usageApp === app);
  if (explicit) return explicit.parts.length && !explicit.parts.includes(meta.part) ? null : pick(explicit);
  const byPart = habits.find((h) => h.parts.includes(meta.part));
  if (byPart) return pick(byPart);
  const byName = habits.find((h) => !h.parts.length && h.name.includes(meta.name));
  return byName ? pick(byName) : null;
}

// The day's mark with the app's minutes in: other parts (typed by hand)
// kept, the sum and level recomputed. `mark` is the existing one or null.
export function usageMark(habit, part, mark, minutes) {
  const parts = part ? { ...(mark?.parts || {}), [part]: minutes } : null;
  const value = parts ? Object.values(parts).reduce((a, b) => a + num(b), 0) : minutes;
  const level = levelFor(habit, value);
  return {
    clean: level === 'full',
    slips: Array.isArray(mark?.slips) ? mark.slips : [],
    value,
    ...(parts ? { parts } : {}),
    level,
    source: 'shortcut',
  };
}
