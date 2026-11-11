// The Claude connector's tools (M11): what each user's Claude can read and
// write in their own ג׳ימי. Every handler gets ctx = { store, uid, now,
// lastCheckAt, markChecked } — `store` (api/_lib/store.js) is the only
// thing that touches Firestore, and every call carries the key's own uid,
// so a tool can't reach another user's data. No delete tools.
//
// Writes follow docs/DATA.md exactly, with source 'coach'. The server
// runs in UTC, so api/mcp.js sets TZ=Asia/Jerusalem before anything here
// builds a Date — the app's helpers (local noon, day keys) then agree with
// the phone. Limits: MCP in js/lib/rules.js.

import { MCP, ACTIVITY } from '../../js/lib/rules.js';
import { buildNight, evaluateNight, nightGrade, sleepSettings, parseKey, shiftDays } from '../../js/lib/sleep.js';
import {
  normalizeHabit, entryFor, habitContext, isDue, isBad, levelFor, routineLevel, badDayLevel, slipsOf,
} from '../../js/lib/habits.js';
import { nutritionGoals, weeklyWorkoutGoal, rewardsSummary } from '../../js/lib/rewards.js';
import { totalOut, stepsKcal } from '../../js/lib/daily-activity.js';
import { israelDateKey } from '../../js/lib/steps-import.js';
import { workoutKind } from '../../js/lib/workout-types.js';
import { validateArgs } from './schema.js';

// ---------- argument shapes ----------

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'yyyy-mm-dd (Israel date)' };
const CLOCK = { type: 'string', pattern: '^([01]?\\d|2[0-3]):[0-5]\\d$', description: 'hh:mm, 24h, Israel time' };
const DAYS = { type: 'integer', minimum: 1, maximum: MCP.maxDays, default: MCP.defaultDays, description: `Days back, today included (1–${MCP.maxDays})` };
const range = ([minimum, maximum], description) => ({ type: 'number', minimum, maximum, description });
const REPLACE = { type: 'boolean', default: false, description: 'Overwrite the day\'s existing entry. Only after the user said so.' };

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// ---------- helpers ----------

const ISRAEL = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const asDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);

// Firestore values → plain JSON: Timestamps become "yyyy-mm-dd hh:mm"
// (Israel time), sentinels and undefined drop out.
export function plain(value) {
  const d = asDate(value);
  if (d) return ISRAEL.format(d);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = plain(v);
    return out;
  }
  return value;
}

