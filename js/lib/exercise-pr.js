// The "last time" popup of a strength exercise: its PR (best whole workout)
// and its most recent workout. Pure — no DOM, no Firestore; tested by
// tools/test-exercise-pr.mjs.
//
// Separate from the trophy (computePR in active-session.js), which answers a
// different question: is this one set, logged this way, a new best.
//
// The PR is the best whole workout. Workouts are ranked by weight only, never
// reps, compared set by set from the heaviest down: 80/80/80 beats 80/80/75
// even if the 75 set had more reps. A full tie goes to the newer workout, so
// a matched PR shows the same thing as last time.
//
// Two rules keep the PR from ever looking lower than last time (feedback
// 2026-11-07 deadlift, 2026-11-13 chest machine):
// - Only workouts logged the same way as the last one count: per side and
//   total are compared within their own kind, like the trophy does. An
//   exercise once logged "37.5 per side" and now "38.75 total" is the same
//   machine logged differently, not a 75 kg PR.
// - Warm-ups don't count toward a PR, except in a workout where every set is
//   a warm-up: an old bug saved whole workouts that way, and "last time"
//   still shows those sets.

import { convertWeight } from './format.js';

const modeOf = (s) => (s.weightMode === 'perSide' ? 'perSide' : 'total');

// kg, so a set logged in lb still compares fairly.
function weightKg(s) {
  return convertWeight(Number(s.weight) || 0, s.weightUnit || 'kg', 'kg');
}

// The sets that count toward a PR: no warm-ups, unless that is all there is.
function countedSets(sets) {
  const all = sets || [];
  const working = all.filter((s) => s.type !== 'warmup');
  return working.length ? working : all;
}

// A workout's counted set weights, heaviest first.
export function weightProfile(sets) {
  return countedSets(sets).map(weightKg).sort((a, b) => b - a);
}

// > 0 when profile a lifted more than b, 0 on an exact weight tie.
// Having an extra set at all beats not having it.
export function compareWeightProfiles(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1;
    const y = b[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

// The headline row: heaviest counted set, and among equally heavy sets the
// one with the most reps.
export function headlineSet(sets) {
  return countedSets(sets).reduce((top, s) => {
    if (!top) return s;
    const diff = weightKg(s) - weightKg(top);
    return diff > 0 || (diff === 0 && (Number(s.reps) || 0) > (Number(top.reps) || 0)) ? s : top;
  }, null);
}

// The way a workout was logged: the mode of its heaviest counted set.
function workoutMode(sets) {
  const top = headlineSet(sets);
  return top ? modeOf(top) : null;
}

function toPoint(date, sets, note = '') {
  const set = headlineSet(sets);
  return set ? { date, sets, note, set, profile: weightProfile(sets) } : null;
}

// The most recent workout. `previous` is { workoutDate, sets, note }.
export function findExerciseLast(previous) {
  if (!previous) return null;
  return toPoint(previous.workoutDate, previous.sets, previous.note);
}

// The best workout. `history` is [{ date, sets, note }], oldest first;
// `previous` is the most recent workout from a separate lookup (it may be
// missing from history), and it is never outranked by a workout logged the
// other way.
export function findExercisePR(history, previous) {
  const last = findExerciseLast(previous);
  const mode = last ? modeOf(last.set) : null;
  let best = null;
  for (const h of history || []) {
    if (mode && workoutMode(h.sets) !== mode) continue;
    const point = toPoint(h.date, h.sets, h.note);
    if (point && (!best || compareWeightProfiles(point.profile, best.profile) >= 0)) best = point;
  }
  if (last && (!best || compareWeightProfiles(last.profile, best.profile) >= 0)) best = last;
  return best;
}
