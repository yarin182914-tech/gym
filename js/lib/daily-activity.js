// Calories out — one dailyActivity document per local day (see
// docs/DATA.md). Nutrition's "נכנס מול יוצא" card reads it next to the
// day's meals.
//
// The estimate: a resting-plus-daily-life base (Mifflin-St Jeor BMR × 1.2,
// sedentary), then steps and workouts on top. Each doc keeps the numbers it
// was saved with, so changing the base later doesn't rewrite past days.

import { shiftKey } from './body-weight.js';
import { ACTIVITY } from './rules.js';

// Both numbers live in rules.js; re-exported here for existing callers.
export const BASE_KCAL = ACTIVITY.baseKcal;
export const KCAL_PER_STEP = ACTIVITY.kcalPerStep;

export const stepsKcal = (steps) => Math.round((steps || 0) * KCAL_PER_STEP);

// The full document for a day, from what's known about it.
export function buildActivity(dateKey, { steps = 0, workoutKcal = 0, baseKcal = BASE_KCAL, note = '' } = {}) {
  const sk = stepsKcal(steps);
  return {
    date: dateKey,
    steps: Math.round(steps || 0),
    baseKcal: Math.round(baseKcal),
    stepsKcal: sk,
    workoutKcal: Math.round(workoutKcal || 0),
    totalOutKcal: Math.round(baseKcal) + sk + Math.round(workoutKcal || 0),
    note,
  };
}

// A day's calories out, or null when nothing was logged for it.
export function totalOut(activity) {
  if (!activity) return null;
  if (Number.isFinite(activity.totalOutKcal)) return activity.totalOutKcal;
  return (activity.baseKcal ?? BASE_KCAL) + stepsKcal(activity.steps) + (activity.workoutKcal || 0);
}

// Averages over the 7 days ending on `key`, counting only days that have
// both meals and an activity doc — a day with one side missing would skew
// the balance. `kcalIn(dayKey)` returns that day's eaten total (0 = none).
export function weekAverage(activities, kcalIn, key) {
  let n = 0;
  let sumIn = 0;
  let sumOut = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = shiftKey(key, -i);
    const eaten = kcalIn(day);
    const out = totalOut(activities.find((a) => a.date === day));
    if (eaten > 0 && out !== null) {
      n += 1;
      sumIn += eaten;
      sumOut += out;
    }
  }
  if (!n) return null;
  return { days: n, in: Math.round(sumIn / n), out: Math.round(sumOut / n), balance: Math.round((sumIn - sumOut) / n) };
}
