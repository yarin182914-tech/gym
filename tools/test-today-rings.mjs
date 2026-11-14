// The top of "היום" (js/lib/today-rings.js): the three rings, the points
// streak and the greeting. No libraries:
//   node tools/test-today-rings.mjs
// Exits non-zero if any case fails. Runs in Israel time, like the app.
//
// Dates: 2026-11-14 is a Saturday; its week started on Sunday 2026-11-08.

process.env.TZ = 'Asia/Jerusalem';

const { todayRings, pointsStreak, greeting, firstName, shortDate } = await import('../js/lib/today-rings.js');
const { nutritionGoals } = await import('../js/lib/rewards.js');
const { buildActivity, calorieTargetOf } = await import('../js/lib/daily-activity.js');

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

const today = '2026-11-14';
const at = (day, hhmm = '12:00') => new Date(`${day}T${hhmm}:00`);
const goals = nutritionGoals({}); // 2000 kcal, deficit 250
const base = { today, workoutGoal: 3, goals, sleepTargetMin: 480 };

// ---- the workout ring: days this week, not workouts ----
const workouts = [
  { startTime: at('2026-11-07') }, // last week (a Saturday)
  { startTime: at('2026-11-08') }, // Sunday: this week's first day
  { startTime: at('2026-11-10', '07:00') },
  { startTime: at('2026-11-10', '19:00') }, // the same day twice
  { date: at('2026-11-15') }, // tomorrow
];
check('train: 2 days of 3 this week', todayRings({ ...base, workouts }).train, { value: 2, target: 3, fraction: 2 / 3, empty: false });
check('train: nothing this week is empty', todayRings({ ...base, workouts: [workouts[0]] }).train, { value: 0, target: 3, fraction: 0, empty: true });
check('train: over the goal is a full ring', todayRings({
  ...base, workoutGoal: 1, workouts,
}).train, { value: 2, target: 1, fraction: 1, empty: false });

// ---- the food ring: today's calories of the day's own target ----
const meals = [
  { date: at(today, '08:00'), calories: 500 },
  { date: at(today, '13:30'), calories: 700.4 },
  { date: at('2026-11-13', '20:00'), calories: 900 }, // yesterday
];
check('food: today only, of the fixed target', todayRings({ ...base, meals }).food, { value: 1200, target: 2000, fraction: 0.6, empty: false });
check('food: no meal today is empty', todayRings({ ...base, meals: [meals[2]] }).food, { value: 0, target: 2000, fraction: 0, empty: true });
const activity = buildActivity(today, { steps: 10000, baseKcal: 1900 });
const burnTarget = calorieTargetOf(activity, goals);
check('food: a logged burn sets the target (burn − deficit)', burnTarget, activity.totalOutKcal - 250);
check('food: the ring uses that target', todayRings({ ...base, meals, activity }).food.target, burnTarget);
check('food: over the target is a full ring', todayRings({
  ...base, meals: [{ date: at(today), calories: 2600 }],
}).food, { value: 2600, target: 2000, fraction: 1, empty: false });
check('food: a meal with no calories still counts as logged', todayRings({
  ...base, meals: [{ date: at(today) }],
}).food, { value: 0, target: 2000, fraction: 0, empty: false });

// ---- the sleep ring: last night of the minimum ----
check('sleep: 7:10 of 8:00', todayRings({ ...base, night: { date: today, durationMin: 430 } }).sleep, {
  value: 430, target: 480, fraction: 430 / 480, empty: false,
});
check('sleep: duration from the two clocks', todayRings({
  ...base, night: { date: today, bedtime: at('2026-11-13', '23:00'), wakeTime: at(today, '06:30') },
}).sleep.value, 450);
check('sleep: not logged is empty', todayRings(base).sleep, { value: 0, target: 480, fraction: 0, empty: true });

// ---- the streak: days in a row with points ----
const byDay = (entries) => new Map(Object.entries(entries));
check('streak: ends today', pointsStreak(byDay({ '2026-11-14': 10, '2026-11-13': 25, '2026-11-12': 5 }), today), 3);
check('streak: today has none yet, counts from yesterday', pointsStreak(byDay({ '2026-11-13': 25, '2026-11-12': 5 }), today), 2);
check('streak: a gap stops it', pointsStreak(byDay({ '2026-11-14': 10, '2026-11-12': 5 }), today), 1);
check('streak: a day with 0 points is a gap', pointsStreak(byDay({ '2026-11-14': 10, '2026-11-13': 0, '2026-11-12': 5 }), today), 1);
check('streak: nothing yet', pointsStreak(byDay({}), today), 0);
check('streak: no ledger at all', pointsStreak(undefined, today), 0);
check('streak: crosses a month', pointsStreak(byDay({ '2026-11-01': 5, '2026-10-31': 5, '2026-10-30': 5 }), '2026-11-01'), 3);

// ---- the greeting ----
check('greeting by the hour', [0, 4, 5, 11, 12, 16, 17, 21, 22, 23].map(greeting), [
  'לילה טוב', 'לילה טוב', 'בוקר טוב', 'בוקר טוב', 'צהריים טובים', 'צהריים טובים', 'ערב טוב', 'ערב טוב', 'לילה טוב', 'לילה טוב',
]);
check('first name', ['ירין כהן', '  מאיה  ', '', null, undefined].map(firstName), ['ירין', 'מאיה', '', '', '']);
check('short date', shortDate(at(today)), 'יום שבת · 14 בנובמבר');

console.log(failed ? `FAILED — ${failed} case(s).` : 'OK — all passed');
process.exit(failed ? 1 : 0);
