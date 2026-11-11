// The Claude connector (M11): key hashing, argument validation, the
// JSON-RPC layer and every write tool's document shape, against an
// in-memory store — no Firebase, no network:
//   node tools/test-mcp.mjs
// Exits non-zero if any case fails. Runs in Israel time, like the server.
//
// Dates: 2026-11-10 is a Tuesday; "now" is 2026-11-10 20:00 Israel time.

process.env.TZ = 'Asia/Jerusalem';

const { generateKey, isKeyShaped, hashKey, keyPreview, connectorUrl } = await import('../js/lib/mcp-keys.js');
const { validateArgs } = await import('../api/_lib/schema.js');
const { TOOLS, callTool, buildMark } = await import('../api/_lib/tools.js');
const { handleBody } = await import('../api/_lib/rpc.js');
const { normalizeHabit } = await import('../js/lib/habits.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}\n     expected ${e}\n     got      ${a}`);
  }
}

// ---------- keys ----------

const key = generateKey();
check('key shape', isKeyShaped(key), true);
check('key length', key.length, 48);
check('two keys differ', generateKey() === key, false);
check('wrong prefix refused', isKeyShaped(`abcd_${key.slice(5)}`), false);
check('short key refused', isKeyShaped(key.slice(0, -1)), false);
check('non-string refused', isKeyShaped(undefined), false);
check('sha-256 known vector', await hashKey('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('hash is stable', await hashKey(key), await hashKey(key));
check('hash is 64 hex', /^[0-9a-f]{64}$/.test(await hashKey(key)), true);
check('preview', keyPreview('gymi_AbCdEfGh'), 'gymi_AbCd');
check('connector url', connectorUrl('https://x.app', 'gymi_a-b_c'), 'https://x.app/api/mcp?key=gymi_a-b_c');

// ---------- argument validation ----------

const schemaOf = (name) => TOOLS.find((t) => t.name === name).inputSchema;
const meal = { date: '2026-11-10', mealType: 'lunch', description: 'סלט', calories: 400, proteinG: 30, carbsG: 20, fatG: 10 };
check('meal ok', validateArgs(schemaOf('log_meal'), meal).ok, true);
check('unknown arg', validateArgs(schemaOf('log_meal'), { ...meal, calorie: 1 }).error, 'calorie: unknown argument');
check('missing arg', validateArgs(schemaOf('log_meal'), { ...meal, fatG: undefined }).error, 'fatG: required');
check('string number refused', validateArgs(schemaOf('log_meal'), { ...meal, calories: '400' }).error, 'calories: expected number');
check('over range', validateArgs(schemaOf('log_meal'), { ...meal, calories: 9000 }).error, 'calories: above 5000');
check('bad date format', validateArgs(schemaOf('log_meal'), { ...meal, date: '10/11/2026' }).ok, false);
check('bad clock', validateArgs(schemaOf('log_meal'), { ...meal, time: '25:00' }).ok, false);
check('empty description', validateArgs(schemaOf('log_meal'), { ...meal, description: '  ' }).error, 'description: empty');
check('days default', validateArgs(schemaOf('get_sleep'), {}).value, { days: 7 });
check('days max', validateArgs(schemaOf('get_sleep'), { days: 61 }).error, 'days: above 60');
check('days integer', validateArgs(schemaOf('get_sleep'), { days: 1.5 }).error, 'days: expected integer');
check('enum', validateArgs(schemaOf('mark_habit'), { habitId: 'h1', date: '2026-11-10', level: 'half' }).ok, false);
check('array items', validateArgs(schemaOf('mark_habit'), { habitId: 'h1', date: '2026-11-10', stepsDone: [0, -1] }).error, 'stepsDone[1]: below 0');
check('habit id path chars refused', validateArgs(schemaOf('mark_habit'), { habitId: '../x', date: '2026-11-10', level: 'full' }).ok, false);
check('no delete tools', TOOLS.filter((t) => /delete|remove/.test(t.name)).length, 0);

// ---------- a fake store ----------

const UID = 'user-a';
const NOW = new Date(2026, 10, 10, 20, 0);
const ts = (d) => ({ toDate: () => d });
function makeStore(seed = {}) {
  const docs = new Map(Object.entries(seed)); // "users/{uid}/{coll}/{id}" → data
  const uids = new Set();
  const inColl = (uid, coll) => {
    uids.add(uid);
    const prefix = `users/${uid}/${coll}/`;
    return [...docs].filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, d]) => ({ id: p.slice(prefix.length), ...d }));
  };
  const time = (v) => (v?.toDate ? v.toDate().getTime() : NaN);
  let n = 0;
  return {
    docs,
    uids,
    async userDoc(uid) { uids.add(uid); return docs.get(`users/${uid}`) || {}; },
    async getDoc(uid, coll, id) { uids.add(uid); const d = docs.get(`users/${uid}/${coll}/${id}`); return d ? { id, ...d } : null; },
    async listAll(uid, coll) { return inColl(uid, coll); },
    async listDated(uid, coll, from, to) { return inColl(uid, coll).filter((d) => d.date >= from && d.date <= to); },
    async listTimed(uid, coll, f, from, to) { return inColl(uid, coll).filter((d) => time(d[f]) >= from.getTime() && time(d[f]) < to.getTime()); },
    async listSince(uid, coll, f, since) { return inColl(uid, coll).filter((d) => time(d[f]) > since.getTime()); },
    async setDoc(uid, coll, id, data, { merge = false } = {}) {
      uids.add(uid);
      const p = `users/${uid}/${coll}/${id}`;
      const old = docs.get(p) || {};
      if (!merge) return docs.set(p, data);
      const out = { ...old, ...data };
      if (data.habits) out.habits = { ...(old.habits || {}), ...data.habits };
      return docs.set(p, out);
    },
    async addDoc(uid, coll, data) { uids.add(uid); n += 1; docs.set(`users/${uid}/${coll}/new${n}`, data); return `new${n}`; },
    timestamp: ts,
    serverTimestamp: () => 'SERVER_TS',
  };
}

