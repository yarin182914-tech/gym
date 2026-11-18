// The first-login questionnaire and the coach's instructions page
// (js/lib/onboarding.js, js/lib/coach-brief.js, M10a), plus meals a day
// in the points. No libraries:
//   node tools/test-onboarding.mjs
// Exits non-zero if any case fails.

const O = await import('../js/lib/onboarding.js');
const { coachBrief, habitLine } = await import('../js/lib/coach-brief.js');
const R = await import('../js/lib/rewards.js');
const { normalizeHabit } = await import('../js/lib/habits.js');
const { ONBOARDING, NUTRITION } = await import('../js/lib/rules.js');

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
const has = (text, piece) => String(text).includes(piece);

console.log('when it opens by itself');
check('a new account, never ran → opens', O.shouldAutoOpen({ user: {}, createdKey: ONBOARDING.fromDate }), true);
check('an older account (ירין) → never', O.shouldAutoOpen({ user: {}, createdKey: '2026-08-01' }), false);
check('no creation date → never', O.shouldAutoOpen({ user: {}, createdKey: '' }), false);
check('already started → not again', O.shouldAutoOpen({ user: { onboarding: { step: 'sleep' } }, createdKey: '2026-11-20' }), false);

console.log('resume card and step');
check('started, not done → card', O.showResumeCard({ user: { onboarding: { step: 'food' } } }), true);
check('done → no card', O.showResumeCard({ user: { onboarding: { doneAt: 'x' } } }), false);
check('never started → no card', O.showResumeCard({ user: {} }), false);
check('snoozed an hour ago → no card', O.showResumeCard({ user: { onboarding: {} }, nowMs: 3_600_000 * 2, snoozedAtMs: 3_600_000 }), false);
check('snoozed long ago → card', O.showResumeCard({ user: { onboarding: {} }, nowMs: 10 * 86_400_000, snoozedAtMs: 0 }), true);
check('resumes on the step it was left', O.resumeStep({ onboarding: { step: 'food' } }), 'food');
check('an unknown step → the first', O.resumeStep({ onboarding: { step: 'x' } }), 'body');
check('next of body', O.nextStep('body'), 'workouts');
check('next of habits → done', O.nextStep('habits'), 'done');
check('skip adds', O.markStep(['sleep'], 'body', { skip: true }), ['body', 'sleep']);
check('answering removes', O.markStep(['body', 'sleep'], 'sleep', { skip: false }), ['body']);

console.log('what counts as set up (from the data, never stored)');
const fresh = { onboarding: { step: 'body', skipped: [] } };
check('a fresh new account: nothing', O.areasState(fresh, []), { body: false, workouts: false, sleep: false, food: false, habits: false });
check('ירין (no onboarding): all but habits as always', O.areasState({}, []), { body: true, workouts: true, sleep: true, food: true, habits: false });
check('sleep saved from its ⚙ later → set', O.areaSet('sleep', { ...fresh, sleepBedtimeTarget: '23:00' }), true);
check('"הגוף שלי" sets body, not food', [O.areaSet('body', { baseKcal: 1700, calorieTarget: 1800 }), O.areaSet('food', { baseKcal: 1700, calorieTarget: 1800 })], [true, false]);
check('"יעדים" saved → food set', O.areaSet('food', { calorieDeficit: 250 }), true);
check('meals chosen → food set', O.areaSet('food', { mealsPerDay: 3 }), true);
check('a paused habit doesn\'t count', O.areaSet('habits', {}, [{ active: false }]), false);
check('workout kinds alone → set', O.areaSet('workouts', { workoutKinds: ['pilates'] }), true);
check('unknown kinds dropped, offered order', O.workoutKindsOf({ workoutKinds: ['yoga', 'zzz', 'strength'] }), ['strength', 'yoga']);

