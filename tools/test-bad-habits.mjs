// Bad habits, routines and the clean streak (js/lib/habits.js), and how
// they score (js/lib/rewards.js). No libraries:
//   node tools/test-bad-habits.mjs
// Exits non-zero if any case fails.
//
// Dates: 2026-11-09 is a Monday; weeks run Sunday → Saturday
// (2026-11-08 … 2026-11-14).

process.env.TZ = 'Asia/Jerusalem';

const H = await import('../js/lib/habits.js');
const R = await import('../js/lib/rewards.js');
const { BAD_HABITS, REWARDS } = await import('../js/lib/rules.js');
const Pg = await import('../js/lib/progress.js');
const { shiftDays } = await import('../js/lib/sleep.js');

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
const nails = H.normalizeHabit({ id: 'b1', kind: 'bad', name: 'כסיסת ציפורניים', measure: 'slips' });
const phone = H.normalizeHabit({ id: 'b2', kind: 'bad', name: 'טלפון לפני השינה', measure: 'clean' });
const insta = H.normalizeHabit({ id: 'b3', kind: 'bad', name: 'אינסטגרם', measure: 'limit', unit: 'דקות', full: 30, short: 45 });
const clean = { clean: true, slips: [], source: 'manual' };
const slip = (...times) => ({ slips: times.map((t) => at(t)), source: 'manual' });
// logs: [{ date, marks: { habitId: mark } }]
const ctxOf = (days) => H.habitContext(days.map(([date, marks]) => ({ date, habits: marks })));

console.log('backward compatible');
const old = H.normalizeHabit({ id: 'g', name: 'קריאה', measure: 'quantity', full: 10, short: 5 });
check('a habit without kind stays good', [old.kind, old.measure, old.full, old.short], ['good', 'quantity', 10, 5]);
check('good keeps its schedule; bad is daily', [H.normalizeHabit({ schedule: { type: 'weekly', perWeek: 3 } }).schedule.type, H.normalizeHabit({ kind: 'bad', schedule: { type: 'weekly', perWeek: 3 } }).schedule.type], ['weekly', 'daily']);
check('a slip counter: full 0, short 1 slip', [nails.full, nails.short], [0, 1]);
check('unknown bad measure → clean day', H.normalizeHabit({ kind: 'bad', measure: 'quantity' }).measure, 'clean');
check('clean-week target default 5', nails.cleanWeekTarget, BAD_HABITS.cleanWeekTarget);
check('wizard answers default empty', [old.why, old.partOfDay, old.reminder, old.markedBy], ['', null, null, 'me']);

console.log('a bad habit\'s day');
check('nothing reported → unknown (null)', H.badDayLevel(nails, null), null);
check('a mark without the clean tap is still unknown', H.badDayLevel(nails, { slips: [] }), null);
check('clean tapped → full', H.badDayLevel(nails, clean), 'full');
check('slip counter, 1 slip → short', H.badDayLevel(nails, slip('2026-11-09T21:40:00')), 'short');
check('slip counter, 2 slips → none', H.badDayLevel(nails, slip('2026-11-09T21:40:00', '2026-11-09T22:15:00')), 'none');
check('clean day measure, 1 slip → none', H.badDayLevel(phone, slip('2026-11-09T23:00:00')), 'none');
check('a slip after the clean tap wins', H.badDayLevel(phone, { ...clean, slips: [at('2026-11-09T23:00:00')] }), 'none');
check('limit: 25 of 30 → full, 40 → short, 60 → none', [25, 40, 60].map((value) => H.badDayLevel(insta, { value })), ['full', 'short', 'none']);
check('honest report: a slip, or over the limit', [H.slipReported(nails, slip('2026-11-09T21:00:00')), H.slipReported(insta, { value: 40 }), H.slipReported(insta, { value: 20 })], [true, true, false]);

console.log('routines');
const routine = H.normalizeHabit({ name: 'שגרת בוקר', measure: 'steps', steps: ['מים', 'מיטה', 'מתיחות', 'תכנון'], shortSteps: [0, 1, 9] });
check('short steps outside the list are dropped', routine.shortSteps, [0, 1]);
check('every step → full', H.routineLevel(routine, [0, 1, 2, 3]), 'full');
check('the short steps → short', H.routineLevel(routine, [1, 0]), 'short');
check('some other step → none, nothing → null', [H.routineLevel(routine, [2]), H.routineLevel(routine, [])], ['none', null]);

console.log('scoring a day');
const score = (logs, key, closed, today = '2026-11-20') => R.scoreDay(key, R.buildContext({ habits: [nails, phone, insta], logs: logs.map(([date, marks]) => ({ date, habits: marks })), today }), { closed })
  .filter((a) => a.rule.startsWith('bad-')).map((a) => `${a.rule}:${a.raw}`);
check('a slip scores 2 right away', score([['2026-11-09', { b1: slip('2026-11-09T21:40:00') }]], '2026-11-09', false), ['bad-slip:2']);
check('clean tapped, day still open → nothing yet', score([['2026-11-09', { b1: clean }]], '2026-11-09', false), []);
check('clean day at close → 10', score([['2026-11-09', { b1: clean }]], '2026-11-09', true), ['bad-clean:10']);
check('one slip at close → 2 + 5', score([['2026-11-09', { b1: slip('2026-11-09T21:40:00') }]], '2026-11-09', true), ['bad-slip:2', 'bad-clean:5']);
check('nothing reported at close → nothing', score([], '2026-11-09', true), []);
check('over the limit: 2 for the report, no clean points', score([['2026-11-09', { b3: { value: 60 } }]], '2026-11-09', true), ['bad-slip:2']);
const week = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map((d) => [d, { b2: clean }]);
check('5th clean day of the week → weekly bonus', score(week, '2026-11-12', true), ['bad-clean:10', 'bad-week:20']);
const slipWeek = [...week.slice(0, 2), ['2026-11-10', { b2: slip('2026-11-10T23:00:00') }], ...week.slice(3), ['2026-11-13', { b2: clean }]];
check('a slip mid-week doesn\'t wipe the week (5th clean day on Friday) — and 3 clean since it make a new streak', score(slipWeek, '2026-11-13', true), ['bad-clean:10', 'bad-week:20', 'bad-streak:15']);