// The local moment of `hhmm` on `key` (local noon without a time).
function localMoment(key, hhmm) {
  const d = parseKey(key);
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

const dayBounds = (key) => {
  const start = parseKey(key);
  start.setHours(0, 0, 0, 0);
  const end = parseKey(shiftDays(key, 1));
  end.setHours(0, 0, 0, 0);
  return [start, end];
};

// A real calendar date, not in the future, at most writeDaysBack ago.
function writableDate(key, today) {
  if (shiftDays(key, 0) !== key) return `date ${key} is not a real date`;
  if (key > today) return `date ${key} is in the future (today is ${today})`;
  if (key < shiftDays(today, -MCP.writeDaysBack)) return `date ${key} is more than ${MCP.writeDaysBack} days back`;
  return null;
}

class ToolError extends Error {}
const fail = (msg) => { throw new ToolError(msg); };

const round = (n, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const sum = (list, f) => list.reduce((s, x) => s + (Number(x[f]) || 0), 0);

function mealTotals(meals) {
  return {
    count: meals.length,
    calories: round(sum(meals, 'calories')),
    proteinG: round(sum(meals, 'proteinG'), 1),
    carbsG: round(sum(meals, 'carbsG'), 1),
    fatG: round(sum(meals, 'fatG'), 1),
  };
}

const habitBrief = (h) => ({
  id: h.id, name: h.name, kind: h.kind, measure: h.measure, unit: h.unit, full: h.full, short: h.short,
  schedule: h.schedule, area: h.area, active: h.active, autoSource: h.autoSource,
  ...(h.steps.length ? { steps: h.steps, shortSteps: h.shortSteps } : {}),
  ...(h.parts.length ? { parts: h.parts } : {}),
  ...(h.why ? { why: h.why } : {}),
  ...(isBad(h) ? { trigger: h.trigger, replacement: h.replacement, cleanWeekTarget: h.cleanWeekTarget } : {}),
});

function workoutBrief(w) {
  const k = workoutKind(w);
  return {
    id: w.id,
    start: plain(w.startTime || w.date),
    end: plain(w.endTime),
    noTime: !!w.noTime,
    kcal: w.kcal ?? null,
    kind: k.kind,
    exercises: (w.exercises || []).map((ex) => ex.name),
    ...(w.notes ? { notes: w.notes } : {}),
  };
}

function nightOut(n, settings) {
  const ev = evaluateNight(n, settings);
  return {
    date: n.date, bedtime: plain(n.bedtime), wakeTime: plain(n.wakeTime), durationMin: n.durationMin,
    grade: nightGrade(ev), onTime: ev.onTime, duration: ev.duration, flexibleNight: ev.flexible, source: n.source,
  };
}

async function loadHabits(ctx) {
  const all = await ctx.store.listAll(ctx.uid, 'habits');
  return all.map(normalizeHabit).filter((h) => h.active).sort((a, b) => a.order - b.order);
}

// One habit's day as the app reads it.
function habitDay(h, key, hctx) {
  if (isBad(h)) {
    const mark = hctx.logsByDate.get(key)?.habits?.[h.id] || null;
    return { level: badDayLevel(h, mark), slips: slipsOf(mark).length, value: mark?.value ?? null };
  }
  const e = entryFor(h, key, hctx);
  return { level: e?.level ?? null, value: e?.value ?? null, auto: e?.auto ?? false, due: isDue(h, key) };
}

// ---------- read tools ----------

async function getToday({ date }, ctx) {
  const key = date || israelDateKey(ctx.now);
  const { store, uid } = ctx;
  const [start, end] = dayBounds(key);
  const [userDoc, night, meals, weight, activity, plan, habits, logs, workouts, ledger] = await Promise.all([
    store.userDoc(uid),
    store.getDoc(uid, 'sleep', key),
    store.listTimed(uid, 'nutritionEntries', 'date', start, end),
    store.getDoc(uid, 'bodyWeight', key),
    store.getDoc(uid, 'dailyActivity', key),
    store.getDoc(uid, 'plannedWorkouts', key),
    loadHabits(ctx),
    store.listDated(uid, 'habitLogs', key, key),
    store.listTimed(uid, 'workouts', 'startTime', start, end),
    store.listAll(uid, 'pointsLedger'),
  ]);
  const goals = nutritionGoals(userDoc);
  const out = totalOut(activity);
  const hctx = habitContext(logs, activity ? [activity] : [], workouts);
  const pts = rewardsSummary(ledger, key);
  return {
    date: key,
    sleep: night ? nightOut(night, sleepSettings(userDoc)) : null,
    nutrition: {
      ...mealTotals(meals),
      calorieTarget: out !== null ? out - goals.calorieDeficit : goals.calorieTarget,
      proteinTarget: goals.proteinTarget,
      meals: meals.map((m) => ({ id: m.id, time: plain(m.date), mealType: m.mealType, description: m.description, calories: m.calories, proteinG: m.proteinG })),
    },
    activity: activity ? { steps: activity.steps ?? 0, totalOutKcal: out, workoutKcal: activity.workoutKcal ?? 0 } : null,
    weightKg: weight ? weight.kg : null,
    habits: habits.map((h) => ({ id: h.id, name: h.name, kind: h.kind, measure: h.measure, unit: h.unit, full: h.full, ...habitDay(h, key, hctx) })),
    workouts: workouts.map(workoutBrief),
    plannedWorkout: plan ? { title: plan.title, status: plan.status } : null,
    points: { today: pts.today, total: pts.total, level: pts.level.level, levelName: pts.level.name, toNextLevel: pts.level.toNext },
  };
}

async function getHabits({ days }, ctx) {
  const today = israelDateKey(ctx.now);
  const from = shiftDays(today, -(days - 1));
  const [habits, logs, acts, workouts] = await Promise.all([
    loadHabits(ctx),
    ctx.store.listDated(ctx.uid, 'habitLogs', from, today),
    ctx.store.listDated(ctx.uid, 'dailyActivity', from, today),
    ctx.store.listTimed(ctx.uid, 'workouts', 'startTime', dayBounds(from)[0], dayBounds(today)[1]),
  ]);
  const hctx = habitContext(logs, acts, workouts);
  const keys = [];
  for (let k = today; k >= from; k = shiftDays(k, -1)) keys.push(k);
  return {
    habits: habits.map((h) => ({
      ...habitBrief(h),
      days: Object.fromEntries(keys.map((k) => [k, habitDay(h, k, hctx)])),
    })),
  };
}

async function getSleep({ days }, ctx) {
  const today = israelDateKey(ctx.now);
  const [userDoc, nights] = await Promise.all([
    ctx.store.userDoc(ctx.uid),
    ctx.store.listDated(ctx.uid, 'sleep', shiftDays(today, -(days - 1)), today),
  ]);
  const settings = sleepSettings(userDoc);
  return { settings, nights: nights.sort((a, b) => (a.date < b.date ? 1 : -1)).map((n) => nightOut(n, settings)) };
}

async function getMeals({ days }, ctx) {
  const today = israelDateKey(ctx.now);
  const from = shiftDays(today, -(days - 1));
  const meals = await ctx.store.listTimed(ctx.uid, 'nutritionEntries', 'date', dayBounds(from)[0], dayBounds(today)[1]);
  const byDay = new Map();
  for (const m of meals) {
    const k = israelDateKey(asDate(m.date));
    byDay.set(k, [...(byDay.get(k) || []), m]);
  }
  return {
    days: [...byDay.keys()].sort().reverse().map((k) => ({
      date: k,
      ...mealTotals(byDay.get(k)),
      meals: byDay.get(k).map((m) => ({ id: m.id, ...plain(m) })),
    })),
  };
}

async function getWorkouts({ days, full }, ctx) {
  const today = israelDateKey(ctx.now);
  const from = shiftDays(today, -(days - 1));
  const list = await ctx.store.listTimed(ctx.uid, 'workouts', 'startTime', dayBounds(from)[0], dayBounds(today)[1], MCP.maxWorkouts);
  list.sort((a, b) => asDate(b.startTime) - asDate(a.startTime));
  return { workouts: list.map((w) => (full ? { id: w.id, ...plain(w) } : workoutBrief(w))) };
}

async function getWeights({ days }, ctx) {
  const today = israelDateKey(ctx.now);
  const list = await ctx.store.listDated(ctx.uid, 'bodyWeight', shiftDays(today, -(days - 1)), today);
  const weights = list.sort((a, b) => (a.date < b.date ? 1 : -1)).map((w) => ({ date: w.date, kg: w.kg, ...(w.note ? { note: w.note } : {}) }));
  const avg = weights.length ? round(sum(weights, 'kg') / weights.length, 2) : null;
  return { weights, averageKg: avg };
}

async function getPoints({ days }, ctx) {
  const today = israelDateKey(ctx.now);
  const ledger = await ctx.store.listAll(ctx.uid, 'pointsLedger');
  const s = rewardsSummary(ledger, today);
  const from = shiftDays(today, -(days - 1));
  return {
    total: s.total,
    today: s.today,
    level: { level: s.level.level, name: s.level.name, toNext: s.level.toNext, next: s.level.next?.name ?? null, unlock: s.level.unlock },
    byDay: [...s.byDay].filter(([d]) => d >= from).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, points]) => ({ date, points })),
    badges: s.badges.filter((b) => b.earnedOn).map((b) => ({ name: b.name, earnedOn: b.earnedOn })),
    recent: ledger.filter((e) => e.date >= from).sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((e) => ({ date: e.date, rule: e.rule, points: e.points, reason: e.reason })),
  };
}

