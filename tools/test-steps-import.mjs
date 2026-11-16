// The steps import from the iPhone (js/lib/steps-import.js) and how the
// "צעדים" habit reads it. No libraries:
//   node tools/test-steps-import.mjs
// Exits non-zero if any case fails.
//
// Dates: "today" is 2026-11-09 (Monday) unless a case says otherwise.

process.env.TZ = 'Asia/Jerusalem';

const { parseImport, parseStepsBody, mergeSteps, israelDateKey } = await import('../js/lib/steps-import.js');
const { normalizeHabit, habitContext, entryFor, EXAMPLE_HABITS } = await import('../js/lib/habits.js');
const { ACTIVITY, STEPS_IMPORT } = await import('../js/lib/rules.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        got      ${a}`);
  }
}

const TODAY = '2026-11-09';
const parse = (q) => parseImport(q, TODAY);

console.log('parsing the shortcut URL');
check('steps only → today', parse('steps=12450'), { steps: 12450, date: TODAY });
check('leading ? is fine', parse('?steps=8000&date=2026-11-08'), { steps: 8000, date: '2026-11-08' });
check('thousands separator', parse('steps=12,450'), { steps: 12450, date: TODAY });
check('zero steps is valid', parse('steps=0'), { steps: 0, date: TODAY });
check('the maximum is allowed', parse(`steps=${STEPS_IMPORT.maxSteps}`), { steps: STEPS_IMPORT.maxSteps, date: TODAY });
check('over the maximum', parse(`steps=${STEPS_IMPORT.maxSteps + 1}`), { error: 'steps' });
check('missing steps', parse('date=2026-11-09'), { error: 'steps' });
check('negative steps', parse('steps=-5'), { error: 'steps' });
check('decimal steps', parse('steps=12.5'), { error: 'steps' });
check('text steps', parse('steps=abc'), { error: 'steps' });
check('URLSearchParams input', parseImport(new URLSearchParams('steps=900'), TODAY), { steps: 900, date: TODAY });
check(`${STEPS_IMPORT.maxDaysBack} days back is allowed`, parse('steps=1&date=2026-11-02'), { steps: 1, date: '2026-11-02' });
check(`${STEPS_IMPORT.maxDaysBack + 1} days back is not`, parse('steps=1&date=2026-11-01'), { error: 'date' });
check('tomorrow is never allowed', parse('steps=1&date=2026-11-10'), { error: 'date' });
check('not a real date', parse('steps=1&date=2026-02-31'), { error: 'date' });
check('wrong date format', parse('steps=1&date=9.11.2026'), { error: 'date' });
check('across a month boundary', parseImport('steps=1&date=2026-10-31', '2026-11-03'), { steps: 1, date: '2026-10-31' });

console.log('Israel date');
// November: Israel is UTC+2. 22:30 UTC is already 00:30 the next day there.
check('just after midnight in Israel', israelDateKey(new Date('2026-11-09T22:30:00Z')), '2026-11-10');
check('evening in Israel', israelDateKey(new Date('2026-11-09T19:00:00Z')), '2026-11-09');
// Summer: UTC+3.
check('summer time', israelDateKey(new Date('2026-07-01T21:30:00Z')), '2026-07-02');

console.log('merging into dailyActivity');
const base = ACTIVITY.baseKcal;
const kcal = (steps) => Math.round(steps * ACTIVITY.kcalPerStep);
check('new day → full doc with defaults', mergeSteps(null, 10000), {
  steps: 10000, stepsKcal: kcal(10000), baseKcal: base, workoutKcal: 0,
  totalOutKcal: base + kcal(10000), source: 'shortcut', note: '',
});
const coachDay = { steps: 4000, stepsKcal: 160, baseKcal: 1800, workoutKcal: 310, totalOutKcal: 2270, note: 'גב', source: 'coach' };
check('keeps the day\'s base and workout', mergeSteps(coachDay, 9000), {
  steps: 9000, stepsKcal: kcal(9000), baseKcal: 1800, workoutKcal: 310,
  totalOutKcal: 1800 + kcal(9000) + 310, source: 'shortcut',
});
check('legacy doc with only totalOutKcal keeps its workout part',
  mergeSteps({ steps: 5000, totalOutKcal: ACTIVITY.baseKcal + 5000 * ACTIVITY.kcalPerStep + 300 }, 10000).workoutKcal, 300);