const ctxFor = (store) => ({ store, uid: UID, now: NOW, lastCheckAt: null, markChecked: async () => { store.checked = true; } });
const run = async (store, name, args) => {
  const r = await callTool(name, args, ctxFor(store));
  return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text);
};
const local = (d) => d.toDate().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).slice(0, 16);

// ---------- log_meal ----------

let s = makeStore();
let r = await run(s, 'log_meal', { ...meal, time: '13:40', proteinG: 30.26 });
let doc = s.docs.get('users/user-a/nutritionEntries/new1');
check('meal fields', Object.keys(doc), ['date', 'mealType', 'description', 'calories', 'proteinG', 'carbsG', 'fatG', 'source']);
check('meal time', local(doc.date), '2026-11-10 13:40');
check('meal source', doc.source, 'coach');
check('meal protein rounded', doc.proteinG, 30.3);
await run(s, 'log_meal', { ...meal, date: '2026-11-09' });
check('meal date only = noon', local(s.docs.get('users/user-a/nutritionEntries/new2').date), '2026-11-09 12:00');
check('meal future refused', (await run(s, 'log_meal', { ...meal, date: '2026-11-11' })).error.includes('future'), true);
check('meal too old refused', (await run(s, 'log_meal', { ...meal, date: '2026-10-01' })).error.includes('days back'), true);
check('meal impossible date', (await run(s, 'log_meal', { ...meal, date: '2026-02-31' })).error.includes('not a real date'), true);
r = await run(s, 'log_meal', { ...meal, calories: 100 });
check('meal day totals', r.dayTotals.calories, 500);

// ---------- log_weight ----------

s = makeStore({ 'users/user-a/bodyWeight/2026-11-09': { date: '2026-11-09', kg: 80 } });
await run(s, 'log_weight', { date: '2026-11-10', kg: 79.456 });
check('weight doc', s.docs.get('users/user-a/bodyWeight/2026-11-10'), { date: '2026-11-10', kg: 79.46, note: '', loggedAt: 'SERVER_TS', source: 'coach' });
check('weight overwrite refused', (await run(s, 'log_weight', { date: '2026-11-09', kg: 79 })).error.includes('replace: true'), true);
check('weight kept', s.docs.get('users/user-a/bodyWeight/2026-11-09').kg, 80);
await run(s, 'log_weight', { date: '2026-11-09', kg: 79, replace: true });
check('weight replaced on request', s.docs.get('users/user-a/bodyWeight/2026-11-09').kg, 79);

// ---------- log_sleep ----------