async function getProfile(_args, ctx) {
  const [userDoc, library] = await Promise.all([
    ctx.store.userDoc(ctx.uid),
    ctx.store.listAll(ctx.uid, 'exerciseLibrary'),
  ]);
  return {
    today: israelDateKey(ctx.now),
    nutrition: nutritionGoals(userDoc),
    sleep: sleepSettings(userDoc),
    weeklyWorkoutGoal: weeklyWorkoutGoal(userDoc),
    rewardGoal: userDoc.rewardGoal ?? null,
    exerciseNames: library.map((e) => e.name).sort(),
  };
}

// Collections and the field that moves when a doc changes. Meals and
// workouts carry no "updated" stamp, so new ones are found by their own
// date (an edit of an older one doesn't show).
const CHANGE_FIELDS = [
  ['sleep', 'updatedAt'],
  ['habits', 'updatedAt'],
  ['habitLogs', 'updatedAt'],
  ['bodyWeight', 'loggedAt'],
  ['dailyActivity', 'loggedAt'],
  ['plannedWorkouts', 'updatedAt'],
  ['pointsLedger', 'updatedAt'],
  ['libraryPicks', 'createdAt'],
  ['nutritionEntries', 'date'],
  ['workouts', 'startTime'],
];

async function getChanges({ since, peek }, ctx) {
  let from;
  if (since) {
    from = new Date(since);
    if (Number.isNaN(from.getTime())) fail('since: not a date — use ISO, e.g. 2026-11-10T08:00:00+02:00');
  } else {
    from = ctx.lastCheckAt || new Date(ctx.now.getTime() - MCP.changesDefaultHours * 3600 * 1000);
  }
  const lists = await Promise.all(CHANGE_FIELDS.map(([coll, field]) => ctx.store.listSince(ctx.uid, coll, field, from)));
  const changes = {};
  let count = 0;
  CHANGE_FIELDS.forEach(([coll], i) => {
    if (!lists[i].length) return;
    count += lists[i].length;
    changes[coll] = lists[i].map((d) => (coll === 'workouts' ? workoutBrief(d) : { id: d.id, ...plain(d) }));
  });
  if (!peek) await ctx.markChecked(ctx.now);
  return { since: plain(from), until: plain(ctx.now), count, changes };
}