check('a lower number never overwrites', mergeSteps({ steps: 12000 }, 6000), null);
check('the same number writes nothing', mergeSteps({ steps: 12000 }, 12000), null);
check('zero on a new day writes nothing', mergeSteps(null, 0), null);
const once = { ...coachDay, ...mergeSteps(coachDay, 9000) };
check('same URL twice = same result', mergeSteps(once, 9000), null);

console.log('\nthe body of POST /api/steps (one day, or today and yesterday)');
const body = (b) => parseStepsBody(b, TODAY);
check('one number, no date → today', body({ steps: 12450 }), { days: [{ steps: 12450, date: TODAY }] });
check('one number as text with a decimal', body({ steps: '9,750.6', date: '2026-11-05' }), { days: [{ steps: 9750, date: '2026-11-05' }] });
check('one day still allows a week back', body({ steps: 100, date: '2026-11-02' }), { days: [{ steps: 100, date: '2026-11-02' }] });
check('one day, too far back', body({ steps: 100, date: '2026-11-01' }), { error: 'date' });
check('missing steps', body({}), { error: 'steps' });
check('lines of text: today and yesterday', body({ steps: '4210\n9750', date: '2026-11-09\n2026-11-08' }),
  { days: [{ date: TODAY, steps: 4210 }, { date: '2026-11-08', steps: 9750 }] });
check('Windows line ends and separators', body({ steps: '9,750\r\n4,210', date: '2026-11-08\r\n2026-11-09' }),
  { days: [{ date: TODAY, steps: 4210 }, { date: '2026-11-08', steps: 9750 }] });
check('JSON arrays', body({ steps: [9750.4, 4210], date: ['2026-11-08', '2026-11-09'] }),
  { days: [{ date: TODAY, steps: 4210 }, { date: '2026-11-08', steps: 9750 }] });
check('dates split by commas', body({ steps: '9750\n4210', date: '2026-11-08, 2026-11-09' }),
  { days: [{ date: TODAY, steps: 4210 }, { date: '2026-11-08', steps: 9750 }] });
check('a partial older day is dropped', body({ steps: '300\n9750\n4210', date: '2026-11-07\n2026-11-08\n2026-11-09' }),
  { days: [{ date: TODAY, steps: 4210 }, { date: '2026-11-08', steps: 9750 }] });
check('a whole week: only today and yesterday', body({ steps: '1\n2\n3\n4\n5\n6\n7', date: '2026-11-03\n2026-11-04\n2026-11-05\n2026-11-06\n2026-11-07\n2026-11-08\n2026-11-09' }),
  { days: [{ date: TODAY, steps: 7 }, { date: '2026-11-08', steps: 6 }] });
check('ungrouped samples of a day add up', body({ steps: '1000\n2000\n500', date: '2026-11-09\n2026-11-09\n2026-11-08' }),
  { days: [{ date: TODAY, steps: 3000 }, { date: '2026-11-08', steps: 500 }] });
check('only old days → nothing to save', body({ steps: '1\n2', date: '2026-11-01\n2026-11-02' }), { error: 'date' });
check('counts that don\'t match', body({ steps: '4210\n9750', date: TODAY }), { error: 'date' });
check('a future day in a list', body({ steps: '1\n2', date: '2026-11-09\n2026-11-10' }), { error: 'date' });
check('a bad number in a list', body({ steps: '4210\nabc', date: '2026-11-09\n2026-11-08' }), { error: 'steps' });

console.log('the "צעדים" habit picks the import up');
const stepsHabit = normalizeHabit({ id: 'h-steps', ...EXAMPLE_HABITS.find((h) => h.unit === 'צעדים') });
const dayAfter = (activities, logs = []) => entryFor(stepsHabit, TODAY, habitContext(logs, activities));
check('nothing before the import', dayAfter([]), null);
const imported = (n) => ({ date: TODAY, ...mergeSteps(null, n) });
check('full target reached → full, no tap', dayAfter([imported(12450)]), { level: 'full', value: 12450, auto: true });
check('short target reached → short', dayAfter([imported(6000)]), { level: 'short', value: 6000, auto: true });
check('under both → none, still shown', dayAfter([imported(3000)]), { level: 'none', value: 3000, auto: true });
check('a manual mark still wins', dayAfter([imported(12450)], [{ date: TODAY, habits: { 'h-steps': { level: 'short' } } }]),
  { level: 'short', value: null, auto: false });

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
