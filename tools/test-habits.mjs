// Edge cases for the habit rules (js/lib/habits.js). No libraries:
//   node tools/test-habits.mjs
// Exits non-zero if any case fails. Runs in Israel time, like the app.
//
// Dates: 2026-11-09 is a Monday. Weeks run Sunday → Saturday, so
// Sun 11-08 starts "this week" and Sat 11-07 ends the week before.

process.env.TZ = 'Asia/Jerusalem';

const {
  normalizeHabit, levelFor, habitContext, entryFor, isDue, isOpenToday, weekStart, weekCount, habitStreak,
} = await import('../js/lib/habits.js');

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

const TODAY = '2026-11-09'; // Monday

// logs: { 'yyyy-mm-dd': level } for one habit id 'h'.
function ctxOf(levels = {}, steps = {}) {
  const logs = Object.entries(levels).map(([date, level]) => ({ date, habits: { h: { level, value: null } } }));
  const acts = Object.entries(steps).map(([date, n]) => ({ date, steps: n }));
  return habitContext(logs, acts);
}

const daily = normalizeHabit({ id: 'h', name: 'קריאה', schedule: { type: 'daily' }, measure: 'quantity', unit: 'דקות', full: 10, short: 5 });
const limit = normalizeHabit({ id: 'h', schedule: { type: 'daily' }, measure: 'limit', full: 60, short: 75 });
const twiceAWeek = normalizeHabit({ id: 'h', schedule: { type: 'weekly', perWeek: 2 }, measure: 'yesno' });
const monWed = normalizeHabit({ id: 'h', schedule: { type: 'days', days: [1, 3] }, measure: 'yesno' });
const steps = normalizeHabit({ id: 'h', schedule: { type: 'daily' }, measure: 'quantity', unit: 'צעדים', full: 8000, short: 5000, autoSource: 'dailyActivity.steps' });

console.log('levels');
check('quantity: full target', levelFor(daily, 10), 'full');
check('quantity: between short and full', levelFor(daily, 7), 'short');
check('quantity: under short', levelFor(daily, 3), 'none');
check('limit: at the limit', levelFor(limit, 60), 'full');
check('limit: within the short limit', levelFor(limit, 70), 'short');
check('limit: over both', levelFor(limit, 90), 'none');

console.log('normalize');
check('missing fields get safe defaults', (({ schedule, measure, active, autoSource }) => ({ schedule, measure, active, autoSource }))(normalizeHabit({ name: 'x' })),
  { schedule: { type: 'daily' }, measure: 'yesno', active: true, autoSource: null });
check('empty fixed-days list falls back to daily', normalizeHabit({ schedule: { type: 'days', days: [] } }).schedule, { type: 'daily' });
check('perWeek out of range falls back to 3', normalizeHabit({ schedule: { type: 'weekly', perWeek: 12 } }).schedule, { type: 'weekly', perWeek: 3 });

console.log('auto steps');
check('steps read from dailyActivity', entryFor(steps, TODAY, ctxOf({}, { [TODAY]: 9100 })), { level: 'full', value: 9100, auto: true });
check('short from steps', entryFor(steps, TODAY, ctxOf({}, { [TODAY]: 6000 })).level, 'short');
check('0 steps = unknown, no entry', entryFor(steps, TODAY, ctxOf({}, { [TODAY]: 0 })), null);
check('manual mark overrides the steps', entryFor(steps, TODAY, ctxOf({ [TODAY]: 'short' }, { [TODAY]: 9100 })), { level: 'short', value: null, auto: false });
check('non-auto habit ignores steps', entryFor(daily, TODAY, ctxOf({}, { [TODAY]: 9100 })), null);
check('auto steps keep a streak', habitStreak(steps, TODAY, ctxOf({}, { '2026-11-07': 8000, '2026-11-08': 5200 })), { count: 2, unit: 'days' });

console.log('daily streak');
check('nothing logged', habitStreak(daily, TODAY, ctxOf()), { count: 0, unit: 'days' });
check('today still open: counts from yesterday', habitStreak(daily, TODAY, ctxOf({ '2026-11-07': 'full', '2026-11-08': 'short' })), { count: 2, unit: 'days' });
check('today done adds one', habitStreak(daily, TODAY, ctxOf({ '2026-11-07': 'full', '2026-11-08': 'full', [TODAY]: 'full' })), { count: 3, unit: 'days' });
check('runs across the Sat → Sun week boundary', habitStreak(daily, TODAY, ctxOf({ '2026-11-06': 'full', '2026-11-07': 'full', '2026-11-08': 'full' })), { count: 3, unit: 'days' });
check('a gap breaks it', habitStreak(daily, TODAY, ctxOf({ '2026-11-06': 'full', '2026-11-08': 'full' })), { count: 1, unit: 'days' });
check('"none" breaks it', habitStreak(daily, TODAY, ctxOf({ '2026-11-07': 'full', '2026-11-08': 'none' })), { count: 0, unit: 'days' });

console.log('fixed weekdays (Mon + Wed)');
check('Monday is due', isDue(monWed, TODAY), true);
check('Tuesday is not', isDue(monWed, '2026-11-10'), false);
check('off days are skipped, not broken', habitStreak(monWed, TODAY, ctxOf({ '2026-11-02': 'full', '2026-11-04': 'full' })), { count: 2, unit: 'days' });
check('on an off day, streak still stands', habitStreak(monWed, '2026-11-10', ctxOf({ '2026-11-04': 'full', [TODAY]: 'full' })), { count: 2, unit: 'days' });
check('missed Wednesday breaks it', habitStreak(monWed, TODAY, ctxOf({ '2026-11-02': 'full' })), { count: 0, unit: 'days' });

console.log('N per week (2)');
check('week starts on Sunday', weekStart(TODAY), '2026-11-08');
check('Saturday is the end of the week before', weekStart('2026-11-07'), '2026-11-01');
const twoWeeksMet = { '2026-11-01': 'full', '2026-11-05': 'short', '2026-10-27': 'full', '2026-10-29': 'full' };
check('count in last week', weekCount(twiceAWeek, '2026-11-03', ctxOf(twoWeeksMet)), 2);
check('current week not met yet doesn\'t break', habitStreak(twiceAWeek, TODAY, ctxOf(twoWeeksMet)), { count: 2, unit: 'weeks' });
check('one this week: still 2', habitStreak(twiceAWeek, TODAY, ctxOf({ ...twoWeeksMet, '2026-11-08': 'full' })), { count: 2, unit: 'weeks' });
check('second this week: 3', habitStreak(twiceAWeek, TODAY, ctxOf({ ...twoWeeksMet, '2026-11-08': 'full', [TODAY]: 'full' })), { count: 3, unit: 'weeks' });
check('a week under target breaks it', habitStreak(twiceAWeek, TODAY, ctxOf({ '2026-11-01': 'full', '2026-10-27': 'full', '2026-10-29': 'full' })), { count: 0, unit: 'weeks' });
check('open today while under target', isOpenToday(twiceAWeek, TODAY, ctxOf({ '2026-11-08': 'full' })), true);
check('not open once the week is met', isOpenToday(twiceAWeek, '2026-11-10', ctxOf({ '2026-11-08': 'full', [TODAY]: 'full' })), false);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