// ---------- write tools ----------

async function logMeal(args, ctx) {
  const today = israelDateKey(ctx.now);
  const bad = writableDate(args.date, today);
  if (bad) fail(bad);
  const when = localMoment(args.date, args.time);
  const doc = {
    date: ctx.store.timestamp(when),
    mealType: args.mealType,
    description: args.description.trim(),
    calories: Math.round(args.calories),
    proteinG: round(args.proteinG, 1),
    carbsG: round(args.carbsG, 1),
    fatG: round(args.fatG, 1),
    source: 'coach',
  };
  const [start, end] = dayBounds(args.date);
  const sameDay = await ctx.store.listTimed(ctx.uid, 'nutritionEntries', 'date', start, end);
  const id = await ctx.store.addDoc(ctx.uid, 'nutritionEntries', doc);
  return {
    written: { path: `nutritionEntries/${id}`, ...plain(doc) },
    dayTotals: mealTotals([...sameDay, doc]),
    otherMealsThatDay: sameDay.map((m) => ({ id: m.id, time: plain(m.date), description: m.description, calories: m.calories })),
  };
}

async function logWeight(args, ctx) {
  const bad = writableDate(args.date, israelDateKey(ctx.now));
  if (bad) fail(bad);
  const existing = await ctx.store.getDoc(ctx.uid, 'bodyWeight', args.date);
  if (existing && !args.replace) fail(`${args.date} already has a weigh-in (${existing.kg} kg). Ask the user, then call again with replace: true.`);
  const doc = { date: args.date, kg: round(args.kg, 2), note: args.note ?? '', loggedAt: ctx.store.serverTimestamp(), source: 'coach' };
  await ctx.store.setDoc(ctx.uid, 'bodyWeight', args.date, doc);
  return { written: { path: `bodyWeight/${args.date}`, date: doc.date, kg: doc.kg, note: doc.note }, replaced: existing ? existing.kg : null };
}

