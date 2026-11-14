// The top of "היום" (M4c2), worked out from what the app already stores:
// the three rings, the level card's streak, and the greeting. Pure — no
// DOM, no Firestore — so tools/test-today-rings.mjs runs it in Node.
// Numbers: TODAY in js/lib/rules.js.

import { TODAY } from './rules.js';
import { weekStart } from './habits.js';
import { shiftDays, dateKey } from './sleep.js';
import { workoutDayKey } from './workout-types.js';
import { calorieTargetOf } from './daily-activity.js';
import { toDate } from './format.js';

const ring = (value, target, empty) => ({
  value,
  target,
  fraction: target > 0 ? Math.max(0, Math.min(1, value / target)) : 0,
  empty,
});

// → { train, food, sleep }, each { value, target, fraction 0–1, empty }.
//   train: workout days this week (its first day → today) of the weekly goal
//   food:  calories eaten today of the day's own target
//   sleep: last night's minutes of the minimum
// `empty` means nothing was logged for it yet: the screen draws that ring
// grey. Over the target is a full ring, nothing else.
//
// workouts, meals: any range, any order. activity: today's dailyActivity
// doc, or null. night: the sleep doc whose date is today, or null.
export function todayRings({ today, workouts = [], workoutGoal, meals = [], activity = null, goals, night = null, sleepTargetMin }) {
  const trainedDays = new Set(workouts.map(workoutDayKey));
  let trained = 0;
  for (let k = weekStart(today); k <= today; k = shiftDays(k, 1)) if (trainedDays.has(k)) trained += 1;

  const todays = meals.filter((m) => dateKey(toDate(m.date)) === today);
  const eaten = Math.round(todays.reduce((sum, m) => sum + (Number(m.calories) || 0), 0));

  let slept = 0;
  if (night) slept = Number(night.durationMin) || Math.round((toDate(night.wakeTime) - toDate(night.bedtime)) / 60000) || 0;

  return {
    train: ring(trained, workoutGoal, trained === 0),
    food: ring(eaten, calorieTargetOf(activity, goals), todays.length === 0),
    sleep: ring(slept, sleepTargetMin, !night),
  };
}

// Days in a row with points, ending today — or yesterday while today has
// none yet, so the streak doesn't vanish at midnight. byDay: Map of
// 'yyyy-mm-dd' → points (rewardsSummary().byDay).
export function pointsStreak(byDay, today) {
  const scored = (key) => (byDay?.get(key) || 0) > 0;
  let key = scored(today) ? today : shiftDays(today, -1);
  let count = 0;
  while (scored(key)) {
    count += 1;
    key = shiftDays(key, -1);
  }
  return count;
}

// "בוקר טוב" … "לילה טוב" for an hour of the day (0–23).
export function greeting(hour) {
  const h = TODAY.greetingHours;
  if (hour >= h.night || hour < h.morning) return 'לילה טוב';
  if (hour < h.noon) return 'בוקר טוב';
  if (hour < h.evening) return 'צהריים טובים';
  return 'ערב טוב';
}

// "ירין" from "ירין כהן"; '' when there is no name.
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// "יום שבת · 14 בנובמבר".
export function shortDate(date) {
  const part = (options) => new Intl.DateTimeFormat('he-IL', options).format(date);
  return `${part({ weekday: 'long' })} · ${part({ day: 'numeric', month: 'long' })}`;
}
