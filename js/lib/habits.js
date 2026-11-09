// Habits: what a habit's day looks like, and its streak. Pure functions —
// no DOM, no Firestore — so tools/test-habits.mjs can run them under Node.
//
// A day's marks live in habitLogs/{yyyy-mm-dd} (map habitId → mark). A
// habit with `autoSource: 'dailyActivity.steps'` also reads that day's
// steps from dailyActivity; a manual mark on the same day wins. Days are
// the device's local dates — Israel, like the rest of the app (docs/DATA.md).

import { HABITS } from './rules.js';
import { parseKey, shiftDays } from './sleep.js';

export const AREAS = { body: 'גוף', personal: 'אישי', relationship: 'זוגיות', career: 'קריירה' };
export const MEASURES = ['yesno', 'quantity', 'limit', 'steps'];
export const LEVELS = ['full', 'short', 'none'];
export const AUTO_STEPS = 'dailyActivity.steps';

// Created once for a new user (users/{uid}.habitsSeeded stops it coming
// back after they're deleted).
export const EXAMPLE_HABITS = [
  { name: 'קריאה', icon: 'book-open', area: 'personal', schedule: { type: 'daily' }, measure: 'quantity', unit: 'דקות', full: 10, short: 5, autoSource: null },
  { name: 'צעדים', icon: 'footprints', area: 'body', schedule: { type: 'daily' }, measure: 'quantity', unit: 'צעדים', full: 8000, short: 5000, autoSource: AUTO_STEPS },
  { name: 'בלי טלפון לפני השינה', icon: 'phone-off', area: 'personal', schedule: { type: 'daily' }, measure: 'yesno', unit: 'דקות', full: 30, short: 15, autoSource: null },
];

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const intIn = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
};

// A stored habit doc in a safe shape — coach-written or older docs may
// miss fields.
export function normalizeHabit(raw = {}) {
  const s = raw.schedule || {};
  let schedule = { type: 'daily' };
  if (s.type === 'weekly') schedule = { type: 'weekly', perWeek: intIn(s.perWeek, 1, 7, 3) };
  else if (s.type === 'days' && Array.isArray(s.days)) {
    const days = [...new Set(s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (days.length) schedule = { type: 'days', days };
  }
  return {
    ...raw,
    name: String(raw.name ?? '').trim() || 'הרגל',
    icon: raw.icon || 'check',
    area: AREAS[raw.area] ? raw.area : 'personal',
    schedule,
    measure: MEASURES.includes(raw.measure) ? raw.measure : 'yesno',
    unit: String(raw.unit ?? ''),
    full: num(raw.full),
    short: num(raw.short),
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    autoSource: raw.autoSource === AUTO_STEPS ? AUTO_STEPS : null,
    active: raw.active !== false,
    order: Number.isFinite(raw.order) ? raw.order : 0,
  };
}

// Whether the habit takes a number ("אחר"): a quantity or a limit.
export const takesValue = (habit) => habit.measure === 'quantity' || habit.measure === 'limit';

// The level a number earns. Quantity: the full target or more → full, the
// short one or more → short. Limit: the other way round — at most full →
// full, at most short → short. Anything else → none.
export function levelFor(habit, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 'none';
  const { full, short } = habit;
  if (habit.measure === 'limit') {
    if (full !== null && v <= full) return 'full';
    if (short !== null && v <= short) return 'short';
    return 'none';
  }
  if (full !== null && v >= full) return 'full';
  if (short !== null && v >= short) return 'short';
  return 'none';
}

// Lookups for entryFor(): habitLogs docs and dailyActivity docs, any order.
export function habitContext(logs = [], activities = []) {
  return {
    logsByDate: new Map(logs.map((l) => [l.date || l.id, l])),
    stepsByDate: new Map(activities.map((a) => [a.date || a.id, Number(a.steps) || 0])),
  };
}

// The habit's day: { level, value, auto } or null when nothing's there.
// A manual mark wins; otherwise an auto-steps habit reads the day's steps
// (0 = unknown, so nothing).
export function entryFor(habit, key, ctx) {
  const mark = ctx.logsByDate.get(key)?.habits?.[habit.id];
  if (mark && LEVELS.includes(mark.level)) return { level: mark.level, value: num(mark.value), auto: false };
  if (habit.autoSource === AUTO_STEPS) {
    const steps = ctx.stepsByDate.get(key);
    if (steps > 0) return { level: levelFor(habit, steps), value: steps, auto: true };
  }
  return null;
}

export const isDone = (entry) => entry?.level === 'full' || entry?.level === 'short';

// Fixed weekdays are due on their days only; daily and N-per-week habits
// any day.
export function isDue(habit, key) {
  if (habit.schedule.type !== 'days') return true;
  return habit.schedule.days.includes(parseKey(key).getDay());
}

// The first day ('yyyy-mm-dd') of the week `key` is in.
export function weekStart(key) {
  const back = (parseKey(key).getDay() - HABITS.weekStartsOn + 7) % 7;
  return shiftDays(key, -back);
}

// Days done in the week `key` is in.
export function weekCount(habit, key, ctx) {
  const start = weekStart(key);
  let count = 0;
  for (let i = 0; i < 7; i += 1) if (isDone(entryFor(habit, shiftDays(start, i), ctx))) count += 1;
  return count;
}

// Whether the habit still needs doing today: due, not done, and (N per
// week) the week's target not reached yet.
export function isOpenToday(habit, key, ctx) {
  if (!isDue(habit, key) || isDone(entryFor(habit, key, ctx))) return false;
  if (habit.schedule.type === 'weekly') return weekCount(habit, key, ctx) < habit.schedule.perWeek;
  return true;
}

// → { count, unit: 'days' | 'weeks' }.
// Daily / fixed weekdays: due days done in a row, counting back from today —
// or from the last due day while today's still open, so the streak doesn't
// look broken before the evening. Days the habit isn't due on are skipped.
// N per week: weeks in a row that reached N; the current week counts once
// it reaches N and never breaks the streak before it ends.
export function habitStreak(habit, todayKey, ctx, maxDays = HABITS.logDaysToLoad) {
  if (habit.schedule.type === 'weekly') {
    const n = habit.schedule.perWeek;
    let start = weekStart(todayKey);
    let count = weekCount(habit, start, ctx) >= n ? 1 : 0;
    for (let w = 1; w <= Math.ceil(maxDays / 7); w += 1) {
      start = shiftDays(start, -7);
      if (weekCount(habit, start, ctx) < n) break;
      count += 1;
    }
    return { count, unit: 'weeks' };
  }

  let key = todayKey;
  if (isDue(habit, key) && !isDone(entryFor(habit, key, ctx))) key = shiftDays(key, -1);
  let count = 0;
  for (let i = 0; i < maxDays; i += 1, key = shiftDays(key, -1)) {
    if (!isDue(habit, key)) continue;
    if (!isDone(entryFor(habit, key, ctx))) break;
    count += 1;
  }
  return { count, unit: 'days' };
}