async function logSleep(args, ctx) {
  const bad = writableDate(args.date, israelDateKey(ctx.now));
  if (bad) fail(bad);
  const night = buildNight(args.date, args.bedtime, args.wakeTime);
  if (!night) fail('wakeTime must come after bedtime (a bedtime from 12:00 on is the evening before the morning `date`).');
  const [existing, userDoc] = await Promise.all([ctx.store.getDoc(ctx.uid, 'sleep', args.date), ctx.store.userDoc(ctx.uid)]);
  if (existing && !args.replace) fail(`The night into ${args.date} is already logged (${plain(existing.bedtime)} → ${plain(existing.wakeTime)}). Ask the user, then call again with replace: true.`);
  const ts = ctx.store.serverTimestamp();
  const doc = {
    date: args.date,
    bedtime: ctx.store.timestamp(night.bedtime),
    wakeTime: ctx.store.timestamp(night.wakeTime),
    durationMin: night.durationMin,
    source: 'coach',
    updatedAt: ts,
    ...(existing ? {} : { createdAt: ts }),
  };
  await ctx.store.setDoc(ctx.uid, 'sleep', args.date, doc, { merge: true });
  return { written: { path: `sleep/${args.date}`, ...nightOut(night, sleepSettings(userDoc)), source: 'coach' } };
}

// The whole mark for one habit's day, per docs/DATA.md ("Habit logs").
export function buildMark(habit, args, old, toTimestamp) {
  if (isBad(habit)) {
    const slips = slipsOf(old);
    if (args.slipAt) {
      if (habit.measure === 'limit') fail(`"${habit.name}" is measured as a limit — send value (${habit.unit || 'amount'}) instead of slipAt.`);
      const all = [...slips, toTimestamp(localMoment(args.date, args.slipAt))];
      const mark = { clean: false, slips: all, value: all.length };
      return { ...mark, level: badDayLevel(habit, mark), source: 'coach' };
    }
    if (args.value !== undefined) {
      if (habit.measure !== 'limit') fail(`"${habit.name}" counts slips — send slipAt or clean, not value.`);
      return { clean: false, slips, value: args.value, level: levelFor(habit, args.value), source: 'coach' };
    }
    if (args.clean) {
      if (slips.length) fail(`A slip is already logged on ${args.date}; a slip wins over a clean day, so it can't be marked clean.`);
      return { clean: true, slips: [], value: 0, level: 'full', source: 'coach' };
    }
    fail(`"${habit.name}" is a habit to quit — send clean: true, slipAt, or (limit) value.`);
  }
  if (args.clean || args.slipAt) fail(`"${habit.name}" is a habit to build — send level, value or stepsDone.`);
  if (habit.measure === 'steps') {
    if (!args.stepsDone) fail(`"${habit.name}" is a routine — send stepsDone (indexes into its steps: ${habit.steps.map((s, i) => `${i}=${s}`).join(', ')}).`);
    const done = [...new Set(args.stepsDone)].filter((i) => i < habit.steps.length).sort((a, b) => a - b);
    return { level: routineLevel(habit, done) ?? 'none', value: null, stepsDone: done, source: 'coach' };
  }
  if (args.value !== undefined && (habit.measure === 'quantity' || habit.measure === 'limit')) {
    return { level: levelFor(habit, args.value), value: args.value, source: 'coach' };
  }
  if (!args.level) fail(`Send level (full | short | none)${habit.measure === 'yesno' ? '' : ' or value'} for "${habit.name}".`);
  if (args.level === 'short' && habit.short === null && habit.measure === 'yesno') fail(`"${habit.name}" has no short level — use full or none.`);
  return { level: args.level, value: args.value ?? null, source: 'coach' };
}

async function markHabit(args, ctx) {
  const bad = writableDate(args.date, israelDateKey(ctx.now));
  if (bad) fail(bad);
  const raw = await ctx.store.getDoc(ctx.uid, 'habits', args.habitId);
  if (!raw) fail(`No habit with id ${args.habitId} — call get_habits for the ids.`);
  const habit = normalizeHabit({ id: args.habitId, ...raw });
  const day = await ctx.store.getDoc(ctx.uid, 'habitLogs', args.date);
  const old = day?.habits?.[args.habitId] || null;
  const mark = buildMark(habit, args, old, (d) => ctx.store.timestamp(d));
  // Nested map + merge: only this habit's key changes (docs/DATA.md).
  await ctx.store.setDoc(ctx.uid, 'habitLogs', args.date, {
    date: args.date,
    habits: { [args.habitId]: mark },
    updatedAt: ctx.store.serverTimestamp(),
  }, { merge: true });
  return {
    written: { path: `habitLogs/${args.date}`, habit: habit.name, mark: plain(mark) },
    replaced: old ? plain(old) : null,
    ...(habit.autoSource ? { note: 'This habit is counted automatically; a mark overrides the automatic count for that day.' } : {}),
  };
}

