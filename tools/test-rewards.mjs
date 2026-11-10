// Points, levels and badges (js/lib/rewards.js). No libraries:
//   node tools/test-rewards.mjs
// Exits non-zero if any case fails.
//
// Dates: 2026-11-10 is a Tuesday (its night started Monday evening).
// 2026-11-13 is a Friday: its night started Thursday — a flexible night by
// default. Weeks run Sunday → Saturday: 2026-11-08 … 2026-11-14.

process.env.TZ = 'Asia/Jerusalem';

const R = await import('../js/lib/rewards.js');
const { REWARDS, NUTRITION } = await import('../js/lib/rules.js');
const { buildNight } = await import('../js/lib/sleep.js');
const { normalizeHabit } = await import('../js/lib/habits.js');

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

const at = (s) => new Date(s);
const meal = (id, day, hh, calories, proteinG) => ({ id, date: at(`${day}T${hh}:00:00`), calories, proteinG });
const reading = { id: 'h1', name: 'קריאה', schedule: { type: 'daily' }, measure: 'yesno', full: null, short: null };
const gym3 = { id: 'h2', name: 'מתיחות', schedule: { type: 'weekly', perWeek: 2 }, measure: 'yesno' };
const habits = [reading, gym3].map(normalizeHabit);
const bench = (id, day, weight) => ({
  id, date: at(`${day}T18:00:00`), startTime: at(`${day}T18:00:00`), endTime: at(`${day}T19:00:00`),
  exercises: [{ name: 'לחיצת חזה', sets: [{ weight, reps: 5, weightMode: 'total', weightUnit: 'kg' }] }],
});

// A full good Tuesday: on-time night, both habits, two meals on target,
// a weigh-in, a workout. Burn 2600 − 250 deficit → target 2350.
const data = {
  userDoc: {},
  nights: [buildNight('2026-11-10', '22:20', '06:40'), buildNight('2026-11-13', '00:30', '08:40')],
  habits,
  logs: [{ date: '2026-11-10', habits: { h1: { level: 'full' }, h2: { level: 'full' } } },
    { date: '2026-11-09', habits: { h2: { level: 'short' } } }],
  activities: [{ date: '2026-11-10', baseKcal: 1950, stepsKcal: 400, workoutKcal: 250, totalOutKcal: 2600 }],
  meals: [meal('m1', '2026-11-10', '13', 1100, 70), meal('m2', '2026-11-10', '20', 1100, 60)],
  weights: [{ date: '2026-11-10', kg: 80 }],
  workouts: [bench('w1', '2026-11-03', 60), bench('w2', '2026-11-10', 65)],
  plans: [],
};
const ctx = R.buildContext(data);
const rulesOf = (awards) => awards.map((a) => `${a.rule}:${a.raw}`);

console.log('settings');
check('protein target default is 120', R.nutritionGoals({}).proteinTarget, 120);
check('it lives in rules.js', NUTRITION.defaults.proteinTarget, 120);
check('a saved goal wins', R.nutritionGoals({ proteinTarget: 150 }).proteinTarget, 150);
check('weekly workout goal default 3', R.weeklyWorkoutGoal({}), 3);

console.log('a full day');
const open = R.scoreDay('2026-11-10', ctx, { closed: false });
check('while the day is open: no day-close items', rulesOf(open), [
  'sleep-bedtime:20', 'sleep-duration:15', 'habit:10', 'habit:10', 'habit-week:20',
  'meal-log:5', 'meal-log:5', 'weigh-in:5', 'workout:30', 'pr:20',
]);
const closed = R.scoreDay('2026-11-10', ctx, { closed: true });
check('closed: calories, protein, meal count and the perfect day', rulesOf(closed).slice(-4), ['calories:30', 'protein:10', 'meal-count:10', 'perfect-day:30']);
check('weekly habit bonus id is per week', closed.find((a) => a.rule === 'habit-week').id, '2026-11-08_habit-week_h2');
check('ids are fixed', closed.find((a) => a.rule === 'meal-log').id, '2026-11-10_meal-log_m1');

console.log('sleep');
const fri = R.scoreDay('2026-11-13', ctx, { closed: false });
check('flexible night: bedtime free (full points), duration judged', fri.map((a) => [a.rule, a.raw, a.grade]), [['sleep-bedtime', 20, 'free'], ['sleep-duration', 15, 'full']]);
const late = R.buildContext({ ...data, nights: [buildNight('2026-11-10', '22:50', '06:30')] });
check('close bedtime 10, close duration 8', R.scoreDay('2026-11-10', late, { closed: false }).filter((a) => a.source === 'sleep').map((a) => a.raw), [10, 8]);
const short = R.buildContext({ ...data, nights: [buildNight('2026-11-10', '22:00', '03:30')] });
check('under 6 hours: no duration points', R.scoreDay('2026-11-10', short, { closed: false }).filter((a) => a.rule === 'sleep-duration'), []);

