// Google Calendar events of tasks (js/lib/calendar-event.js). No libraries:
//   node tools/test-calendar-event.mjs
// Exits non-zero if any case fails.
//
// Runs in UTC on purpose: the server does, and the events must still land
// on the Israeli day and hour.

process.env.TZ = 'UTC';

const C = await import('../js/lib/calendar-event.js');
const T = await import('../js/lib/tasks.js');
const { CALENDAR } = await import('../js/lib/rules.js');

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

const task = (extra) => T.normalizeTask({ id: 't1', title: 'לתקן את הקרש', ...extra });
// 2026-11-17 18:00 in Israel (winter, UTC+2).
const AT = new Date('2026-11-17T16:00:00Z');
const exact = (extra = {}) => task({ timing: 'exact', scheduledAt: AT, ...extra });
// Local noon of 2026-11-17 in Israel.
const day = (extra = {}) => task({ timing: 'day', scheduledAt: new Date('2026-11-17T10:00:00Z'), ...extra });

console.log('which tasks get an event');
check('exact', C.wantsEvent(exact()), true);
check('day', C.wantsEvent(day()), true);
check('week', C.wantsEvent(task({ timing: 'week', scheduledAt: AT })), false);
check('claude', C.wantsEvent(task({ timing: 'claude' })), false);
check('no timing', C.wantsEvent(task({})), false);
check('exact with no time yet', C.wantsEvent(task({ timing: 'exact' })), false);
check('someday', C.wantsEvent(exact({ status: 'someday' })), false);
check('daily', C.wantsEvent(task({ type: 'daily', timing: 'exact', scheduledAt: AT })), false);
check('recurring', C.wantsEvent(task({ type: 'recurring', timing: 'day', scheduledAt: AT })), false);
check('done keeps it', C.wantsEvent(exact({ status: 'done', doneAt: AT })), true);
check('gone', C.eventFor(null), null);
check('a date that is not a date', [C.wantsEvent(exact({ scheduledAt: { seconds: 1 } })), C.tasksToConnect([exact({ scheduledAt: 'מחר' })], new Date('2026-11-17T08:00:00Z'))], [false, []]);

console.log('the event');
const ev = C.eventFor(exact());
check('timed start', ev.start, { dateTime: '2026-11-17T16:00:00.000Z', timeZone: 'Asia/Jerusalem' });
check('small = 15 min', ev.end.dateTime, '2026-11-17T16:15:00.000Z');
check('medium = an hour', C.eventFor(exact({ complexity: 'M' })).end.dateTime, '2026-11-17T17:00:00.000Z');
check('large = two hours', C.eventFor(exact({ complexity: 'L' })).end.dateTime, '2026-11-17T18:00:00.000Z');
check('durations come from the rules', CALENDAR.durationMin, { S: 15, M: 60, L: 120 });
check('name', ev.summary, 'לתקן את הקרש');
check('marked as ours', ev.extendedProperties.private, { gymi: 'true', taskId: 't1' });
check('all day', [C.eventFor(day()).start, C.eventFor(day()).end], [{ date: '2026-11-17' }, { date: '2026-11-18' }]);
check('all day, end of month', C.eventFor(day({ scheduledAt: new Date('2026-11-30T10:00:00Z') })).end, { date: '2026-12-01' });
// 23:30 UTC on the 17th is already the 18th in Israel.
check('all day is the Israeli day', C.eventFor(day({ scheduledAt: new Date('2026-11-17T23:30:00Z') })).start, { date: '2026-11-18' });
// Summer time (UTC+3): local noon of 2026-07-01 is 09:00 UTC.
check('all day in summer', C.eventFor(day({ scheduledAt: new Date('2026-07-01T09:00:00Z') })).start, { date: '2026-07-01' });
check('done adds the mark', C.eventFor(exact({ status: 'done', doneAt: AT })).summary, '✓ לתקן את הקרש');

