// Personal burn and targets from the "הגוף שלי" sheet (M16a,
// docs/specs/body-burn.md). Pure: no DOM, no Firestore.
//
// BMR is Mifflin-St Jeor. baseKcal (resting + daily life) is what every new
// dailyActivity doc starts from; steps and workouts are added on top of it.

import { ACTIVITY, BODY, NUTRITION } from './rules.js';

const SEXES = ['female', 'male'];

const roundTo = (n, step) => Math.round(n / step) * step;

// A number from a form field ('62,5' and ' 62.5 ' both work), or null.
export function parseNum(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Which answers are missing or outside BODY.limits: { weightKg, heightCm,
// age, sex } → a list of those keys (empty = all fine).
export function invalidFields({ weightKg, heightCm, age, sex } = {}) {
  const bad = [];
  const out = (n, [lo, hi]) => n === null || n < lo || n > hi;
  if (out(parseNum(weightKg), BODY.limits.weightKg)) bad.push('weightKg');
  if (out(parseNum(heightCm), BODY.limits.heightCm)) bad.push('heightCm');
  if (out(parseNum(age), BODY.limits.age)) bad.push('age');
  if (!SEXES.includes(sex)) bad.push('sex');
  return bad;
}

// Mifflin-St Jeor, kcal a day at rest, or null when an answer is missing.
export function bmr({ weightKg, heightCm, age, sex } = {}) {
  const w = parseNum(weightKg);
  const h = parseNum(heightCm);
  const a = parseNum(age);
  if (w === null || h === null || a === null || !SEXES.includes(sex)) return null;
  return 10 * w + 6.25 * h - 5 * a + (sex === 'male' ? 5 : -161);
}

// Everything the sheet saves, or null while the answers aren't all valid.
// `calorieDeficit` is the user's own (it stays as it is).
export function bodyTargets(answers, calorieDeficit = NUTRITION.defaults.calorieDeficit) {
  if (invalidFields(answers).length) return null;
  const b = bmr(answers);
  const deficit = Number.isFinite(calorieDeficit) ? calorieDeficit : NUTRITION.defaults.calorieDeficit;
  return {
    baseKcal: Math.round(b * BODY.baseFactor),
    calorieTarget: Math.max(0, roundTo(b * BODY.noBurnFactor, 50) - deficit),
    proteinTarget: roundTo(parseNum(answers.weightKg) * BODY.proteinPerKg, 5),
  };
}

// The `body` map stored on the user doc (age kept as a birth year so it
// doesn't go stale). `year` is the current year in Israel time.
export function bodyDoc({ weightKg, heightCm, age, sex }, year) {
  return {
    weightKg: Math.round(parseNum(weightKg) * 10) / 10,
    heightCm: Math.round(parseNum(heightCm)),
    birthYear: year - Math.round(parseNum(age)),
    sex,
  };
}

// The sheet's answers back from a stored `body` map ('' for anything missing).
export function answersFrom(body, year) {
  if (!body || typeof body !== 'object') return { weightKg: '', heightCm: '', age: '', sex: '' };
  return {
    weightKg: Number.isFinite(body.weightKg) ? body.weightKg : '',
    heightCm: Number.isFinite(body.heightCm) ? body.heightCm : '',
    age: Number.isFinite(body.birthYear) ? year - body.birthYear : '',
    sex: SEXES.includes(body.sex) ? body.sex : '',
  };
}

// The base burn a new dailyActivity doc starts from: the user's own, or
// the fixed default. `user` is the users/{uid} doc data (or null).
export function userBaseKcal(user) {
  const n = user?.baseKcal;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : ACTIVITY.baseKcal;
}

// Whether the Today card shows: a new account (created on or after
// BODY.cardFromDate) that hasn't filled the sheet and isn't snoozed.
// `createdKey` is the account's creation date 'yyyy-mm-dd' in Israel time;
// `snoozedAtMs` / `nowMs` are epoch milliseconds.
export function showBodyCard({ user, createdKey, snoozedAtMs = null, nowMs = Date.now() }) {
  if (!createdKey || createdKey < BODY.cardFromDate) return false;
  if (user?.body && Number.isFinite(user?.baseKcal)) return false;
  if (Number.isFinite(snoozedAtMs) && nowMs - snoozedAtMs < BODY.snoozeDays * 24 * 60 * 60 * 1000) return false;
  return true;
}

// A day's dailyActivity doc recomputed on a new base (only today's doc,
// when the user saves the sheet): its own steps and workout calories stay.
// Returns the fields to merge, or null to leave the doc alone — no doc, the
// same base already, or a totalOutKcal that wasn't base + steps + workout
// (written by hand or by the coach, so the app trusts it as-is).
export function rebaseActivity(activity, baseKcal) {
  if (!activity || !Number.isFinite(baseKcal)) return null;
  const oldBase = Number.isFinite(activity.baseKcal) ? activity.baseKcal : ACTIVITY.baseKcal;
  if (oldBase === baseKcal) return null;
  const stepsKcal = Number.isFinite(activity.stepsKcal) ? activity.stepsKcal : 0;
  const workoutKcal = Number.isFinite(activity.workoutKcal) ? activity.workoutKcal : 0;
  if (Number.isFinite(activity.totalOutKcal) && activity.totalOutKcal !== oldBase + stepsKcal + workoutKcal) return null;
  return { baseKcal, totalOutKcal: baseKcal + stepsKcal + workoutKcal };
}
