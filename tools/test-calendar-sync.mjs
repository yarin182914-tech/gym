// Google Calendar sync on the server (api/_lib/calendar-events.js) against
// a pretend calendar and a pretend task store — no Firebase, no network:
//   node tools/test-calendar-sync.mjs
// Exits non-zero if any case fails.

process.env.TZ = 'UTC';

const { syncTask, syncAll, eventIdFor, forCard } = await import('../api/_lib/calendar-events.js');

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

const UID = 'user1';
const AT = new Date('2026-11-17T16:00:00Z');
const base = { title: 'לתקן את הקרש', type: 'once', timing: 'exact', scheduledAt: AT, status: 'open', complexity: 'S' };

// A calendar that behaves like Google's for the calls the sync makes.
function world(tasks = {}, events = {}) {
  const calls = [];
  let auto = 0;
  const io = {
    calls,
    tasks,
    events,
    readTask: async (id) => tasks[id] || null,
    writeTask: async (id, patch) => {
      if (tasks[id]) Object.assign(tasks[id], patch);
    },
    call: async (method, path, body) => {
      calls.push(`${method} ${path}`);
      const id = decodeURIComponent(path.slice(1));
      if (method === 'POST') {
        const newId = body.id || `auto${++auto}`;
        if (events[newId]) return { ok: false, status: 409, data: {} };
        events[newId] = { status: 'confirmed', ...body, id: newId };
        return { ok: true, status: 200, data: events[newId] };
      }
      const ev = events[id];
      if (method === 'GET') return ev ? { ok: true, status: 200, data: ev } : { ok: false, status: 404, data: {} };
      if (method === 'PATCH') {
        if (!ev) return { ok: false, status: 404, data: {} };
        // A deleted event stays deleted unless it is confirmed again.
        if (ev.status === 'cancelled' && body.status !== 'confirmed') return { ok: true, status: 200, data: ev };
        Object.assign(ev, body);
        return { ok: true, status: 200, data: ev };
      }
      if (method === 'DELETE') {
        if (!ev || ev.status === 'cancelled') return { ok: false, status: 410, data: {} };
        ev.status = 'cancelled';
        return { ok: true, status: 204, data: {} };
      }
      return { ok: false, status: 400, data: {} };
    },
  };
  return io;
}

const OWN = eventIdFor(UID, 't1');
const live = (w) => Object.values(w.events).filter((e) => e.status !== 'cancelled');

console.log('create');
let w = world({ t1: { ...base } });
check('touched', await syncTask(w, UID, 't1'), true);
check('one event, under the task\'s own id', live(w).map((e) => e.id), [OWN]);
check('id is valid for Google (base32hex, 5–1024)', /^[0-9a-v]{5,1024}$/.test(OWN), true);
check('the task remembers it', w.tasks.t1.calendarEventId, OWN);
check('and what was sent', typeof w.tasks.t1.calendarSync, 'string');
check('again → nothing sent', [await syncTask(w, UID, 't1'), w.calls.length], [false, 1]);

console.log('the same request twice');
w = world({ t1: { ...base } });
await syncTask(w, UID, 't1');
w.tasks.t1.calendarEventId = null; // as if the first answer never got saved
w.tasks.t1.calendarSync = null;
await syncTask(w, UID, 't1');
check('still one event', live(w).length, 1);
check('linked again', w.tasks.t1.calendarEventId, OWN);

console.log('move, done, undo');
w = world({ t1: { ...base } });
await syncTask(w, UID, 't1');
w.tasks.t1.scheduledAt = new Date('2026-11-18T09:00:00Z');
await syncTask(w, UID, 't1');
check('same event, new time', [live(w).length, w.events[OWN].start.dateTime], [1, '2026-11-18T09:00:00.000Z']);
w.events[OWN].start = { dateTime: 'moved-by-hand' };
w.tasks.t1.status = 'done';
w.tasks.t1.doneAt = AT;
await syncTask(w, UID, 't1');
check('done adds ✓ and leaves the time alone', [w.events[OWN].summary, w.events[OWN].start.dateTime], ['✓ לתקן את הקרש', 'moved-by-hand']);
w.tasks.t1.status = 'open';
w.tasks.t1.doneAt = null;
await syncTask(w, UID, 't1');
check('undone removes it', w.events[OWN].summary, 'לתקן את הקרש');

console.log('remove');
w = world({ t1: { ...base } });
await syncTask(w, UID, 't1');
w.tasks.t1.status = 'someday';
await syncTask(w, UID, 't1');
check('someday → event gone, link cleared', [live(w).length, w.tasks.t1.calendarEventId, w.tasks.t1.calendarSync], [0, null, null]);
w.tasks.t1.status = 'open';
await syncTask(w, UID, 't1');
check('back to open → the event returns', [live(w).length, w.tasks.t1.calendarEventId], [1, OWN]);

w = world({ t1: { ...base } });
await syncTask(w, UID, 't1');
delete w.tasks.t1;
check('task deleted → touched', await syncTask(w, UID, 't1'), true);
check('its event is gone', live(w).length, 0);
check('nothing recreated for it', w.tasks.t1, undefined);

w = world({});
check('a task that never had an event: deleting is quiet', [await syncTask(w, UID, 'ghost'), w.calls], [true, [`DELETE /${eventIdFor(UID, 'ghost')}`]]);

