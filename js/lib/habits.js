// Habits: what a habit's day looks like, and its streak. Pure functions —
// no DOM, no Firestore — so tools/test-habits.mjs can run them under Node.
//
// A day's marks live in habitLogs/{yyyy-mm-dd} (map habitId → mark). A
// habit with `autoSource: 'dailyActivity.steps'` also reads that day's
// steps from dailyActivity, and one with `autoSource: 'workouts.strength'`
// counts that day's workouts with strength exercises; a manual mark on the
// same day wins. Days are
// the device's local dates — Israel, like the rest of the app (docs/DATA.md).

import { HABITS, BAD_HABITS } from './rules.js';
import { parseKey, shiftDays } from './sleep.js';
import { workoutKind, workoutDayKey } from './workout-types.js';

export const AREAS = { body: 'גוף', personal: 'אישי', relationship: 'זוגיות', career: 'קריירה' };
export const MEASURES = ['yesno', 'quantity', 'limit', 'steps'];
// A bad habit: a reported clean day (yes/no), a limit (at most N), or a
// slip counter.
export const BAD_MEASURES = ['clean', 'limit', 'slips'];
export const PARTS_OF_DAY = { morning: 'בוקר', noon: 'צהריים', evening: 'ערב', night: 'לפני השינה' };
// Who marks it: me (a tap), the coach (asks in the evening check), or
// automatically (steps from the phone).
export const MARKED_BY = { me: 'אני בלחיצה', coach: 'העוזר שואל בערב', auto: 'אוטומטית' };
export const LEVELS = ['full', 'short', 'none'];
export const AUTO_STEPS = 'dailyActivity.steps';
export const AUTO_STRENGTH = 'workouts.strength';
export const AUTO_SOURCES = [AUTO_STEPS, AUTO_STRENGTH];
// The most fields a quantity/limit habit splits into (e.g. אינסטגרם, פייסבוק).
export const MAX_PARTS = 6;

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
  // No `kind` (every habit before M5) → a good habit, as it always was.
  const kind = raw.kind === 'bad' ? 'bad' : 'good';
  const steps = Array.isArray(raw.steps) ? raw.steps.map((s) => String(s)) : [];
  const text = (v) => String(v ?? '').trim();
  let measure;
  if (kind === 'bad') measure = BAD_MEASURES.includes(raw.measure) ? raw.measure : 'clean';
  else measure = MEASURES.includes(raw.measure) ? raw.measure : 'yesno';
  const autoSource = AUTO_SOURCES.includes(raw.autoSource) && kind === 'good' ? raw.autoSource : null;
  // Several number fields summed into the day's value — quantity/limit only.
  const parts = (measure === 'quantity' || measure === 'limit') && Array.isArray(raw.parts)
    ? [...new Set(raw.parts.map(text).filter(Boolean))].slice(0, MAX_PARTS)
    : [];
  return {
    ...raw,
    kind,
    name: text(raw.name) || 'הרגל',
    icon: raw.icon || 'check',
    area: AREAS[raw.area] ? raw.area : 'personal',
    schedule: kind === 'bad' ? { type: 'daily' } : schedule,
    measure,
    unit: String(raw.unit ?? ''),
    full: num(raw.full) ?? (measure === 'slips' ? 0 : null),
    short: num(raw.short) ?? (measure === 'slips' ? BAD_HABITS.shortSlips : null),
    steps,
    // The routine's steps that count as "מקוצר" (indexes into `steps`).
    shortSteps: Array.isArray(raw.shortSteps)
      ? [...new Set(raw.shortSteps.filter((i) => Number.isInteger(i) && i >= 0 && i < steps.length))].sort((a, b) => a - b)
      : [],
    parts,
    autoSource,
    active: raw.active !== false,
    order: Number.isFinite(raw.order) ? raw.order : 0,
    // The wizard's answers (M5) — all optional.
    why: text(raw.why),
    partOfDay: PARTS_OF_DAY[raw.partOfDay] ? raw.partOfDay : null,
    anchor: text(raw.anchor),
    reminder: /^\d{1,2}:\d{2}$/.test(raw.reminder ?? '') ? raw.reminder : null,
    markedBy: MARKED_BY[raw.markedBy] ? raw.markedBy : autoSource ? 'auto' : 'me',
    // Bad habits only.
    trigger: text(raw.trigger),
    replacement: text(raw.replacement),
    friction: text(raw.friction),
    cleanWeekTarget: intIn(raw.cleanWeekTarget, 1, 7, BAD_HABITS.cleanWeekTarget),
  };
}

export const isBad = (habit) => habit.kind === 'bad';
export const isGood = (habit) => habit.kind !== 'bad';

// ---------- routines (measure 'steps') ----------

// Every step → full; all the "מקוצר" steps (when there are any) → short;
// anything else ticked → none; nothing → null.
export function routineLevel(habit, stepsDone) {
  const done = new Set(stepsDone || []);
  if (!done.size) return null;
  if (habit.steps.length && habit.steps.every((_, i) => done.has(i))) return 'full';
  if (habit.shortSteps.length && habit.shortSteps.every((i) => done.has(i))) return 'short';
  return 'none';
}

// ---------- bad habits ----------
// A day's mark (habitLogs/{date}.habits[id]) for a bad habit:
// { level, value, slips: [Timestamp], clean: true?, source }. Its level is
// worked out from what was reported, never trusted from the mark:
//   clean / slips: a reported clean day (clean: true, no slips) → full;
//     on a slip counter, up to `short` slips → short; any more → none.
//     On "clean day" (yes/no) any slip → none.
//   limit: the minutes reported, as a limit habit (at most full → full…).
// Nothing reported → null: unknown, scored nothing, shown as an outline.