s = makeStore();
r = await run(s, 'log_sleep', { date: '2026-11-10', bedtime: '22:15', wakeTime: '06:30' });
doc = s.docs.get('users/user-a/sleep/2026-11-10');
check('sleep bedtime is the evening before', local(doc.bedtime), '2026-11-09 22:15');
check('sleep wake', local(doc.wakeTime), '2026-11-10 06:30');
check('sleep duration', doc.durationMin, 495);
check('sleep stamps', [doc.source, doc.createdAt, doc.updatedAt], ['coach', 'SERVER_TS', 'SERVER_TS']);
check('sleep graded', r.written.grade, 'full');
check('sleep twice refused', (await run(s, 'log_sleep', { date: '2026-11-10', bedtime: '23:00', wakeTime: '07:00' })).error.includes('replace: true'), true);
check('sleep past midnight', local((await (async () => {
  await run(s, 'log_sleep', { date: '2026-11-09', bedtime: '00:40', wakeTime: '08:50' });
  return s.docs.get('users/user-a/sleep/2026-11-09');
})()).bedtime), '2026-11-09 00:40');
check('sleep wake before bed refused', (await run(s, 'log_sleep', { date: '2026-11-08', bedtime: '06:00', wakeTime: '05:00' })).error.includes('after bedtime'), true);

// ---------- mark_habit ----------

const habits = {
  'users/user-a/habits/read': { name: 'קריאה', measure: 'quantity', unit: 'דקות', full: 20, short: 10, active: true },
  'users/user-a/habits/water': { name: 'מים', measure: 'yesno', full: null, short: null, active: true },
  'users/user-a/habits/morning': { name: 'בוקר', measure: 'steps', steps: ['מים', 'מיטה', 'מתיחות'], shortSteps: [0, 1], active: true },
  'users/user-a/habits/nails': { name: 'ציפורניים', kind: 'bad', measure: 'slips', active: true },
  'users/user-a/habits/insta': { name: 'אינסטגרם', kind: 'bad', measure: 'limit', full: 30, short: 45, unit: 'דקות', active: true },
  'users/user-a/habitLogs/2026-11-10': { date: '2026-11-10', habits: { water: { level: 'full', value: null, source: 'manual' } } },
};
s = makeStore(habits);
await run(s, 'mark_habit', { habitId: 'read', date: '2026-11-10', value: 12 });
let day = s.docs.get('users/user-a/habitLogs/2026-11-10');
check('quantity → short', day.habits.read, { level: 'short', value: 12, source: 'coach' });
check('other habit kept', day.habits.water, { level: 'full', value: null, source: 'manual' });
check('habits written as a nested map', Object.keys(day).some((k) => k.startsWith('habits.')), false);
check('yesno short refused', (await run(s, 'mark_habit', { habitId: 'water', date: '2026-11-10', level: 'short' })).error.includes('no short'), true);
await run(s, 'mark_habit', { habitId: 'morning', date: '2026-11-10', stepsDone: [1, 0, 0, 9] });
check('routine short', s.docs.get('users/user-a/habitLogs/2026-11-10').habits.morning, { level: 'short', value: null, stepsDone: [0, 1], source: 'coach' });
await run(s, 'mark_habit', { habitId: 'nails', date: '2026-11-10', slipAt: '21:40' });
await run(s, 'mark_habit', { habitId: 'nails', date: '2026-11-10', slipAt: '22:15' });
const nails = s.docs.get('users/user-a/habitLogs/2026-11-10').habits.nails;
check('slips appended', nails.slips.map(local), ['2026-11-10 21:40', '2026-11-10 22:15']);
check('two slips → none', [nails.value, nails.level, nails.clean], [2, 'none', false]);
check('clean after a slip refused', (await run(s, 'mark_habit', { habitId: 'nails', date: '2026-11-10', clean: true })).error.includes('slip wins'), true);
await run(s, 'mark_habit', { habitId: 'nails', date: '2026-11-09', clean: true });
check('clean day', s.docs.get('users/user-a/habitLogs/2026-11-09').habits.nails, { clean: true, slips: [], value: 0, level: 'full', source: 'coach' });
await run(s, 'mark_habit', { habitId: 'insta', date: '2026-11-09', value: 40 });
check('limit habit', s.docs.get('users/user-a/habitLogs/2026-11-09').habits.insta, { clean: false, slips: [], value: 40, level: 'short', source: 'coach' });
check('slip on a limit habit refused', (await run(s, 'mark_habit', { habitId: 'insta', date: '2026-11-09', slipAt: '10:00' })).error.includes('limit'), true);
check('unknown habit', (await run(s, 'mark_habit', { habitId: 'nope', date: '2026-11-10', level: 'full' })).error.includes('get_habits'), true);
check('good habit needs level', (() => {
  try { buildMark(normalizeHabit({ name: 'x', measure: 'yesno' }), { date: '2026-11-10' }, null, ts); return 'no error'; } catch (e) { return e.message.includes('level'); }
})(), true);

// ---------- log_daily_activity ----------

