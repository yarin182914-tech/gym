// The first-login questionnaire (M10a, docs/specs/onboarding.md): its
// steps, when it opens by itself, and which areas a user has set up.
// Pure: no DOM, no Firestore — tools/test-onboarding.mjs runs it in Node.
//
// "Set up" is read from the data itself, never stored: a step that was
// skipped writes nothing, and the same area saved later from its own
// screen (the sleep ⚙, "יעדים") counts from then on.

import { ONBOARDING, NUTRITION } from './rules.js';
import { GOOD_TEMPLATES, BAD_TEMPLATES } from './habit-templates.js';
import { BUILTIN_TYPES } from './workout-types.js';

export const STEPS = ['body', 'workouts', 'sleep', 'food', 'habits'];
export const STEP_NAMES = { body: 'הגוף שלי', workouts: 'אימונים', sleep: 'שינה', food: 'אוכל', habits: 'הרגלים' };

// Workout kinds the questionnaire offers: the two big ones, then the
// built-in session types (js/lib/workout-types.js).
export const WORKOUT_KINDS = [
  { id: 'strength', name: 'כוח' },
  { id: 'cardio', name: 'אירובי' },
  ...BUILTIN_TYPES.map((t) => ({ id: t.id, name: t.name })),
];
const KIND_NAMES = new Map(WORKOUT_KINDS.map((k) => [k.id, k.name]));

const fin = (v) => Number.isFinite(v);

// The chosen kinds, known ids only, in the offered order.
export function workoutKindsOf(user = {}) {
  const chosen = new Set(Array.isArray(user?.workoutKinds) ? user.workoutKinds : []);
  return WORKOUT_KINDS.filter((k) => chosen.has(k.id)).map((k) => k.id);
}
export const kindName = (id) => KIND_NAMES.get(id) || id;

// Whether one area holds the user's own answers. `habits`: their habits
// (normalized or raw); only active ones count.
export function areaSet(area, user = {}, habits = []) {
  const u = user || {};
  switch (area) {
    case 'body': return !!u.body || fin(u.baseKcal);
    case 'workouts': return fin(u.weeklyWorkoutGoal) || workoutKindsOf(u).length > 0;
    case 'sleep': return typeof u.sleepBedtimeTarget === 'string' || typeof u.sleepWakeTime === 'string' || fin(u.sleepMinHours);
    // calorieDeficit is written only by "יעדים" and this step, never by
    // "הגוף שלי" (which sets the targets but isn't the food step).
    case 'food': return fin(u.mealsPerDay) || fin(u.calorieDeficit);
    case 'habits': return (habits || []).some((h) => h && h.active !== false);
    default: return false;
  }
}

// Every area's state. An account that never ran the questionnaire (ירין,
// and anyone from before it) counts as set up everywhere but habits — the
// app and the coach behave as they always have.
export function areasState(user = {}, habits = []) {
  const legacy = !user?.onboarding;
  return Object.fromEntries(STEPS.map((s) => [s, s === 'habits' || !legacy ? areaSet(s, user, habits) : true]));
}

// Opens by itself on the first visit of a new account only. `createdKey`:
// the account's creation date 'yyyy-mm-dd' (Israel time).
export function shouldAutoOpen({ user, createdKey }) {
  if (!createdKey || createdKey < ONBOARDING.fromDate) return false;
  return !user?.onboarding;
}

// Today's "להמשיך את השאלון" card: started, not finished, not snoozed.
export function showResumeCard({ user, nowMs = Date.now(), snoozedAtMs = null }) {
  const o = user?.onboarding;
  if (!o || o.doneAt) return false;
  if (fin(snoozedAtMs) && nowMs - snoozedAtMs < ONBOARDING.snoozeDays * 24 * 60 * 60 * 1000) return false;
  return true;
}

// Where a reopened questionnaire starts: the step it was left on.
export function resumeStep(user = {}) {
  const s = user?.onboarding?.step;
  return STEPS.includes(s) ? s : STEPS[0];
}

// The step after `step`, or 'done'.
export function nextStep(step) {
  const i = STEPS.indexOf(step);
  return i < 0 || i === STEPS.length - 1 ? 'done' : STEPS[i + 1];
}

// The `skipped` list after answering or skipping a step.
export function markStep(skipped = [], step, { skip }) {
  const set = new Set(Array.isArray(skipped) ? skipped : []);
  if (skip) set.add(step); else set.delete(step);
  return STEPS.filter((s) => set.has(s));
}

// Meals a day from a form value, clamped to NUTRITION.mealsRange.
export function clampMeals(v) {
  const [lo, hi] = NUTRITION.mealsRange;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return NUTRITION.maxMeals;
  return Math.min(hi, Math.max(lo, n));
}

// The one-tap habits, in the order of ONBOARDING.quickHabits.
export function quickTemplates() {
  const all = new Map([...GOOD_TEMPLATES, ...BAD_TEMPLATES].map((t) => [t.id, t]));
  return ONBOARDING.quickHabits.map((id) => all.get(id)).filter(Boolean);
}

// A habit doc's fields from a template (one tap) or a typed name (a daily
// yes/no habit), or null for an empty name. The caller adds `order`.
export function quickHabit(from) {
  if (from && typeof from === 'object') {
    const { id: _id, ...fields } = from;
    return { ...fields, active: true, source: 'onboarding' };
  }
  const name = String(from ?? '').trim().slice(0, 60);
  if (!name) return null;
  return {
    name, kind: 'good', icon: 'check', area: 'personal',
    schedule: { type: 'daily' }, measure: 'yesno', markedBy: 'me',
    active: true, source: 'onboarding',
  };
}