console.log('what to do');
const sig = C.signatureOf(ev);
check('new → create', C.planSync(exact()).action, 'create');
check('unchanged → none', C.planSync(exact(), { eventId: 'e1', signature: sig }).action, 'none');
const moved = C.planSync(exact({ scheduledAt: new Date('2026-11-18T16:00:00Z') }), { eventId: 'e1', signature: sig });
check('moved → patch with times', [moved.action, Object.keys(moved.body)], ['patch', ['summary', 'start', 'end']]);
const done = C.planSync(exact({ status: 'done', doneAt: AT }), { eventId: 'e1', signature: sig });
check('done → patch the name only', [done.action, done.body], ['patch', { summary: '✓ לתקן את הקרש' }]);
check('undone → name back', C.planSync(exact(), { eventId: 'e1', signature: done.signature }).body, { summary: 'לתקן את הקרש' });
check('renamed → name only', C.planSync(exact({ title: 'אחר' }), { eventId: 'e1', signature: sig }).body, { summary: 'אחר' });
check('resized → times too', Object.keys(C.planSync(exact({ complexity: 'L' }), { eventId: 'e1', signature: sig }).body), ['summary', 'start', 'end']);
check('event with no signature → full patch', Object.keys(C.planSync(exact(), { eventId: 'e1' }).body), ['summary', 'start', 'end']);
check('someday → delete', C.planSync(exact({ status: 'someday' }), { eventId: 'e1', signature: sig }).action, 'delete');
check('time removed → delete', C.planSync(task({}), { eventId: 'e1', signature: sig }).action, 'delete');
check('task deleted → delete', C.planSync(null, { eventId: 'e1', signature: sig }).action, 'delete');
check('task deleted, never synced → none', C.planSync(null).action, 'none');
check('no event wanted, none linked → none', C.planSync(task({})).action, 'none');
check('deleted by hand, same time → stays gone', C.planSync(exact({ title: 'אחר' }), { signature: sig }).action, 'none');
check('deleted by hand, then moved → comes back', C.planSync(exact({ scheduledAt: new Date('2026-11-19T16:00:00Z') }), { signature: sig }).action, 'create');
check('timed → all day is a move', Object.keys(C.planSync(day(), { eventId: 'e1', signature: sig }).body), ['summary', 'start', 'end']);

console.log('after connecting');
const NOW = new Date('2026-11-17T08:00:00Z');
const list = [
  exact({ id: 'later', scheduledAt: new Date('2026-11-20T16:00:00Z') }),
  exact({ id: 'today' }),
  day({ id: 'yesterday', scheduledAt: new Date('2026-11-16T10:00:00Z') }),
  exact({ id: 'done', status: 'done', doneAt: AT }),
  task({ id: 'inbox' }),
  task({ id: 'daily', type: 'daily' }),
];
check('open, from today, soonest first', C.tasksToConnect(list, NOW), ['today', 'later']);
const many = Array.from({ length: CALENDAR.connectSyncMax + 5 }, (_, i) => exact({ id: `t${i}` }));
check('capped', C.tasksToConnect(many, NOW).length, CALENDAR.connectSyncMax);

console.log('catching up');
const sent = C.signatureOf(C.eventFor(exact()));
check('never sent → goes', C.tasksMissingEvent([exact({ id: 'new' })], NOW), ['new']);
check('already has an event → skipped', C.tasksMissingEvent([exact({ id: 'has', calendarEventId: 'e1', calendarSync: sent })], NOW), []);
check('deleted by hand → left alone', C.tasksMissingEvent([exact({ id: 'gone', calendarSync: sent })], NOW), []);
check('same rules as connecting', C.tasksMissingEvent(list, NOW), ['today', 'later']);
check('the signature survives normalizing', T.normalizeTask({ calendarSync: sent }).calendarSync, sent);
check('and is null when missing', T.normalizeTask({}).calendarSync, null);

console.log('the retry list');
check('adds', C.addPending(['a'], ['b']), ['a', 'b']);
check('no repeats, newest last', C.addPending(['a', 'b'], ['a']), ['b', 'a']);
check('survives junk', C.addPending(null, ['a']), ['a']);
check('capped', C.addPending(Array.from({ length: CALENDAR.retryMax }, (_, i) => `x${i}`), ['new']).length, CALENDAR.retryMax);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
