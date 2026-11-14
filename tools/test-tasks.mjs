// Tasks (js/lib/tasks.js) and their points (js/lib/rewards.js). No libraries:
//   node tools/test-tasks.mjs
// Exits non-zero if any case fails.
//
// 2026-11-10 is a Tuesday. Weeks run Sunday → Saturday: 2026-11-08 … 14.

process.env.TZ = 'Asia/Jerusalem';

const T = await import('../js/lib/tasks.js');
const R = await import('../js/lib/rewards.js');
const { TASKS } = await import('../js/lib/rules.js');

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

const TODAY = '2026-11-10';
const noon = (k) => T.noonOf(k);
const task = (extra) => T.normalizeTask({ id: extra.id || 't', title: 'x', ...extra });

console.log('normalize');
check('defaults', (({ type, owner, complexity, status, timing }) => ({ type, owner, complexity, status, timing }))(task({})), { type: 'once', owner: 'me', complexity: 'S', status: 'open', timing: null });
check('daily with no days → every day', task({ type: 'daily' }).recurrence, { days: [0, 1, 2, 3, 4, 5, 6] });
check('monthly day out of range → 1', task({ type: 'recurring', recurrence: { every: 'month', day: 31 } }).recurrence, { every: 'month', day: 1 });
check('a repeating task is never "done" for good', task({ type: 'daily', status: 'done' }).status, 'open');

console.log('days');
check('weekOf Tuesday → Sunday', T.weekOf(TODAY), '2026-11-08');
check('daily on chosen weekdays', [TODAY, '2026-11-11'].map((k) => T.repeatsOn(task({ type: 'daily', recurrence: { days: [2] } }), k)), [true, false]);
check('weekly on its weekday', T.repeatsOn(task({ type: 'recurring', recurrence: { every: 'week', day: 2 } }), TODAY), true);
check('monthly on its date', T.repeatsOn(task({ type: 'recurring', recurrence: { every: 'month', day: 10 } }), TODAY), true);

console.log('today list');
const scheduledToday = task({ id: 'a', timing: 'day', scheduledAt: noon(TODAY) });
const overdue = task({ id: 'b', timing: 'day', scheduledAt: noon('2026-11-08') });
const tomorrow = task({ id: 'c', timing: 'day', scheduledAt: noon('2026-11-11') });
const thisWeek = task({ id: 'd', timing: 'week', scheduledAt: noon('2026-11-08') });
const dueToday = task({ id: 'e', dueDate: noon(TODAY) });
const queued = task({ id: 'f', timing: 'claude' });
const doneToday = task({ id: 'g', status: 'done', doneAt: new Date('2026-11-10T09:00:00') });
const all = [scheduledToday, overdue, tomorrow, thisWeek, dueToday, queued, doneToday];
check('on today', all.filter((t) => T.isForDay(t, TODAY, TODAY)).map((t) => t.id), ['a', 'b', 'd', 'e', 'g']);
check('tomorrow shows only tomorrow', all.filter((t) => T.isForDay(t, '2026-11-11', TODAY)).map((t) => t.id), ['c']);
check('done goes last', T.dayList(all, TODAY, TODAY).map((t) => t.id).at(-1), 'g');
check('queue: unscheduled only', all.filter(T.isUnscheduled).map((t) => t.id), ['e', 'f']);
check('top 3 skips the done', T.topToday(all, TODAY).length, 3);

console.log('urgent and matrix');
check('due tomorrow is urgent', T.isUrgent(task({ dueDate: noon('2026-11-11') }), TODAY), true);
check('due in 3 days is not', T.isUrgent(task({ dueDate: noon('2026-11-13') }), TODAY), false);
check('quadrants', [
  task({ important: true, urgent: true }), task({ important: true }), task({ urgent: true }), task({}),
].map((t) => T.quadrant(t, TODAY)), ['do', 'plan', 'quick', 'drop']);
check('important limit counts the day', T.importantOn([
  task({ id: '1', important: true, timing: 'day', scheduledAt: noon(TODAY) }),
  task({ id: '2', important: true, timing: 'day', scheduledAt: noon(TODAY) }),
  task({ id: '3', important: false, timing: 'day', scheduledAt: noon(TODAY) }),
], TODAY, '2', TODAY), 1);

