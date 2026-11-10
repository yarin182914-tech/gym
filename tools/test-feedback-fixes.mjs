// Fixes from the feedback board (M3d): set types and exercise names.
//   node tools/test-feedback-fixes.mjs
const { typeAfter, typeFromLastTime } = await import('../js/lib/set-types.js');
const { normalizeExerciseName, sameExerciseName, findByName } = await import('../js/lib/exercise-names.js');

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  if (!ok) failed++;
}

console.log('set types');
check('after a warm-up → working', typeAfter('warmup'), 'working');
check('after working → working', typeAfter('working'), 'working');
check('after a drop-set stage → working', typeAfter('dropset'), 'working');
check('first set copies last time\'s warm-up', typeFromLastTime('warmup', []), 'warmup');
check('two leading warm-ups stay warm-ups', typeFromLastTime('warmup', [{ type: 'warmup' }]), 'warmup');
check('last time\'s bad warm-up after a working set → working', typeFromLastTime('warmup', [{ type: 'warmup' }, { type: 'working' }]), 'working');
check('no type last time → working', typeFromLastTime(undefined, []), 'working');

console.log('exercise names');
check('spaces collapse', normalizeExerciseName('  לחיצת   חזה '), 'לחיצת חזה');
check('same name ignoring spaces and case', sameExerciseName('Lat Pulldown ', 'lat  pulldown'), true);
check('different names', sameExerciseName('דדליפט', 'דדליפט רומני'), false);
const lib = [{ id: 'a', name: 'דדליפט' }, { id: 'b', name: 'כתף גומייה 90 מעלות' }];
check('finds an existing name', findByName(lib, ' דדליפט')?.id, 'a');
check('renaming an entry to its own name is fine', findByName(lib, 'דדליפט', 'a'), null);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