async function logDailyActivity(args, ctx) {
  const bad = writableDate(args.date, israelDateKey(ctx.now));
  if (bad) fail(bad);
  const existing = await ctx.store.getDoc(ctx.uid, 'dailyActivity', args.date);
  if (existing && Number(existing.steps) > args.steps && !args.replace) {
    fail(`${args.date} already has ${existing.steps} steps (more than ${args.steps}). Steps don't go down unless the user asks — then call again with replace: true.`);
  }
  const base = existing?.baseKcal ?? ACTIVITY.baseKcal;
  const workoutKcal = existing?.workoutKcal ?? 0; // the app's own; never written here
  const sk = stepsKcal(args.steps);
  const patch = {
    date: args.date,
    steps: args.steps,
    stepsKcal: sk,
    totalOutKcal: base + sk + workoutKcal,
    loggedAt: ctx.store.serverTimestamp(),
    source: 'coach',
    ...(existing ? {} : { baseKcal: base, workoutKcal: 0, note: '' }),
  };
  await ctx.store.setDoc(ctx.uid, 'dailyActivity', args.date, patch, { merge: true });
  return { written: { path: `dailyActivity/${args.date}`, steps: args.steps, stepsKcal: sk, baseKcal: base, workoutKcal, totalOutKcal: patch.totalOutKcal } };
}

// ---------- the list ----------

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const L = MCP.limits;