console.log('only ג׳ימי\'s events are deleted');
w = world({ t1: { ...base, status: 'someday', calendarEventId: 'theirs' } }, { theirs: { id: 'theirs', status: 'confirmed', summary: 'רופא שיניים' } });
await syncTask(w, UID, 't1');
check('an unmarked event stays', [live(w).map((e) => e.summary), w.calls], [['רופא שיניים'], ['GET /theirs']]);
check('but the task lets go of it', w.tasks.t1.calendarEventId, null);
w = world({ t1: { ...base, status: 'someday', calendarEventId: 'marked' } }, { marked: { id: 'marked', status: 'confirmed', extendedProperties: { private: { gymi: 'true' } } } });
await syncTask(w, UID, 't1');
check('a marked one goes', live(w).length, 0);

console.log('deleted by hand in the calendar');
w = world({ t1: { ...base } });
await syncTask(w, UID, 't1');
w.events[OWN].status = 'cancelled';
w.tasks.t1.title = 'שם אחר';
await syncTask(w, UID, 't1');
check('a rename doesn\'t bring it back', [live(w).length, w.tasks.t1.calendarEventId], [0, null]);
w.tasks.t1.status = 'done';
await syncTask(w, UID, 't1');
check('nor does done', live(w).length, 0);
w.tasks.t1.status = 'open';
w.tasks.t1.scheduledAt = new Date('2026-11-20T16:00:00Z');
await syncTask(w, UID, 't1');
check('a new time does', [live(w).length, w.events[OWN].start.dateTime, w.tasks.t1.calendarEventId], [1, '2026-11-20T16:00:00.000Z', OWN]);

w = world({ t1: { ...base } });
await syncTask(w, UID, 't1');
w.events[OWN].status = 'cancelled';
w.tasks.t1.scheduledAt = new Date('2026-11-21T16:00:00Z');
await syncTask(w, UID, 't1');
check('deleted, then moved in one go → back at the new time', [live(w).length, w.events[OWN].start.dateTime], [1, '2026-11-21T16:00:00.000Z']);

console.log('tasks with no event');
w = world({ inbox: { title: 'x', type: 'once', status: 'inbox' }, daily: { title: 'y', type: 'daily', status: 'open' } });
check('nothing is sent', [await syncTask(w, UID, 'inbox'), await syncTask(w, UID, 'daily'), w.calls.length], [false, false, 0]);

console.log('a batch');
w = world({ a: { ...base }, b: { ...base, title: 'ב' }, c: { title: 'z', type: 'once', status: 'inbox' } });
const failing = { ...w, call: async (method, path, body) => (body?.summary === 'ב' ? { ok: false, status: 500, data: {} } : w.call(method, path, body)) };
const res = await syncAll(failing, UID, ['a', 'b', 'c']);
check('one failure doesn\'t stop the rest', [res.touched, live(w).length], [1, 1]);
check('settled ones are reported, with or without an event', res.done, ['a', 'c']);
check('the failed one is named, with the reason', [res.failed.map((f) => f.id), res.failed[0].message], [['b'], 'calendar insert failed: 500 ']);
check('the failed one stays unlinked, to be tried again', w.tasks.b.calendarEventId, undefined);
const again = await syncAll(w, UID, ['a', 'b', 'c']);
check('the next try finishes it, sending only what is missing', [again.touched, again.done.length, again.failed, live(w).length], [1, 3, [], 2]);

// Several at a time: every task still gets exactly one event.
const many = {};
for (let i = 0; i < 23; i += 1) many[`m${i}`] = { ...base, title: `משימה ${i}` };
w = world(many);
let inFlight = 0;
let widest = 0;
const slow = {
  ...w,
  call: async (...args) => {
    inFlight += 1;
    widest = Math.max(widest, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight -= 1;
    return w.call(...args);
  },
};
const wide = await syncAll(slow, UID, Object.keys(many), () => false, 4);
check('23 tasks, four at a time', [wide.touched, wide.done.length, wide.failed.length, live(w).length], [23, 23, 0, 23]);
check('never more than four calls in the air', widest <= 4 && widest > 1, true);
check('one call per task, none sent twice', w.calls.length, 23);
check('an empty list is fine', await syncAll(w, UID, [], () => false, 4), { touched: 0, done: [], failed: [] });

let stopped = false;
try {
  await syncAll({ ...w, readTask: async () => { throw new Error('no consent'); } }, UID, ['a', 'b'], () => true);
} catch {
  stopped = true;
}
check('no consent stops at once', stopped, true);

console.log('what the card gets');
// A Firestore Timestamp, as far as the server code can tell.
const stamp = (millis) => ({ toMillis: () => millis, _seconds: millis / 1000, _nanoseconds: 0 });
const card = forCard({
  connected: true, email: 'a@b.c', connectedAt: stamp(1000), lastSyncAt: stamp(2000), needsReconnect: false,
  lastError: { at: stamp(3000), count: 2, message: 'calendar insert failed: 403 Rate Limit Exceeded' },
});
check('times are plain milliseconds', [card.connectedAt, card.lastSyncAt, card.lastError.at], [1000, 2000, 3000]);
check('which survive the trip as JSON', JSON.parse(JSON.stringify(card)).lastSyncAt, 2000);
check('the failure comes along', [card.lastError.count, card.lastError.message], [2, 'calendar insert failed: 403 Rate Limit Exceeded']);
check('never synced yet', forCard({ connected: true, email: 'a@b.c', lastSyncAt: null }), { connected: true, email: 'a@b.c', needsReconnect: false, connectedAt: null, lastSyncAt: null, lastError: null });
check('not connected', forCard(null), null);
check('no refresh token or other field leaks through', Object.keys(forCard({ connected: true, refreshToken: 'x', extra: 1 })).sort(), ['connected', 'connectedAt', 'email', 'lastError', 'lastSyncAt', 'needsReconnect']);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