console.log('ladder');
const now = new Date('2026-11-10T12:00:00');
const added = (days, extra = {}) => task({ createdAt: new Date(now - days * 86400000), ...extra });
check('6 days: nothing', T.ladderStage(added(6), now), null);
check('7 days: waiting', T.ladderStage(added(7), now), 'waiting');
check('14 days: stuck', T.ladderStage(added(14), now), 'stuck');
check('21 days: decide', T.ladderStage(added(21), now), 'decide');
check('scheduled: outside the ladder', T.ladderStage(added(30, { timing: 'day', scheduledAt: noon(TODAY) }), now), null);
check('moved 3 times: stuck', T.ladderStage(added(1, { timing: 'day', scheduledAt: noon(TODAY), postponeCount: 3 }), now), 'stuck');
check('someday: outside', T.ladderStage(added(30, { status: 'someday' }), now), null);

console.log('points');
check('small', T.taskPoints(task({}), TODAY).raw, TASKS.points.S);
check('large important on time', T.taskPoints(task({ complexity: 'L', important: true, dueDate: noon(TODAY) }), TODAY).raw, TASKS.points.L * 2 + TASKS.onTimeBonus);
check('late: no bonus, no penalty', T.taskPoints(task({ complexity: 'M', dueDate: noon('2026-11-09') }), TODAY).raw, TASKS.points.M);
check('daily is worth a small one', T.taskPoints(task({ type: 'daily', complexity: 'L' }), TODAY).raw, TASKS.dailyPoints);
check('toggleDoneDate', T.toggleDoneDate(['2026-11-09'], TODAY, true), [TODAY, '2026-11-09']);
check('toggleDoneDate off', T.toggleDoneDate([TODAY, '2026-11-09'], TODAY, false), ['2026-11-09']);

console.log('ledger');
const ctx = R.buildContext({
  today: TODAY,
  tasks: [
    { id: 'once1', title: 'דו"ח', complexity: 'M', important: true, status: 'done', doneAt: new Date('2026-11-10T10:00:00'), dueDate: noon(TODAY) },
    { id: 'daily1', title: 'מטבח', type: 'daily', doneDates: [TODAY] },
    { id: 'stuck1', title: 'מחסן', startedAt: new Date('2026-11-10T19:00:00') },
    { id: 'open1', title: 'פתוחה' },
  ],
});
const awards = R.scoreDay(TODAY, ctx, { closed: false }).filter((a) => a.source === 'task');
check('task awards', awards.map((a) => [a.id, a.raw]), [
  ['2026-11-10_task_once1', TASKS.points.M * 2 + TASKS.onTimeBonus],
  ['2026-11-10_task_daily1', TASKS.dailyPoints],
  ['2026-11-10_task-start_stuck1', TASKS.startBonus],
]);
check('nothing on another day', R.scoreDay('2026-11-09', ctx, { closed: true }).filter((a) => a.source === 'task').length, 0);

console.log('the row\'s line and "מחר" (M14a)');
const NOW = new Date('2026-11-10T10:00:00+02:00');
const daysBefore = (n) => new Date(NOW.getTime() - n * 86400000);
check('a day → its name', T.rowLine(task({ timing: 'day', scheduledAt: noon(TODAY) }), TODAY, NOW), 'היום');
check('new in the inbox → "בתיבה"', T.rowLine(task({ status: 'inbox', createdAt: daysBefore(1) }), TODAY, NOW), 'בתיבה');
check('a week with no time → "מחכה שבוע"', T.rowLine(task({ timing: 'claude', createdAt: daysBefore(TASKS.ladder.waiting) }), TODAY, NOW), 'קלוד ישבץ · מחכה שבוע');
check('a done task is off the ladder', T.rowLine(task({ timing: 'claude', status: 'done', doneAt: NOW, createdAt: daysBefore(TASKS.ladder.waiting) }), TODAY, NOW), 'קלוד ישבץ');
check('"מחר" for today and for overdue', [TODAY, '2026-11-08'].map((k) => T.canPostpone(task({ timing: 'day', scheduledAt: noon(k) }), TODAY)), [true, true]);
check('not for tomorrow, repeating, done or with no time', [
  task({ timing: 'day', scheduledAt: noon('2026-11-11') }),
  task({ type: 'daily' }),
  task({ timing: 'day', scheduledAt: noon(TODAY), status: 'done', doneAt: NOW }),
  task({ timing: 'claude' }),
].map((t) => T.canPostpone(t, TODAY)), [false, false, false, false]);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