console.log('nutrition at day close');
const day = (meals, activities = data.activities) => R.nutritionGrades('2026-11-10', R.buildContext({ ...data, meals, activities }));
check('at target → full', day([meal('a', '2026-11-10', '13', 2300, 130)]).calories, 'full');
check('up to 10% over → close', day([meal('a', '2026-11-10', '13', 2500, 130)]).calories, 'close');
check('more than 10% over → miss', day([meal('a', '2026-11-10', '13', 2700, 130)]).calories, 'miss');
check('deficit over 1000 → miss', day([meal('a', '2026-11-10', '13', 1500, 130)]).calories, 'miss');
check('no burn logged: calorieTarget (2000)', day([meal('a', '2026-11-10', '13', 1900, 130)], []).calories, 'full');
check('protein over 80% → close', day([meal('a', '2026-11-10', '13', 2300, 100)]).protein, 'close');
check('3 meals → close, 4 → miss', [3, 4].map((n) => day(Array.from({ length: n }, (_, i) => meal(`x${i}`, '2026-11-10', String(10 + i), 500, 30))).mealCount), ['close', 'miss']);
check('no meals → nothing judged', day([]), null);
check('only 2 meals score the logging 5', R.scoreDay('2026-11-10', R.buildContext({ ...data, meals: ['a', 'b', 'c'].map((id, i) => meal(id, '2026-11-10', String(12 + i), 700, 40)) }), { closed: false }).filter((a) => a.rule === 'meal-log').length, 2);

console.log('perfect day');
const perfect = (patch) => R.scoreDay('2026-11-10', R.buildContext({ ...data, ...patch }), { closed: true }).some((a) => a.rule === 'perfect-day');
check('rest day, no plan → still perfect', perfect({ workouts: [] }), true);
check('planned workout not done → not perfect', perfect({ workouts: [], plans: [{ date: '2026-11-10', status: 'proposed' }] }), false);
check('plan marked "לא היום" → no workout needed', perfect({ workouts: [], plans: [{ date: '2026-11-10', status: 'skipped' }] }), true);
check('a daily habit undone → not perfect', perfect({ logs: [{ date: '2026-11-10', habits: { h2: { level: 'full' } } }] }), false);
check('the N-per-week habit undone doesn\'t block it', perfect({ logs: [{ date: '2026-11-10', habits: { h1: { level: 'full' } } }] }), true);
check('close sleep → not perfect', perfect({ nights: [buildNight('2026-11-10', '22:50', '07:00')] }), false);
check('the rule is in rules.js', Object.keys(REWARDS.perfectDay.needs), ['sleep-bedtime', 'sleep-duration', 'calories', 'protein', 'meal-count']);

console.log('workouts');
check('first time doing an exercise is no record', R.prsByWorkout([bench('a', '2026-11-01', 60)]).size, 0);
check('heavier than ever → record', [...R.prsByWorkout([bench('a', '2026-11-01', 60), bench('b', '2026-11-02', 62.5)]).keys()], ['b']);
check('same weight → none', R.prsByWorkout([bench('a', '2026-11-01', 60), bench('b', '2026-11-02', 60)]).size, 0);
const three = R.buildContext({ ...data, workouts: ['2026-11-08', '2026-11-09', '2026-11-11'].map((d, i) => bench(`k${i}`, d, 50)) });
check('weekly goal bonus on the 3rd workout day only', ['2026-11-09', '2026-11-11'].map((d) => R.scoreDay(d, three, { closed: false }).some((a) => a.rule === 'workout-week')), [false, true]);