console.log('clean streak and milestones');
const days = (from, n, mark = clean) => Array.from({ length: n }, (_, i) => [shiftDays(from, i), { b1: mark }]);
const streak = (logs, today) => H.cleanStreak(nails, today, ctxOf(logs));
check('3 clean days → 3', streak(days('2026-11-01', 3), '2026-11-03').current, 3);
check('a slip ends the streak (no points taken)', streak([...days('2026-11-01', 5), ['2026-11-06', { b1: slip('2026-11-06T21:00:00') }]], '2026-11-06'), { current: 0, best: 5, lastEnded: { days: 5, endedBy: 'slip', end: '2026-11-05' } });
check('the best streak is kept after a new one starts', streak([...days('2026-11-01', 21), ['2026-11-22', { b1: slip('2026-11-22T21:00:00') }], ...days('2026-11-23', 2)], '2026-11-24'), { current: 2, best: 21, lastEnded: { days: 21, endedBy: 'slip', end: '2026-11-21' } });
const withGap = [...days('2026-11-01', 4), ...days('2026-11-06', 3)]; // 11-05 unreported
check('an unreported day inside the fill-in window doesn\'t break it', streak(withGap, '2026-11-08').current, 7);
check('older than the window and still empty → it ends', streak(withGap, '2026-11-30').current, 0);
check('…and both streaks are kept', streak(withGap, '2026-11-30').best, 4);
check('filling in the missing day joins them', streak([...withGap, ['2026-11-05', { b1: clean }]], '2026-11-30').best, 8);

const milestones = (logs, today) => {
  const ctx = R.buildContext({ habits: [nails], logs: logs.map(([date, habits]) => ({ date, habits })), today });
  const keys = logs.map(([d]) => d).filter((d) => d < today);
  return keys.flatMap((k) => R.scoreDay(k, ctx, { closed: true })).filter((a) => a.rule === 'bad-streak').map((a) => [a.date, a.raw, a.id]);
};
check('3 days → 15, 7 days → 30, once each', milestones(days('2026-11-01', 8), '2026-11-20'), [
  ['2026-11-03', 15, '2026-11-01_bad-streak_b1_3'], ['2026-11-07', 30, '2026-11-01_bad-streak_b1_7'],
]);
check('the milestones in rules.js', BAD_HABITS.streakMilestones.map((m) => [m.days, m.points]), [[3, 15], [7, 30], [14, 60], [30, 120], [66, 250], [100, 400]]);
const twoRuns = [...days('2026-11-01', 3), ['2026-11-04', { b1: slip('2026-11-04T21:00:00') }], ...days('2026-11-05', 3)];
check('a new streak earns its milestones again (new id)', milestones(twoRuns, '2026-11-20').map((m) => m[2]), ['2026-11-01_bad-streak_b1_3', '2026-11-05_bad-streak_b1_3']);
check('66 days → 250, with the "נגמל" badge', milestones(days('2026-08-01', 66), '2026-12-31').find((m) => m[1] === 250)?.[0], '2026-10-05');
check('a streak reaching past the logs read gets no milestones', R.scoreDay('2026-11-03', R.buildContext({ habits: [nails], logs: days('2026-11-01', 3).map(([date, habits]) => ({ date, habits })), today: '2026-11-20', logsFrom: '2026-11-01' }), { closed: true }).filter((a) => a.rule === 'bad-streak').length, 0);
const ledger = R.applyWrites([], R.planLedgerWrites([{ id: 'x', date: '2026-10-05', rule: 'bad-streak', raw: 250, grade: '66' }], []));
check('"נגמל" badge from the 66-day milestone', R.badgesFrom(ledger).find((b) => b.id === 'quit').earnedOn, '2026-10-05');
check('streak bonuses are outside the daily cap', ['bad-week', 'bad-streak'].every((r) => REWARDS.uncapped.includes(r)), true);

console.log('perfect day and progress');
const good = H.normalizeHabit({ id: 'g1', name: 'קריאה', measure: 'yesno' });
const pctx = R.buildContext({ habits: [good, phone], logs: [{ date: '2026-11-09', habits: { g1: { level: 'full' }, b2: slip('2026-11-09T23:00:00') } }], today: '2026-11-20' });
check('a slip doesn\'t block the perfect day (habits part)', R.isPerfectDay('2026-11-09', pctx, { 'sleep-bedtime': 'full', 'sleep-duration': 'full', calories: 'full', protein: 'full', 'meal-count': 'full' }), true);
check('bad habits aren\'t scored as good ones', R.scoreDay('2026-11-09', pctx, { closed: false }).filter((a) => a.rule === 'habit').map((a) => a.ref), ['g1']);
const row = Pg.allRows(pctx).find((r) => r.id === 'habit:b2');
check('progress: a slip is grey (miss), unreported an outline (none)', [Pg.dayCell(row, '2026-11-09', pctx, '2026-11-20').status, Pg.dayCell(row, '2026-11-10', pctx, '2026-11-20').status], ['miss', 'none']);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
