// Whether a live workout is open (js/lib/active-workout.js) — what the
// "אימון פעיל" pill and the app-icon badge follow. No libraries:
//   node tools/test-active-workout.mjs
// Exits non-zero if any case fails.

const { liveWorkout, hasLiveWorkout, isLiveSession } = await import('../js/lib/active-workout.js');

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

const store = (activeId, ...sessions) => JSON.stringify({ activeId, sessions });
const live = (id) => ({ id, live: true, editingWorkoutId: null, exercises: [] });
const past = (id) => ({ id, live: false, editingWorkoutId: null, exercises: [] });
const editing = (id) => ({ id, live: true, editingWorkoutId: 'w1', exercises: [] });

console.log('nothing stored');
check('null', hasLiveWorkout(null), false);
check('empty string', hasLiveWorkout(''), false);
check('broken JSON', hasLiveWorkout('{oops'), false);
check('not an object', hasLiveWorkout('42'), false);
check('no sessions field', hasLiveWorkout('{}'), false);
check('sessions not a list', hasLiveWorkout('{"sessions":{}}'), false);
check('empty list', hasLiveWorkout(store(null)), false);

console.log('which workouts count');
check('a live one', hasLiveWorkout(store('a', live('a'))), true);
check('a backdated one', hasLiveWorkout(store('a', past('a'))), false);
check('a saved one reopened for editing', hasLiveWorkout(store('a', editing('a'))), false);
check('live missing (old draft) is not live', isLiveSession({ id: 'a' }), false);
check('null entry ignored', hasLiveWorkout(JSON.stringify({ activeId: null, sessions: [null, live('b')] })), true);

console.log('which one to go back to');
check('the active one when it is live', liveWorkout(store('b', live('a'), live('b')))?.id, 'b');
check('the first live one when the active is backdated', liveWorkout(store('p', past('p'), live('a'), live('b')))?.id, 'a');
check('none live among several', liveWorkout(store('p', past('p'), editing('e'))), null);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