export const TOOLS = [
  {
    name: 'get_today',
    title: 'היום',
    description: 'One day at a glance (default today, Israel time): sleep, meals vs calorie/protein target, steps and burn, weight, every habit with its mark, workouts, the planned workout, and points/level.',
    inputSchema: obj({ date: DATE }),
    annotations: READ,
    run: getToday,
  },
  {
    name: 'get_habits',
    title: 'הרגלים',
    description: 'Active habits (good ones to build, bad ones to quit) with their ids, targets and each day\'s level (full/short/none/null = not marked) for the last `days` days.',
    inputSchema: obj({ days: DAYS }),
    annotations: READ,
    run: getHabits,
  },
  {
    name: 'get_sleep',
    title: 'שינה',
    description: 'Nights of the last `days` days (keyed by the MORNING date) with bedtime, wake time, duration and how they were judged, plus the user\'s sleep settings.',
    inputSchema: obj({ days: DAYS }),
    annotations: READ,
    run: getSleep,
  },
  {
    name: 'get_meals',
    title: 'ארוחות',
    description: 'Meals of the last `days` days, grouped by day with daily totals (kcal, protein, carbs, fat).',
    inputSchema: obj({ days: DAYS }),
    annotations: READ,
    run: getMeals,
  },
  {
    name: 'get_workouts',
    title: 'אימונים',
    description: `Workouts of the last \`days\` days, newest first (at most ${MCP.maxWorkouts}). full: true returns every exercise and set.`,
    inputSchema: obj({ days: DAYS, full: { type: 'boolean', default: false } }),
    annotations: READ,
    run: getWorkouts,
  },
  {
    name: 'get_weights',
    title: 'שקילות',
    description: 'Weigh-ins (kg, one per day) of the last `days` days and their average.',
    inputSchema: obj({ days: DAYS }),
    annotations: READ,
    run: getWeights,
  },
  {
    name: 'get_points',
    title: 'נקודות ורמה',
    description: 'Total points, today\'s points, level and the next one, badges earned, and points per day for the last `days` days. Points are scored by the app itself — they can\'t be written.',
    inputSchema: obj({ days: DAYS }),
    annotations: READ,
    run: getPoints,
  },
  {
    name: 'get_profile',
    title: 'פרופיל',
    description: 'The user\'s targets and settings: calories, deficit, protein, sleep rules, weekly workout goal, chosen reward, and exact exercise names. Also today\'s Israel date.',
    inputSchema: obj({}),
    annotations: READ,
    run: getProfile,
  },
  {
    name: 'get_changes',
    title: 'מה השתנה',
    description: 'Everything added or updated since the last call of this tool (or since `since`, ISO time): sleep, habits and marks, weigh-ins, steps, plans, points, new meals and workouts. One call for the evening check. Moves the "last check" mark to now unless peek: true.',
    inputSchema: obj({ since: { type: 'string', maxLength: 40, description: 'ISO date-time, e.g. 2026-11-10T08:00:00+02:00' }, peek: { type: 'boolean', default: false } }),
    annotations: READ,
    run: getChanges,
  },
  {
    name: 'log_meal',
    title: 'רישום ארוחה',
    description: 'Add a meal. Show the user the meal and the numbers (estimates — say the assumed portions) and get a yes first. Check get_today for a similar meal that day to avoid duplicates.',
    inputSchema: obj({
      date: DATE,
      time: CLOCK,
      mealType: { type: 'string', maxLength: 30, description: 'breakfast · lunch · dinner · snack, or short Hebrew text' },
      description: { type: 'string', minLength: 1, maxLength: 300, description: 'What was eaten, Hebrew' },
      calories: range(L.calories, 'kcal'),
      proteinG: range(L.macroG, 'grams'),
      carbsG: range(L.macroG, 'grams'),
      fatG: range(L.macroG, 'grams'),
    }, ['date', 'mealType', 'description', 'calories', 'proteinG', 'carbsG', 'fatG']),
    annotations: WRITE,
    run: logMeal,
  },
  {
    name: 'log_weight',
    title: 'שקילה',
    description: 'Log the day\'s weigh-in (one per day). Refuses to overwrite an existing one unless replace: true.',
    inputSchema: obj({ date: DATE, kg: range(L.kg, 'kg, up to 2 decimals'), note: { type: 'string', maxLength: 200 }, replace: REPLACE }, ['date', 'kg']),
    annotations: WRITE,
    run: logWeight,
  },
  {
    name: 'log_sleep',
    title: 'רישום שינה',
    description: 'Log a night. `date` is the MORNING the user woke up; bedtime from 12:00 on counts as the evening before. Refuses to overwrite a logged night unless replace: true.',
    inputSchema: obj({ date: DATE, bedtime: CLOCK, wakeTime: CLOCK, replace: REPLACE }, ['date', 'bedtime', 'wakeTime']),
    annotations: WRITE,
    run: logSleep,
  },
  {
    name: 'mark_habit',
    title: 'סימון הרגל',
    description: 'Mark one habit for one day (only that habit changes). Habit to build: level (full | short | none), or value for quantity/limit habits (the level is worked out), or stepsDone for a routine. Habit to quit: clean: true for a reported clean day, slipAt (hh:mm) to add a slip, or value for a limit habit. Get ids from get_habits.',
    inputSchema: obj({
      habitId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', description: 'From get_habits' },
      date: DATE,
      level: { type: 'string', enum: ['full', 'short', 'none'] },
      value: range(L.habitValue, 'The number, in the habit\'s unit'),
      stepsDone: { type: 'array', maxItems: 30, items: { type: 'integer', minimum: 0, maximum: 29 } },
      clean: { type: 'boolean' },
      slipAt: CLOCK,
    }, ['habitId', 'date']),
    annotations: WRITE,
    run: markHabit,
  },
  {
    name: 'log_daily_activity',
    title: 'צעדים ושריפה',
    description: 'Set the day\'s steps; the burn (stepsKcal, totalOutKcal) is worked out the app\'s way and the workouts\' burn is kept. Refuses to lower a higher count unless replace: true.',
    inputSchema: obj({ date: DATE, steps: { type: 'integer', minimum: L.steps[0], maximum: L.steps[1] }, replace: REPLACE }, ['date', 'steps']),
    annotations: WRITE,
    run: logDailyActivity,
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// What tools/list returns.
export const toolList = () => TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
  name, title, description, inputSchema, annotations,
}));

// → an MCP tool result. Bad arguments and refusals come back as
// isError results (Claude reads them and retries); anything else throws.
export async function callTool(name, args, ctx) {
  const tool = BY_NAME.get(name);
  if (!tool) return null;
  const v = validateArgs(tool.inputSchema, args);
  const result = (data, isError = false) => ({
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
    ...(isError ? { isError: true } : {}),
  });
  if (!v.ok) return result(`Invalid arguments: ${v.error}`, true);
  try {
    return result(await tool.run(v.value, ctx));
  } catch (err) {
    if (err instanceof ToolError) return result(err.message, true);
    throw err;
  }
}