console.log('meals a day');
check('clamp 3', O.clampMeals('3'), 3);
check('clamp 0 → 1', O.clampMeals(0), 1);
check('clamp 9 → 6', O.clampMeals(9), 6);
check('clamp junk → default', O.clampMeals('x'), NUTRITION.maxMeals);
check('missing → 2 (ירין unchanged)', R.mealsPerDay({}), 2);
check('chosen 3', R.mealsPerDay({ mealsPerDay: 3 }), 3);
check('out of range → 2', R.mealsPerDay({ mealsPerDay: 12 }), 2);
const meal = (id, h) => ({ id, date: new Date(2026, 10, 10, h), calories: 500, proteinG: 30 });
const three = [meal('a', 9), meal('b', 13), meal('c', 19)];
const mealLogs = (user) => R.scoreDay('2026-11-10', R.buildContext({ userDoc: user, meals: three }), { closed: false }).filter((a) => a.rule === 'meal-log').length;
check('3 meals, plan of 2 → 2 score', mealLogs({}), 2);
check('3 meals, plan of 3 → 3 score', mealLogs({ mealsPerDay: 3 }), 3);
check('3 meals, plan of 3 → meal count full', R.nutritionGrades('2026-11-10', R.buildContext({ userDoc: { mealsPerDay: 3 }, meals: three })).mealCount, 'full');
const twoLogged = ['A', 'B'].map((m) => ({ id: `d_meal-log_${m}`, date: 'd', rule: 'meal-log', points: 5, raw: 5 }));
check('ledger: a 3rd meal-log allowed with 3 a day', R.planLedgerWrites([{ id: 'd_meal-log_C', date: 'd', rule: 'meal-log', raw: 5 }], twoLogged, { maxMeals: 3 }).length, 1);
check('ledger: still capped at 2 by default', R.planLedgerWrites([{ id: 'd_meal-log_C', date: 'd', rule: 'meal-log', raw: 5 }], twoLogged).length, 0);

console.log('quick habits');
check('templates in rules order', O.quickTemplates().map((t) => t.id), ONBOARDING.quickHabits);
const water = O.quickHabit(O.quickTemplates()[0]);
check('from a template: no template id, onboarding source', [water.id, water.name, water.source, water.active], [undefined, 'מים', 'onboarding', true]);
check('typed name → daily yes/no', O.quickHabit('  למתוח  '), { name: 'למתוח', kind: 'good', icon: 'check', area: 'personal', schedule: { type: 'daily' }, measure: 'yesno', markedBy: 'me', active: true, source: 'onboarding' });
check('empty name → null', O.quickHabit('   '), null);
const bad = O.quickHabit(O.quickTemplates().find((t) => t.id === 'phone-bed'));
check('a bad template stays bad', normalizeHabit(bad).kind, 'bad');

console.log('the coach\'s page');
const today = '2026-11-18';
const maya = {
  onboarding: { step: 'done', skipped: ['sleep'], doneAt: 'x' },
  body: { weightKg: 62, heightCm: 165, birthYear: 1996, sex: 'female' }, baseKcal: 1620,
  calorieTarget: 1650, proteinTarget: 100, calorieDeficit: 250, mealsPerDay: 3,
  weeklyWorkoutGoal: 3, workoutKinds: ['strength', 'pilates'],
};
const habits = [{ id: 'h1', ...O.quickHabit(O.quickTemplates()[0]), order: 0 }, { id: 'h2', ...bad, order: 1 }];
const page = coachBrief({ user: maya, habits, today });
check('addresses her in the feminine', has(page, 'המשתמשת'), true);
check('the date', has(page, '18.11.2026'), true);
check('meals and targets', has(page, 'עד 3 ארוחות') && has(page, '100 גרם חלבון'), true);
check('workouts with kinds', has(page, '3 בשבוע (כוח, פילאטיס)'), true);
check('both habits listed', has(page, '"מים"') && has(page, '"טלפון לפני השינה" (להיגמל)'), true);
check('sleep is under "not needed", not daily', page.split('## לא נדרש')[1].includes('שינה (לא הוגדר)') && !page.split('## לא נדרש')[0].includes('**שינה:**'), true);
check('body line', has(page, '62 ק״ג · 165 ס״מ · בת 30 · אישה'), true);
const empty = coachBrief({ user: { onboarding: { skipped: ['body', 'workouts', 'sleep', 'food', 'habits'] } }, habits: [], today });
check('all skipped: nothing daily', has(empty, 'כלום עדיין'), true);
check('all skipped: every area not needed', ['הגוף שלי', 'אימונים', 'שינה', 'אוכל', 'הרגלים'].every((n) => has(empty, `${n} (לא הוגדר)`)), true);
check('all skipped: default burn said so', has(empty, 'ברירת המחדל'), true);
const yarin = coachBrief({ user: { weeklyWorkoutGoal: 4 }, habits, today });
check('ירין (no onboarding): sleep and food daily, as today', has(yarin, '**שינה:**') && has(yarin, '**אוכל:**') && has(yarin, 'עד 2 ארוחות'), true);
check('ירין: nothing "not needed" but habits when none', has(coachBrief({ user: {}, habits: [], today }), 'הרגלים (לא הוגדר)'), true);
check('a step habit marked automatically', habitLine(normalizeHabit({ name: 'צעדים', measure: 'quantity', unit: 'צעדים', full: 8000, short: 5000, autoSource: 'dailyActivity.steps' })).includes('נרשם אוטומטית'), true);
check('a weekly habit', habitLine(normalizeHabit({ name: 'קריאה', schedule: { type: 'weekly', perWeek: 4 } })).includes('4 פעמים בשבוע'), true);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
