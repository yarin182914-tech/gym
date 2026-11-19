// One exercise's progress series in a single unit (js/lib/weight-series.js).
// No libraries:
//   node tools/test-weight-series.mjs
// Exits non-zero if any case fails.

const { heaviestSet, buildExerciseSeries } = await import('../js/lib/weight-series.js');

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

const set = (weight, reps, weightUnit = 'kg', weightMode = 'total') => ({ weight, reps, weightUnit, weightMode, type: 'working' });

console.log('heaviest set');
check('no sets → null', heaviestSet(undefined), null);
check('compares in kg, not raw numbers', heaviestSet([set(100, 5, 'lb'), set(50, 5, 'kg')]).weight, 50);
check('lb set heavier than kg set', heaviestSet([set(200, 5, 'lb'), set(82, 5, 'kg')]).weight, 200);
check('missing unit means kg', heaviestSet([{ weight: 40, reps: 5 }, set(80, 5, 'lb')]).weight, 40);

console.log('leg extension: kg, then lb (feedback 2026-11-19)');
{
  const history = [
    { date: 'a', sets: [set(77, 10), set(77, 10)] },
    { date: 'b', sets: [set(82, 10), set(82, 10)] },
    { date: 'c', sets: [set(195, 10, 'lb'), set(195, 10, 'lb')] },
    { date: 'd', sets: [set(200, 10, 'lb'), set(205, 10, 'lb')] },
  ];
  const { unit, points } = buildExerciseSeries(history);
  check('display unit is the latest workout\'s', unit, 'lb');
  check('every point in that unit', points.map((p) => p.unit), ['lb', 'lb', 'lb', 'lb']);
  check('kg points converted, lb kept as logged', points.map((p) => p.maxWeight), [169.8, 180.8, 195, 205]);
  check('no 2x jump between kg and lb days', points[2].maxWeight / points[1].maxWeight < 1.2, true);
  check('volume in the same unit', points[0].volume, 3396);
}

console.log('back to kg');
{
  const { unit, points } = buildExerciseSeries([
    { date: 'a', sets: [set(220, 8, 'lb')] },
    { date: 'b', sets: [set(100, 8)] },
  ]);
  check('unit follows the latest workout', unit, 'kg');
  check('old lb point converted to kg', points.map((p) => p.maxWeight), [99.8, 100]);
}

console.log('edge cases');
check('empty history', buildExerciseSeries([]), { unit: 'kg', points: [] });
check('workouts with no sets are skipped', buildExerciseSeries([{ date: 'a', sets: [] }, { date: 'b', sets: [set(10, 5)] }]).points.map((p) => p.date), ['b']);
check('per side kept as logged', buildExerciseSeries([{ date: 'a', sets: [set(18, 8, 'kg', 'perSide')] }]).points[0], { date: 'a', maxWeight: 18, reps: 8, unit: 'kg', mode: 'perSide', volume: 144 });

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
