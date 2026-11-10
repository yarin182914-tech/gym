// Workout burn: kcal = MET × body kg × hours (numbers in WORKOUTS,
// js/lib/rules.js). Each saved workout keeps its own `kcal`; the app sums a
// day's workouts into dailyActivity.workoutKcal — the only writer of that
// field (docs/DATA.md).
//
// No double counting: an outdoor walk or run is already in the phone's
// steps, so it adds 0 here. Treadmill, bike, stairs, sessions and strength
// count.

import { WORKOUTS, ACTIVITY } from './rules.js';
import { segmentMetrics, summarizeSegments, hasInputModes } from './cardio.js';
import { toDate } from './format.js';
import { stepsKcal, buildActivity } from './daily-activity.js';
import { exerciseKind, isCustomType, workoutDayKey } from './workout-types.js';

const hours = (sec) => (Number(sec) > 0 ? Number(sec) / 3600 : 0);

// The latest weigh-in on or before the day; weights newest first, as
// listBodyWeights() returns them.
export function bodyKgOn(weights, dateKey) {
  const w = (weights || []).find((x) => x.date <= dateKey && Number(x.kg) > 0);
  return w ? Number(w.kg) : WORKOUTS.defaultBodyKg;
}

export function rpeFactor(rpe) {
  const r = Number(rpe) >= 1 ? Math.min(10, Math.round(Number(rpe))) : WORKOUTS.defaultRpe;
  return WORKOUTS.rpeFactor.base + WORKOUTS.rpeFactor.perPoint * r;
}

export function sessionMet(ex) {
  const base = isCustomType(ex.typeId) ? WORKOUTS.customMet : (WORKOUTS.sessionMet[ex.typeId] ?? WORKOUTS.customMet);
  return base * rpeFactor(ex.rpe);
}

export function sessionKcal(ex, kg) {
  return sessionMet(ex) * kg * hours(ex.durationSec);
}

// An outdoor walk/run (or one logged before input modes existed).
export const isOutdoorWalkRun = (ex) => hasInputModes(ex.activity) && ex.inputMode !== 'treadmill';

// ACSM: walking VO2 = 0.1·S + 1.8·S·G + 3.5, running 0.2·S + 0.9·S·G + 3.5
// (S in m/min, G the incline as a fraction); MET = VO2 / 3.5.
export function segmentMet(activity, seg) {
  const table = WORKOUTS.cardioMet[activity];
  if (typeof table === 'number') return table;
  const speed = segmentMetrics(seg).speedKmh;
  if (speed) {
    const s = (speed * 1000) / 60;
    const g = (Number(seg.inclinePct) || 0) / 100;
    const vo2 = activity === 'run' ? 0.2 * s + 0.9 * s * g + 3.5 : 0.1 * s + 1.8 * s * g + 3.5;
    return vo2 / 3.5;
  }
  return table?.[seg.effort] ?? table?.moderate ?? 0;
}

export function cardioKcal(ex, kg) {
  if (isOutdoorWalkRun(ex)) return WORKOUTS.freeWalkRunKcal;
  return (ex.sets || []).reduce((sum, seg) => sum + segmentMet(ex.activity, seg) * kg * hours(segmentMetrics(seg).durationSec), 0);
}

// Strength time: the workout's length minus its cardio and sessions; with
// no time of day (or no end) the length isn't real, so minutes per set.
export function strengthMinutes(w) {
  const strength = (w.exercises || []).filter((ex) => exerciseKind(ex) === 'strength');
  const sets = strength.reduce((n, ex) => n + (ex.sets || []).length, 0);
  if (!sets) return 0;
  const start = w.startTime ? toDate(w.startTime) : null;
  const end = w.endTime ? toDate(w.endTime) : null;
  let min = null;
  if (!w.noTime && start && end && end > start) {
    const otherSec = (w.exercises || []).reduce((n, ex) => {
      if (exerciseKind(ex) === 'cardio') return n + summarizeSegments(ex.sets).durationSec;
      if (exerciseKind(ex) === 'session') return n + (Number(ex.durationSec) || 0);
      return n;
    }, 0);
    min = ((end - start) / 1000 - otherSec) / 60;
  }
  if (!(min > 0)) min = sets * WORKOUTS.strengthMinPerSet;
  return Math.min(min, WORKOUTS.strengthMaxMin);
}

// The whole workout, rounded.
export function workoutKcal(w, kg) {
  let total = WORKOUTS.strengthMet * kg * (strengthMinutes(w) / 60);
  for (const ex of w.exercises || []) {
    const kind = exerciseKind(ex);
    if (kind === 'cardio') total += cardioKcal(ex, kg);
    else if (kind === 'session') total += sessionKcal(ex, kg);
  }
  return Math.round(total);
}

// Every workout on that day: its saved kcal, or (one saved before M3b)
// worked out now. weights: newest first.
export function dayWorkoutKcal(workouts, dateKey, weights) {
  return (workouts || [])
    .filter((w) => workoutDayKey(w) === dateKey)
    .reduce((sum, w) => sum + (Number.isFinite(w.kcal) ? w.kcal : workoutKcal(w, bodyKgOn(weights, dateKey))), 0);
}

// What to write to dailyActivity/{dateKey}: { merge: fields } for an
// existing doc (steps, base and note stay), { set: doc } for a new day, or
// null when nothing changes — including no doc and no burn.
export function workoutKcalPatch(dateKey, existing, kcal) {
  const workoutKcal = Math.round(kcal || 0);
  if (!existing) {
    if (!workoutKcal) return null;
    return { set: { ...buildActivity(dateKey, { workoutKcal }), source: 'workouts' } };
  }
  const baseKcal = Number.isFinite(existing.baseKcal) ? existing.baseKcal : ACTIVITY.baseKcal;
  const sk = Number.isFinite(existing.stepsKcal) ? existing.stepsKcal : stepsKcal(existing.steps);
  const totalOutKcal = baseKcal + sk + workoutKcal;
  if (existing.workoutKcal === workoutKcal && existing.totalOutKcal === totalOutKcal) return null;
  return { merge: { workoutKcal, totalOutKcal } };
}
