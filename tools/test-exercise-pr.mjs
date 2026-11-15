// The "last time" popup's PR and last workout (js/lib/exercise-pr.js).
// No libraries:
//   node tools/test-exercise-pr.mjs
// Exits non-zero if any case fails.

const { findExercisePR, findExerciseLast, weightProfile } = await import('../js/lib/exercise-pr.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok    ${name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        got      ${a}`);
  }
}

const set = (weight, reps, type = 'working', weightMode = 'total', weightUnit = 'kg') => ({ weight, reps, type, weightMode, weightUnit });
const side = (weight, reps, type = 'working') => set(weight, reps, type, 'perSide');
const prDate = (history, previous) => findExercisePR(history, previous)?.date ?? null;

console.log('basic ranking');
{
  const history = [
    { date: 'a', sets: [set(80, 5), set(80, 5), set(75, 8)] },
    { date: 'b', sets: [set(80, 5), set(80, 5), set(80, 3)] },
    { date: 'c', sets: [set(70, 10)] },
  ];
  check('every set counts, not only the heaviest', prDate(history, null), 'b');
  check('last time ties the PR → the PR is last time', prDate(history, { workoutDate: 'd', sets: [set(80, 5), set(80, 5), set(80, 3)] }), 'd');
  check('last time below the PR keeps the PR', prDate(history, { workoutDate: 'd', sets: [set(70, 10)] }), 'b');
  check('no data → null', findExercisePR([], null), null);
  check('lb compares in kg', prDate([{ date: 'a', sets: [set(100, 5)] }, { date: 'b', sets: [set(200, 5, 'working', 'total', 'lb')] }], null), 'a');
}

console.log('warm-ups (feedback 2026-11-07, deadlift)');
{
  // An old bug saved whole workouts as warm-ups; "last time" still shows them.
  const history = [
    { date: '10-29', sets: [side(10, 10, 'warmup'), side(30, 8), side(30, 8), side(30, 8)] },
    { date: '11-04', sets: [side(10, 10, 'warmup'), side(31.25, 8, 'warmup'), side(31.25, 8, 'warmup'), side(31.25, 8, 'warmup')] },
  ];
  const previous = { workoutDate: '11-04', sets: history[1].sets };
  check('an all-warm-up workout counts all its sets', weightProfile(history[1].sets), [31.25, 31.25, 31.25, 10]);
  check('a normal workout skips its warm-ups', weightProfile(history[0].sets), [30, 30, 30]);
  check('the PR is not lower than last time', prDate(history, previous), '11-04');
  check('last time headline is a real set', findExerciseLast(previous).set.weight, 31.25);
  check('a heavy warm-up never beats working sets', prDate([
    { date: 'a', sets: [set(60, 5, 'warmup'), set(50, 5)] },
    { date: 'b', sets: [set(55, 5)] },
  ], null), 'b');
}

console.log('per side vs total (feedback 2026-11-13, chest machine)');
{
  // Logged "per side" until mid-October, then the same machine as a total.
  const history = [
    { date: '08-05', sets: [side(20, 8, 'warmup'), side(37.5, 6), side(37.5, 6), side(37.5, 6)] },
    { date: '10-11', sets: [side(25, 10), side(30, 8), side(33.75, 8)] },
    { date: '10-27', sets: [set(37.5, 6), set(37.5, 6), set(37.5, 6)] },
    { date: '11-09', sets: [set(37.5, 7), set(38.75, 7), set(38.75, 6), set(35, 6)] },
  ];
  const previous = { workoutDate: '11-09', sets: history[3].sets };
  check('only workouts logged like last time count', prDate(history, previous), '11-09');
  check('logged per side again → per-side workouts count', prDate(history, { workoutDate: '11-20', sets: [side(36, 6)] }), '08-05');
  check('older total-only history keeps its own best', prDate(history.slice(0, 3), { workoutDate: '10-27', sets: history[2].sets }), '10-27');
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