s = makeStore({ 'users/user-a/dailyActivity/2026-11-10': { date: '2026-11-10', steps: 3000, stepsKcal: 120, baseKcal: 2000, workoutKcal: 310, totalOutKcal: 2430, note: 'x', source: 'workouts' } });
await run(s, 'log_daily_activity', { date: '2026-11-10', steps: 12000 });
check('activity merged, workout burn kept', s.docs.get('users/user-a/dailyActivity/2026-11-10'),
  { date: '2026-11-10', steps: 12000, stepsKcal: 480, baseKcal: 2000, workoutKcal: 310, totalOutKcal: 2790, note: 'x', source: 'coach', loggedAt: 'SERVER_TS' });
check('lower steps refused', (await run(s, 'log_daily_activity', { date: '2026-11-10', steps: 100 })).error.includes('replace: true'), true);
await run(s, 'log_daily_activity', { date: '2026-11-09', steps: 5000 });
check('new day doc', s.docs.get('users/user-a/dailyActivity/2026-11-09'),
  { date: '2026-11-09', steps: 5000, stepsKcal: 200, totalOutKcal: 2150, loggedAt: 'SERVER_TS', source: 'coach', baseKcal: 1950, workoutKcal: 0, note: '' });

// ---------- reads ----------

s = makeStore({
  ...habits,
  'users/user-a': { proteinTarget: 140 },
  'users/user-a/nutritionEntries/m1': { date: ts(new Date(2026, 10, 10, 13, 0)), mealType: 'lunch', description: 'עוף', calories: 600, proteinG: 50, carbsG: 40, fatG: 10, source: 'manual' },
  'users/user-a/nutritionEntries/m0': { date: ts(new Date(2026, 10, 9, 23, 30)), mealType: 'snack', description: 'אתמול', calories: 200, proteinG: 5, carbsG: 30, fatG: 5, source: 'manual' },
  'users/user-a/pointsLedger/2026-11-10_meal-log_m1': { date: '2026-11-10', rule: 'meal-log', points: 5, updatedAt: ts(new Date(2026, 10, 10, 13, 1)) },
  'users/user-b/nutritionEntries/x': { date: ts(new Date(2026, 10, 10, 9, 0)), calories: 999 },
});
r = await run(s, 'get_today', {});
check('today meals (own user, own day)', [r.nutrition.count, r.nutrition.calories, r.nutrition.proteinTarget], [1, 600, 140]);
check('today habit marks', r.habits.find((h) => h.id === 'water').level, 'full');
check('today points', r.points.today, 5);
r = await run(s, 'get_meals', { days: 2 });
check('meals by day', r.days.map((d) => [d.date, d.calories]), [['2026-11-10', 600], ['2026-11-09', 200]]);
r = await run(s, 'get_changes', { since: '2026-11-10T12:00:00+02:00' });
check('changes since', Object.keys(r.changes).sort(), ['nutritionEntries', 'pointsLedger']);
check('changes moves the mark', s.checked, true);
s.checked = false;
await run(s, 'get_changes', { peek: true });
check('peek leaves the mark', s.checked, false);
check('bad since', (await run(s, 'get_changes', { since: 'yesterday' })).error.includes('since'), true);
check('only the key\'s uid touched', [...s.uids], [UID]);

// ---------- JSON-RPC ----------

const ctx = ctxFor(makeStore());
r = await handleBody({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }, ctx);
check('initialize version', r.result.protocolVersion, '2025-06-18');
check('initialize tools capability', r.result.capabilities.tools !== undefined, true);
r = await handleBody({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, ctx);
check('unknown version → latest', r.result.protocolVersion, '2025-11-25');
check('notification → no body', await handleBody({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx), null);
r = await handleBody({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, ctx);
check('tools listed', r.result.tools.length, 14);
check('tool shape', Object.keys(r.result.tools[0]), ['name', 'title', 'description', 'inputSchema', 'annotations']);
r = await handleBody({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } }, ctx);
check('unknown tool', r.error.code, -32602);
r = await handleBody({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'log_weight', arguments: { date: '2026-11-10' } } }, ctx);
check('bad args → isError result', [r.result.isError, r.result.content[0].text], [true, 'Invalid arguments: kg: required']);
r = await handleBody({ jsonrpc: '2.0', id: 6, method: 'foo/bar' }, ctx);
check('unknown method', r.error.code, -32601);
r = await handleBody([{ jsonrpc: '2.0', id: 7, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }], ctx);
check('batch', r, [{ jsonrpc: '2.0', id: 7, result: {} }]);
r = await handleBody({ id: 8, method: 'ping' }, ctx);
check('not json-rpc 2.0', r.error.code, -32600);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
