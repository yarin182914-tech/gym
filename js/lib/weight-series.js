// One exercise's progress series, in a single unit. Pure — no DOM, no
// Firestore; tested by tools/test-weight-series.mjs.
//
// An exercise can be logged in kg in some workouts and in lb in others (a
// machine with a lb stack, feedback 2026-11-19 leg extension: 82 kg, then
// 195 lb). The graph used to plot the raw numbers and label them all with the
// first workout's unit, so 195 lb showed as a jump to "195 ק"ג". Every point is
// now converted to one display unit: the unit of the most recent workout, so
// the newest numbers read exactly as they were logged.
//
// Per side vs total is left as logged: the numbers stay what the user typed.

import { convertWeight, round1 } from './format.js';

const unitOf = (s) => (s?.weightUnit === 'lb' ? 'lb' : 'kg');
const weightIn = (s, unit) => convertWeight(Number(s?.weight) || 0, unitOf(s), unit);

// The heaviest single set in one workout's sets array, compared in kg so a
// workout that mixes kg and lb sets still picks the truly heaviest one.
export function heaviestSet(sets) {
  return (sets || []).reduce((best, s) => (!best || weightIn(s, 'kg') > weightIn(best, 'kg') ? s : best), null);
}

// history: getExerciseHistory()'s output, oldest first: [{ date, sets }].
// Returns one point per workout that has sets, every weight in `unit`.
export function buildExerciseSeries(history) {
  const withSets = (history || []).filter((point) => heaviestSet(point.sets));
  const unit = withSets.length ? unitOf(heaviestSet(withSets.at(-1).sets)) : 'kg';
  const points = withSets.map((point) => {
    const top = heaviestSet(point.sets);
    return {
      date: point.date,
      maxWeight: weightIn(top, unit),
      reps: top.reps,
      unit,
      mode: top.weightMode || 'total',
      volume: round1(point.sets.reduce((sum, s) => sum + weightIn(s, unit) * (Number(s.reps) || 0), 0)),
    };
  });
  return { unit, points };
}
