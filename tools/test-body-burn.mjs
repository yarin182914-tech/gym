// Personal burn and targets (js/lib/body-burn.js, M16a). No libraries:
//   node tools/test-body-burn.mjs
// Exits non-zero if any case fails.

const B = await import('../js/lib/body-burn.js');
const { ACTIVITY, BODY } = await import('../js/lib/rules.js');

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

const maya = { weightKg: 60, heightCm: 165, age: 30, sex: 'female' };
const man = { weightKg: '80', heightCm: '180', age: '35', sex: 'male' };

console.log('BMR (Mifflin-St Jeor)');
check('woman 60/165/30', B.bmr(maya), 1320.25);
check('man 80/180/35 from strings', B.bmr(man), 1755);
check('missing answer → null', B.bmr({ ...maya, age: '' }), null);
check('unknown sex → null', B.bmr({ ...maya, sex: 'x' }), null);

console.log('Targets');
check('woman: base 1584, no-burn target 1800−250, protein 95', B.bodyTargets(maya, 250),
  { baseKcal: 1584, calorieTarget: 1550, proteinTarget: 95 });
check('man: base 2106, no-burn target 2400−250, protein 130', B.bodyTargets(man),
  { baseKcal: 2106, calorieTarget: 2150, proteinTarget: 130 });
check('deficit 0 is kept', B.bodyTargets(maya, 0).calorieTarget, 1800);
check('invalid → null', B.bodyTargets({ ...maya, weightKg: 12 }), null);

console.log('Validation');
check('all fine', B.invalidFields(maya), []);
check('comma decimal', B.parseNum(' 62,5 '), 62.5);
check('empty → null', B.parseNum(''), null);
check('out of range and missing', B.invalidFields({ weightKg: 300, heightCm: 100, age: '', sex: '' }),
  ['weightKg', 'heightCm', 'age', 'sex']);
check('limits edges pass', B.invalidFields({ weightKg: BODY.limits.weightKg[0], heightCm: BODY.limits.heightCm[1], age: BODY.limits.age[0], sex: 'male' }), []);

console.log('Stored body map');
check('to doc', B.bodyDoc({ weightKg: '62.46', heightCm: '165.4', age: '30', sex: 'female' }, 2026),
  { weightKg: 62.5, heightCm: 165, birthYear: 1996, sex: 'female' });
check('back to answers', B.answersFrom({ weightKg: 62.5, heightCm: 165, birthYear: 1996, sex: 'female' }, 2027),
  { weightKg: 62.5, heightCm: 165, age: 31, sex: 'female' });
check('no body → empty answers', B.answersFrom(undefined, 2026), { weightKg: '', heightCm: '', age: '', sex: '' });

console.log('Base burn for new days');
check('personal', B.userBaseKcal({ baseKcal: 1584 }), 1584);
check('missing → default', B.userBaseKcal({}), ACTIVITY.baseKcal);
check('no user doc → default', B.userBaseKcal(null), ACTIVITY.baseKcal);
check('nonsense → default', B.userBaseKcal({ baseKcal: '1500' }), ACTIVITY.baseKcal);

console.log('Today card');
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-16T12:00:00Z');
check('new account, nothing filled', B.showBodyCard({ user: {}, createdKey: '2026-11-15', nowMs: now }), true);
check('on the cut-off day', B.showBodyCard({ user: null, createdKey: BODY.cardFromDate, nowMs: now }), true);
check('older account (ירין)', B.showBodyCard({ user: {}, createdKey: '2026-08-01', nowMs: now }), false);
check('no creation date', B.showBodyCard({ user: {}, createdKey: '', nowMs: now }), false);
check('filled', B.showBodyCard({ user: { body: { sex: 'female' }, baseKcal: 1584 }, createdKey: '2026-11-15', nowMs: now }), false);
check('snoozed yesterday', B.showBodyCard({ user: {}, createdKey: '2026-11-15', snoozedAtMs: now - DAY, nowMs: now }), false);
check('snooze over', B.showBodyCard({ user: {}, createdKey: '2026-11-15', snoozedAtMs: now - (BODY.snoozeDays * DAY + 1), nowMs: now }), true);

console.log("Today's activity doc on a new base");
check('derived doc is rebased', B.rebaseActivity({ baseKcal: 1950, stepsKcal: 320, workoutKcal: 250, totalOutKcal: 2520 }, 1584),
  { baseKcal: 1584, totalOutKcal: 2154 });
check('old doc without totalOutKcal', B.rebaseActivity({ steps: 1000, stepsKcal: 40 }, 1584),
  { baseKcal: 1584, totalOutKcal: 1624 });
check('hand-written total is left alone', B.rebaseActivity({ baseKcal: 1950, stepsKcal: 0, workoutKcal: 0, totalOutKcal: 2700 }, 1584), null);
check('same base → nothing to do', B.rebaseActivity({ baseKcal: 1584, stepsKcal: 0, workoutKcal: 0, totalOutKcal: 1584 }, 1584), null);
check('no doc', B.rebaseActivity(null, 1584), null);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