export const badMark = (habit, key, ctx) => ctx.logsByDate.get(key)?.habits?.[habit.id] || null;

export const slipsOf = (mark) => (Array.isArray(mark?.slips) ? mark.slips : []);

export function badDayLevel(habit, mark) {
  if (!mark) return null;
  if (habit.measure === 'limit') {
    const v = num(mark.value);
    if (v !== null) return levelFor(habit, v);
    return mark.clean === true ? 'full' : null;
  }
  const n = slipsOf(mark).length;
  if (n === 0) return mark.clean === true ? 'full' : null;
  if (habit.measure === 'slips' && n <= (habit.short ?? BAD_HABITS.shortSlips)) return 'short';
  return 'none';
}

// Whether the day holds an honest report of a slip (or of going over the
// limit) — worth BAD_HABITS.points.slipLog.
export function slipReported(habit, mark) {
  if (!mark) return false;
  if (habit.measure === 'limit') {
    const v = num(mark.value);
    return v !== null && habit.full !== null && v > habit.full;
  }
  return slipsOf(mark).length > 0;
}

// The clean streaks, oldest first: [{ start, end, days: [keys], endedBy }].
// A streak is confirmed clean days in a row. A slip ends it (endedBy
// 'slip'); an unreported day is skipped while it can still be filled in
// (up to fillInDays before `today`) and ends it once it can't ('gap').
// The last one, with endedBy null, is the current streak.
export function cleanRuns(habit, today, ctx) {
  const keys = [...ctx.logsByDate.keys()].filter((k) => badMark(habit, k, ctx)).sort();
  if (!keys.length) return [];
  const fillFrom = shiftDays(today, -BAD_HABITS.fillInDays);
  const runs = [];
  let cur = null;
  const close = (endedBy) => {
    if (cur) runs.push({ ...cur, endedBy });
    cur = null;
  };
  for (let k = keys[0]; k <= today; k = shiftDays(k, 1)) {
    const level = badDayLevel(habit, badMark(habit, k, ctx));
    if (level === 'full') {
      if (!cur) cur = { start: k, end: k, days: [] };
      cur.days.push(k);
      cur.end = k;
    } else if (level === null) {
      if (k < fillFrom) close('gap');
    } else {
      close('slip');
    }
  }
  if (cur) runs.push({ ...cur, endedBy: null });
  return runs;
}

// → { current, best, lastEnded } — day counts; lastEnded: the streak that
// ended most recently (for "21 ימים זה הישג. מתחילים רצף חדש").
export function cleanStreak(habit, today, ctx) {
  const runs = cleanRuns(habit, today, ctx);
  const last = runs.at(-1);
  const current = last && last.endedBy === null ? last.days.length : 0;
  const ended = runs.filter((r) => r.endedBy);
  return {
    current,
    best: runs.reduce((m, r) => Math.max(m, r.days.length), 0),
    lastEnded: ended.at(-1) ? { days: ended.at(-1).days.length, endedBy: ended.at(-1).endedBy, end: ended.at(-1).end } : null,
  };
}

// Reported clean days in the week `key` is in, up to `key`.
export function cleanDaysThrough(habit, key, ctx) {
  let count = 0;
  for (let k = weekStart(key); k <= key; k = shiftDays(k, 1)) {
    if (badDayLevel(habit, badMark(habit, k, ctx)) === 'full') count += 1;
  }
  return count;
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

// A split habit's sheet → what the mark stores: the entered fields
// (name → number) and their sum as the value. Nothing entered → null.
export function partsMark(habit, values = {}) {
  const parts = {};
  for (const name of habit.parts || []) {
    const v = num(values[name]);
    if (v !== null) parts[name] = v;
  }
  const entered = Object.values(parts);
  return entered.length ? { value: entered.reduce((a, b) => a + b, 0), parts } : null;
}

// Lookups for entryFor(): habitLogs, dailyActivity and workout docs, any
// order. strengthByDate: day → workouts holding a strength exercise.
export function habitContext(logs = [], activities = [], workouts = []) {
  const strengthByDate = new Map();
  for (const w of workouts) {
    if (!workoutKind(w).strength.length) continue;
    const k = workoutDayKey(w);
    strengthByDate.set(k, (strengthByDate.get(k) || 0) + 1);
  }
  return {
    logsByDate: new Map(logs.map((l) => [l.date || l.id, l])),
    stepsByDate: new Map(activities.map((a) => [a.date || a.id, Number(a.steps) || 0])),
    strengthByDate,
  };
}

// The habit's day: { level, value, auto } or null when nothing's there.
// A manual mark wins; otherwise an auto-steps habit reads the day's steps
// (0 = unknown, so nothing), and an auto-strength habit is full on a day
// with a strength workout (value: how many).
export function entryFor(habit, key, ctx) {
  const mark = ctx.logsByDate.get(key)?.habits?.[habit.id];
  if (mark && LEVELS.includes(mark.level)) return { level: mark.level, value: num(mark.value), auto: false };
  if (habit.autoSource === AUTO_STEPS) {
    const steps = ctx.stepsByDate.get(key);
    if (steps > 0) return { level: levelFor(habit, steps), value: steps, auto: true };
  }
  if (habit.autoSource === AUTO_STRENGTH) {
    const count = ctx.strengthByDate?.get(key) || 0;
    if (count > 0) return { level: 'full', value: count, auto: true };
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