console.log('ledger writes: once, upward only, capped');
const awards = R.scoreDay('2026-11-10', ctx, { closed: true });
const writes = R.planLedgerWrites(awards, []);
const ledger = R.applyWrites([], writes);
check('the same day again writes nothing', R.planLedgerWrites(awards, ledger).length, 0);
check('a meal edited twice is one entry', ledger.filter((e) => e.id === '2026-11-10_meal-log_m1').length, 1);
check('a real full day stays under the cap (150 + bonuses)', ledger.filter((e) => !REWARDS.uncapped.includes(e.rule)).reduce((s, e) => s + e.points, 0), 150);
// Sleep 35 first (as scoreDay orders it), then twenty habits at 10 → over
// the cap: 16 habits fit, the 17th gets 5, the rest nothing.
const many = [
  { id: 'd_sleep-bedtime', date: 'd', rule: 'sleep-bedtime', raw: 20 },
  { id: 'd_sleep-duration', date: 'd', rule: 'sleep-duration', raw: 15 },
  ...Array.from({ length: 20 }, (_, i) => ({ id: `d_habit_${i}`, date: 'd', rule: 'habit', raw: 10 })),
  { id: 'd_pr_x', date: 'd', rule: 'pr', raw: 20 },
  { id: 'w_workout-week', date: 'd', rule: 'workout-week', raw: 50 },
  { id: 'd_perfect-day', date: 'd', rule: 'perfect-day', raw: 30 },
];
const manyLedger = R.applyWrites([], R.planLedgerWrites(many, []));
const capped = (e) => !REWARDS.uncapped.includes(e.rule);
check('capped rules stop at the daily cap', manyLedger.filter(capped).reduce((s, e) => s + e.points, 0), REWARDS.dailyCap);
check('bonuses and PRs are outside the cap', manyLedger.filter((e) => !capped(e)).map((e) => e.points), [20, 50, 30]);
const cut = manyLedger.find((e) => e.id === 'd_habit_16');
check('an entry cut by the cap keeps its full raw', [cut.points, cut.raw], [5, 10]);
check('nothing is written at 0', manyLedger.some((e) => e.id === 'd_habit_17'), false);
const one = { id: 'd_sleep-duration', date: 'd', rule: 'sleep-duration', points: 15, raw: 15, grade: 'full' };
check('a lower award never lowers an entry', R.planLedgerWrites([{ ...one, raw: 8, grade: 'close' }], [one]).length, 0);
check('a higher one raises it', R.planLedgerWrites([{ ...one, raw: 15 }], [{ ...one, points: 8, raw: 8 }]).map((w) => [w.points, w.before]), [[15, 8]]);
check('a missing award deletes nothing', R.applyWrites([one], R.planLedgerWrites([], [one])).length, 1);
const twoMeals = ['A', 'B'].map((m) => ({ id: `d_meal-log_${m}`, date: 'd', rule: 'meal-log', points: 5, raw: 5 }));
check('a deleted meal keeps its 5, and a new one can\'t make it 3', R.planLedgerWrites([{ id: 'd_meal-log_C', date: 'd', rule: 'meal-log', raw: 5 }], twoMeals).length, 0);

console.log('catch-up');
check('first run: today only', R.daysToScore({ today: '2026-11-10', startDate: null, checkedThrough: null }), ['2026-11-10']);
check('back after 10 days: from 7 before the last check', R.daysToScore({ today: '2026-11-20', startDate: '2026-11-01', checkedThrough: '2026-11-10' }).length, 18);
check('never before the start', R.daysToScore({ today: '2026-11-10', startDate: '2026-11-09', checkedThrough: '2026-11-09' }), ['2026-11-09', '2026-11-10']);
check('at most 31 days', R.daysToScore({ today: '2026-12-31', startDate: '2026-01-01', checkedThrough: '2026-02-01' }).length, 31);

console.log('levels');
check('0 → level 1', R.levelInfo(0).level, 1);
check('499 → 1, 500 → 2', [R.levelInfo(499).level, R.levelInfo(500).level], [1, 2]);
check('thresholds', REWARDS.levels.map((l) => l.min), [0, 500, 1500, 3000, 6000, 10000, 16000]);
check('progress to the next level', R.levelInfo(1000).progress, 0.5);
check('top level has no next', [R.levelInfo(20000).level, R.levelInfo(20000).next], [7, null]);

console.log('badges and streaks');
const entry = (date, rule, grade = null) => ({ id: `${date}_${rule}`, date, rule, grade, points: 10 });
const days7 = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 1}`);
const badge = (ledgerList, id) => R.badgesFrom(ledgerList).find((b) => b.id === id).earnedOn;
check('first night on time', badge([entry('2026-11-02', 'sleep-bedtime', 'free'), entry('2026-11-03', 'sleep-bedtime', 'full')], 'sleep-first'), '2026-11-03');
check('7 nights in a row', badge(days7.map((d) => entry(d, 'sleep-duration', 'close')), 'sleep-7'), '2026-11-07');
check('a gap breaks the streak', badge(days7.filter((d) => d !== '2026-11-04').map((d) => entry(d, 'sleep-duration', 'full')), 'sleep-7'), null);
check('5 records in a month', badge(['01', '03', '05', '07', '09'].map((d) => ({ ...entry(`2026-11-${d}`, 'pr'), id: d })), 'pr-5'), '2026-11-09');
check('comeback: on target after a logged day that wasn\'t', badge([entry('2026-11-01', 'meal-log'), entry('2026-11-02', 'meal-log'), entry('2026-11-02', 'calories', 'full')], 'comeback'), '2026-11-02');
check('calories streak counts back from today', R.ledgerStreak([entry('2026-11-08', 'calories', 'full'), entry('2026-11-09', 'calories', 'full')], 'calories', ['full'], '2026-11-10'), 2);
check('summary totals', R.rewardsSummary(ledger, '2026-11-10').today, ledger.reduce((s, e) => s + e.points, 0));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
